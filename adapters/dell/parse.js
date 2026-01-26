import path from "node:path";
import xlsx from "xlsx";
import { classifyDeviceType } from "../../core/type-system/v1/index.js";

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

const normalizeHeaderText = (value) =>
  cellToString(value)
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

const headerVariants = {
  qty: new Set(["qty"]),
  qtyFallback: new Set(["product qty"]),
  productNumber: new Set(["skus"]),
  description: new Set(["option name"]),
  descriptionFallback: new Set(["product name"]),
};

const findHeader = (sheet, range) => {
  const maxRow = Math.min(range.e.r, range.s.r + 24);
  let bestMatch = null;

  for (let r = range.s.r; r <= maxRow; r += 1) {
    const matches = {
      rowIndex: r + 1,
      qty: null,
      productNumber: null,
      description: null,
      descriptionFallback: null,
      qtyFallback: null,
      matchCount: 0,
    };

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeHeaderText(cell?.v);
      if (!value) {
        continue;
      }
      if (!matches.qty && headerVariants.qty.has(value)) {
        matches.qty = c + 1;
        matches.matchCount += 1;
      }
      if (!matches.qtyFallback && headerVariants.qtyFallback.has(value)) {
        matches.qtyFallback = c + 1;
        matches.matchCount += 1;
      }
      if (!matches.productNumber && headerVariants.productNumber.has(value)) {
        matches.productNumber = c + 1;
        matches.matchCount += 1;
        continue;
      }
      if (!matches.description && headerVariants.description.has(value)) {
        matches.description = c + 1;
        matches.matchCount += 1;
      }
      if (!matches.descriptionFallback && headerVariants.descriptionFallback.has(value)) {
        matches.descriptionFallback = c + 1;
        matches.matchCount += 1;
      }
    }

    if (matches.matchCount > 0 && (!bestMatch || matches.matchCount > bestMatch.matchCount)) {
      bestMatch = matches;
    }

    if (matches.qty && (matches.description || matches.descriptionFallback)) {
      bestMatch = matches;
      break;
    }
  }

  if (!bestMatch) {
    return {
      headerRowIndex: null,
      columnMap: {
        qty: null,
        qty_fallback: null,
        product_number: null,
        description: null,
        description_fallback: null,
      },
      matchCount: 0,
    };
  }

  return {
    headerRowIndex: bestMatch.rowIndex,
    columnMap: {
      qty: bestMatch.qty,
      qty_fallback: bestMatch.qtyFallback,
      product_number: bestMatch.productNumber,
      description: bestMatch.description,
      description_fallback: bestMatch.descriptionFallback,
    },
    matchCount: bestMatch.matchCount,
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

const isDellAnchorCandidate = (description) => {
  if (!description) {
    return false;
  }
  return /\bpoweredge\b/i.test(description);
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
  const qtyFallbackValue = getCellFromRow(cells, range, columnMap.qty_fallback);
  const productValue = getCellFromRow(cells, range, columnMap.product_number);
  const descriptionValue = getCellFromRow(cells, range, columnMap.description);
  const descriptionFallbackValue = getCellFromRow(
    cells,
    range,
    columnMap.description_fallback,
  );

  const parsedQty = parseQty(qtyValue);
  const fallbackQty = parseQty(qtyFallbackValue);
  const productNumber = productValue ? cellToString(productValue) : null;
  const description =
    descriptionValue && cellToString(descriptionValue)
      ? cellToString(descriptionValue)
      : descriptionFallbackValue && cellToString(descriptionFallbackValue)
        ? cellToString(descriptionFallbackValue)
        : null;
  const resolvedQty = parsedQty ?? fallbackQty;

  const hasItemContent = Boolean(description || productNumber);
  let lineType = "unknown";
  let finalQty = resolvedQty;
  if (hasItemContent && (finalQty === null || finalQty === undefined)) {
    finalQty = 1;
  }
  if (finalQty !== null && finalQty > 0 && hasItemContent) {
    lineType = "item";
  } else if (rawText && (finalQty === null || finalQty === undefined)) {
    lineType = "header";
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
      qty: finalQty,
      product_number: productNumber || null,
      description: description || null,
    },
    line_type: lineType,
    warnings: [],
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

const selectBestSheet = (workbook) => {
  const sheetNames = workbook.SheetNames || [];
  let best = null;

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet["!ref"]) {
      continue;
    }
    const range = xlsx.utils.decode_range(sheet["!ref"]);
    const header = findHeader(sheet, range);
    const matchCount = header.matchCount ?? 0;
    if (!best || matchCount > best.matchCount) {
      best = { sheetName, header, range, matchCount };
    }
  }

  if (!best && sheetNames.length > 0) {
    const sheetName = sheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    if (sheet && sheet["!ref"]) {
      return {
        sheetName,
        header: findHeader(sheet, xlsx.utils.decode_range(sheet["!ref"])),
        range: xlsx.utils.decode_range(sheet["!ref"]),
        matchCount: 0,
      };
    }
  }

  return best;
};

