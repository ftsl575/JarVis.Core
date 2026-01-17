import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const usage = () => {
  console.error("Usage: node adapters/hpe/index.js <inputDir> --out <outputDir>");
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  let inputDir;
  let outputDir;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === "--out") {
      const next = args[i + 1];
      if (!next) {
        return { error: "Missing value for --out" };
      }
      outputDir = next;
      i += 1;
      continue;
    }

    if (!inputDir) {
      inputDir = arg;
      continue;
    }

    return { error: `Unexpected argument: ${arg}` };
  }

  if (!inputDir) {
    return { error: "Missing inputDir" };
  }
  if (!outputDir) {
    return { error: "Missing --out <outputDir>" };
  }

  return { inputDir, outputDir };
};

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

const ensureOutDir = async (outputDir) => {
  await fs.promises.mkdir(outputDir, { recursive: true });
};

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(1);
  }

  const { inputDir, outputDir } = parsed;
  const startedAt = new Date();

  let entries;
  try {
    entries = fs.readdirSync(inputDir, { withFileTypes: true });
  } catch (error) {
    console.error(`Failed to read input directory: ${inputDir}`);
    console.error(error.message);
    process.exit(1);
  }

  await ensureOutDir(outputDir);

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith(".xlsx"));

  if (files.length === 0) {
    console.log(`No .xlsx files found in ${inputDir}.`);
    process.exit(0);
  }

  const canonicalLines = [];
  const itemLines = [];
  const warningCounts = {};
  let warningsTotal = 0;
  let linesTotal = 0;
  let linesExported = 0;
  let itemsExported = 0;
  let sheetsProcessed = 0;

  const recordWarning = (code) => {
    warningCounts[code] = (warningCounts[code] || 0) + 1;
    warningsTotal += 1;
  };

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    const relativeFile = path.relative(inputDir, inputPath);
    let workbook;
    try {
      workbook = xlsx.readFile(inputPath, { cellDates: false });
    } catch (error) {
      console.error(`Failed to read xlsx file: ${inputPath}`);
      console.error(error.message);
      process.exit(1);
    }

    const sheetNames = workbook.SheetNames || [];
    if (sheetNames.length === 0) {
      continue;
    }

    const preferredSheet = sheetNames.find((name) => name === "BOM") || sheetNames[0];
    const sheet = workbook.Sheets[preferredSheet];
    if (!sheet || !sheet["!ref"]) {
      continue;
    }

    sheetsProcessed += 1;
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

    for (let r = startRowIndex - 1; r <= range.e.r; r += 1) {
      const rowIndex = r + 1;
      linesTotal += 1;

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

      linesExported += 1;
      canonicalLines.push(JSON.stringify(line));

      for (const warning of line.warnings) {
        recordWarning(warning.code);
      }

      if (line.line_type === "item") {
        itemsExported += 1;
        itemLines.push(
          JSON.stringify({
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
          }),
        );
      }
    }
  }

  const summary = {
    files_processed: files.length,
    sheets_processed: sheetsProcessed,
    lines_total: linesTotal,
    lines_exported: linesExported,
    items_exported: itemsExported,
    warnings_total: warningsTotal,
    warnings_by_code: warningCounts,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  };

  fs.writeFileSync(path.join(outputDir, "canonical.jsonl"), `${canonicalLines.join("\n")}\n`, {
    encoding: "utf8",
  });
  fs.writeFileSync(path.join(outputDir, "items.jsonl"), `${itemLines.join("\n")}\n`, {
    encoding: "utf8",
  });
  fs.writeFileSync(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), {
    encoding: "utf8",
  });
};

main();
