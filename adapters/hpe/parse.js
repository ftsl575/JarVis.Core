import path from "node:path";
import xlsx from "xlsx";

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return value;
};

const cellToString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value);
};

const findHeader = (sheet, range) => {
  const maxRow = Math.min(range.e.r, range.s.r + 19);
  let bestMatch = null;

  for (let r = range.s.r; r <= maxRow; r += 1) {
    const matches = {
      rowIndex: r + 1,
      qty: null,
      productNumber: null,
      description: null,
      matchCount: 0,
    };

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeCellValue(cell?.v);
      if (typeof value !== "string" || !value) {
        continue;
      }
      if (!matches.qty && /^qty$/i.test(value)) {
        matches.qty = c + 1;
        matches.matchCount += 1;
      }
      if (!matches.productNumber && /^product\s*#$/i.test(value)) {
        matches.productNumber = c + 1;
        matches.matchCount += 1;
      }
      if (!matches.description && /^product\s*descript/i.test(value)) {
        matches.description = c + 1;
        matches.matchCount += 1;
      }
    }

    if (matches.matchCount > 0 && (!bestMatch || matches.matchCount > bestMatch.matchCount)) {
      bestMatch = matches;
    }

    if (matches.qty && matches.productNumber && matches.description) {
      bestMatch = matches;
      break;
    }
  }

  if (!bestMatch) {
    return {
      headerRowIndex: null,
      columnMap: { qty: null, product_number: null, description: null },
    };
  }

  return {
    headerRowIndex: bestMatch.rowIndex,
    columnMap: {
      qty: bestMatch.qty,
      product_number: bestMatch.productNumber,
      description: bestMatch.description,
    },
  };
};

const parseQty = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
};

const getCellFromRow = (cells, range, columnIndex) => {
  if (!columnIndex) {
    return null;
  }
  const offset = columnIndex - 1 - range.s.c;
  if (offset < 0 || offset >= cells.length) {
    return null;
  }
  return cells[offset];
};

const toLine = ({
  cells,
  rawText,
  rowIndex,
  headerRowIndex,
  columnMap,
  source,
  range,
}) => {
  const qtyValue = getCellFromRow(cells, range, columnMap.qty);
  const productValue = getCellFromRow(cells, range, columnMap.product_number);
  const descriptionValue = getCellFromRow(cells, range, columnMap.description);

  const parsedQty = parseQty(qtyValue);
  const productNumber = productValue ? cellToString(productValue) : null;
  const description = descriptionValue ? cellToString(descriptionValue) : null;

  const warnings = [];
  if (parsedQty !== null && parsedQty > 0 && !productNumber) {
    warnings.push({
      code: "MISSING_PARTNUMBER",
      message: "Quantity present but product number is missing.",
    });
  }
  if (productNumber && parsedQty === null) {
    warnings.push({
      code: "MISSING_QTY",
      message: "Product number present but quantity is missing.",
    });
  }

  let lineType = "unknown";
  if (parsedQty !== null && parsedQty > 0 && productNumber) {
    lineType = "item";
  } else if (rawText && !productNumber && parsedQty === null) {
    lineType = "header";
  } else if (/factory integrated/i.test(rawText)) {
    lineType = "note";
  }

  const line = {
    canonical_version: "1.0",
    source: {
      ...source,
      row_index: rowIndex,
      header_row_index: headerRowIndex,
      column_map: columnMap,
    },
    raw: {
      cells,
      text: rawText,
    },
    parsed: {
      qty: parsedQty,
      product_number: productNumber || null,
      description: description || null,
    },
    line_type: lineType,
    warnings,
    id: `${source.file}::${source.sheet}::${rowIndex}`,
  };

  return line;
};

const createEmptyResult = () => ({
  canonicalRecords: [],
  itemRecords: [],
  linesTotal: 0,
  linesExported: 0,
  itemsExported: 0,
  warningsTotal: 0,
  warningCounts: {},
  sheetsProcessed: 0,
});

export const parseHpeWorkbook = (inputPath, { inputDir } = {}) => {
  let workbook;
  try {
    workbook = xlsx.readFile(inputPath, { cellDates: false });
  } catch (error) {
    const message = error?.message ? `${error.message}` : "Unknown error";
    throw new Error(`Failed to read xlsx file: ${inputPath}. ${message}`);
  }

  const sheetNames = workbook.SheetNames || [];
  if (sheetNames.length === 0) {
    return createEmptyResult();
  }

  const preferredSheet = sheetNames.find((name) => name === "BOM") || sheetNames[0];
  const sheet = workbook.Sheets[preferredSheet];
  if (!sheet || !sheet["!ref"]) {
    return createEmptyResult();
  }

  const result = createEmptyResult();
  result.sheetsProcessed = 1;

  const recordWarning = (code) => {
    result.warningCounts[code] = (result.warningCounts[code] || 0) + 1;
    result.warningsTotal += 1;
  };

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const { headerRowIndex, columnMap } = findHeader(sheet, range);

  if (!columnMap.qty) {
    recordWarning("MISSING_COLUMN_QTY");
  }
  if (!columnMap.product_number) {
    recordWarning("MISSING_COLUMN_PRODUCT_NUMBER");
  }
  if (!columnMap.description) {
    recordWarning("MISSING_COLUMN_DESCRIPTION");
  }

  const startRowIndex = headerRowIndex ? headerRowIndex + 1 : range.s.r + 1;
  const width = range.e.c - range.s.c + 1;
  const relativeFile = inputDir ? path.relative(inputDir, inputPath) : path.basename(inputPath);

  for (let r = startRowIndex - 1; r <= range.e.r; r += 1) {
    const rowIndex = r + 1;
    result.linesTotal += 1;

    const cells = Array.from({ length: width }, (_, idx) => {
      const c = range.s.c + idx;
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      return normalizeCellValue(cell?.v);
    });

    const rawParts = cells
      .map((value) => cellToString(value))
      .filter((value) => value !== "");
    const rawText = rawParts.join(" | ");

    if (!rawText) {
      recordWarning("EMPTY_ROW_SKIPPED");
      continue;
    }

    const source = {
      vendor: "HPE",
      file: relativeFile,
      sheet: preferredSheet,
    };

    const line = toLine({
      cells,
      rawText,
      rowIndex,
      headerRowIndex,
      columnMap,
      source,
      range,
    });

    result.linesExported += 1;
    result.canonicalRecords.push(line);

    for (const warning of line.warnings) {
      recordWarning(warning.code);
    }

    if (line.line_type === "item") {
      result.itemsExported += 1;
      result.itemRecords.push({
        id: line.id,
        source: line.source,
        qty: line.parsed.qty,
        product_number: line.parsed.product_number,
        description: line.parsed.description,
        raw_ref: {
          file: line.source.file,
          sheet: line.source.sheet,
          row_index: line.source.row_index,
        },
      });
    }
  }

  return result;
};