export const parseDellWorkbook = (inputPath, { inputDir } = {}) => {
  let workbook;
  try {
    workbook = xlsx.readFile(inputPath, { cellDates: false });
  } catch (error) {
    const message = error?.message ? `${error.message}` : "Unknown error";
    throw new Error(`Failed to read xlsx file: ${inputPath}. ${message}`);
  }

  const best = selectBestSheet(workbook);
  if (!best) {
    return createEmptyResult();
  }

  const { sheetName, header, range } = best;
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return createEmptyResult();
  }

  const result = createEmptyResult();
  result.sheetsProcessed = 1;

  const recordWarning = (code) => {
    result.warningCounts[code] = (result.warningCounts[code] || 0) + 1;
    result.warningsTotal += 1;
  };

  const { headerRowIndex, columnMap } = header;

  if (!columnMap.qty && !columnMap.qty_fallback) {
    recordWarning("MISSING_COLUMN_QTY");
  }
  if (!columnMap.description && !columnMap.description_fallback) {
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
      vendor: "Dell",
      file: relativeFile,
      sheet: sheetName,
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

    const anchorText = line.parsed.description || line.raw.text;
    if (anchorText && isDellAnchorCandidate(anchorText)) {
      line.parsed.is_anchor_candidate = true;
    }

    result.linesExported += 1;
    result.canonicalRecords.push(line);
  }

  const anchorIndex = result.canonicalRecords.findIndex(
    (line) =>
      line.line_type === "item" &&
      line.parsed.is_anchor_candidate &&
      Number.isFinite(line.parsed.qty) &&
      line.parsed.qty > 0,
  );
  const selectedIndex =
    anchorIndex >= 0
      ? anchorIndex
      : result.canonicalRecords.findIndex((line) => line.parsed.is_anchor_candidate);

  if (selectedIndex >= 0) {
    result.canonicalRecords[selectedIndex].parsed.is_anchor = true;
  }

  for (const line of result.canonicalRecords) {
    if (line.line_type !== "item" && !line.parsed.is_anchor) {
      continue;
    }
    const deviceType = classifyDeviceType({
      description: line.parsed.description,
      vendor: line.source.vendor,
      partNumber: line.parsed.product_number,
    });
    const resolvedQty =
      Number.isFinite(line.parsed.qty) && line.parsed.qty > 0 ? line.parsed.qty : 1;
    result.itemsExported += 1;
    result.itemRecords.push({
      id: line.id,
      source: line.source,
      qty: resolvedQty,
      product_number: line.parsed.product_number,
      description: line.parsed.description,
      device_type: deviceType.device_type,
      line_type: line.parsed.is_anchor ? "anchor" : "item",
      raw_ref: {
        file: line.source.file,
        sheet: line.source.sheet,
        row_index: line.source.row_index,
      },
    });
  }

  return result;
};
