import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { generateInvoiceXlsx } from "../core/docs/hpe/invoice.js";
import { readCleanedSpecXlsx } from "../core/docs/hpe/read-cleaned-spec.js";
import { loadDeviceTypeDictionary } from "../core/docs/hpe/device-type-dict.js";
import { classifyDeviceType } from "../core/type-system/v1/index.js";
import { runHpeDiagnostics } from "./diagnostics/hpe.js";

const DEFAULT_TEMPLATE_PATH = "assets/templates/Шаблон инвойса.xlsx";
const TEMPLATE_ENV_VAR = "JARVIS_TEMPLATE_INVOICE";
const SKIP_DIAGNOSTICS_ENV_VAR = "JARVIS_SKIP_DIAGNOSTICS";

const usage = () => {
  console.log(
    [
      "Usage: node scripts/docs-hpe-invoice.js --spec <cleaned.xlsx> --out <out.xlsx> [--template <template.xlsx>]",
      "",
      `Default template: ${DEFAULT_TEMPLATE_PATH}`,
      `Template override order: --template > ${TEMPLATE_ENV_VAR} > default path`,
      "",
      "Examples:",
      "  node scripts/docs-hpe-invoice.js --template \"C:\\\\path\\\\Шаблон инвойса.xlsx\"",
      `  ${TEMPLATE_ENV_VAR}=./templates/invoice.xlsx node scripts/docs-hpe-invoice.js`,
    ].join("\n")
  );
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help") {
      return { help: true };
    }
    if (arg === "--spec" || arg === "--template" || arg === "--out" || arg === "--device-dict") {
      const next = args[i + 1];
      if (!next) {
        return { error: `Missing value for ${arg}` };
      }
      if (arg === "--spec") {
        options.specPath = next;
      } else if (arg === "--template") {
        options.templatePath = next;
      } else if (arg === "--out") {
        options.outPath = next;
      } else if (arg === "--device-dict") {
        options.deviceDictPath = next;
      }
      i += 1;
      continue;
    }

    return { error: `Unexpected argument: ${arg}` };
  }

  return options;
};

const resolveDefaultPath = (relativePath) => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.resolve(__dirname, "..", relativePath);
};

const ensureDir = async (targetPath) => {
  const dir = path.dirname(targetPath);
  await fs.promises.mkdir(dir, { recursive: true });
};

const createDefaultCleanedSpec = async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-"));
  const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
  const rows = [
    ["#", "Part Number", "Description", "Device Type", "Тип устройства (RU)", "Qty Components", "Qty Servers"],
    [1, "SAMPLE-001", "Sample Item", "Server", "Сервер", 1, 1],
  ];
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, "Cleaned");
  xlsx.writeFile(workbook, cleanedSpecPath);
  return cleanedSpecPath;
};

const normalizeCellValue = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
};

const normalizeHeaderKey = (value) =>
  normalizeCellValue(value)
    .replace(/\s+/g, " ")
    .toLowerCase();

const findItemsHeaderRow = (sheet) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return null;
  }

  const required = new Set([
    normalizeHeaderKey("Part Number"),
    normalizeHeaderKey("Description"),
    normalizeHeaderKey("Qty components"),
  ]);

  const maxRow = Math.min(range.e.r, range.s.r + 40);
  for (let r = range.s.r; r <= maxRow; r += 1) {
    const found = new Set();
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeHeaderKey(cell?.v);
      if (required.has(value)) {
        found.add(value);
      }
    }
    if (found.size === required.size) {
      return r + 1;
    }
  }

  return null;
};

const findCellByValue = (sheet, targetValue) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return null;
  }

  const target = normalizeCellValue(targetValue);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (normalizeCellValue(cell?.v) === target) {
        return { rowIndex: r + 1, colIndex: c + 1 };
      }
    }
  }

  return null;
};

const clearInvoiceItemRows = (templatePath) => {
  const workbook = xlsx.readFile(templatePath, { cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return templatePath;
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return templatePath;
  }

  const headerRow = findItemsHeaderRow(sheet);
  if (!headerRow) {
    return templatePath;
  }

  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return templatePath;
  }

  const startRow = headerRow + 1;
  const anchors = [findCellByValue(sheet, "[Terms & Conditions:]"), findCellByValue(sheet, "[Bank Account]")]
    .map((anchor) => anchor?.rowIndex)
    .filter((row) => row && row >= startRow);
  const endRow = anchors.length > 0 ? Math.min(...anchors) - 1 : range.e.r + 1;

  if (endRow < startRow) {
    return templatePath;
  }

  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = xlsx.utils.encode_cell({ r: rowIndex - 1, c });
      const cell = sheet[ref];
      if (!cell) {
        continue;
      }
      delete cell.f;
      delete cell.w;
      cell.t = "s";
      cell.v = "";
    }
  }

  if (sheet["!merges"]) {
    const startIndex = startRow - 1;
    const endIndex = endRow - 1;
    sheet["!merges"] = sheet["!merges"].filter((merge) => {
      const start = merge.s.r;
      const end = merge.e.r;
      return !(start >= startIndex && end <= endIndex);
    });
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hpe-invoice-template-"));
  const tempPath = path.join(tempDir, path.basename(templatePath));
  xlsx.writeFile(workbook, tempPath, { cellStyles: true });
  return tempPath;
};

const readItemsJsonl = (itemsPath) => {
  const contents = fs.readFileSync(itemsPath, "utf8");
  return contents
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const buildInvoiceItemsFromItemsLayer = (records) =>
  records.map((record, index) => ({
    lineNo: index + 1,
    itemId: record?.id ?? null,
    partNumber:
      record?.product_number ??
      record?.part_number ??
      record?.productNumber ??
      record?.partNumber ??
      "",
    description: record?.description ?? "",
    qty: record?.qty ?? 0,
    deviceType: record?.device_type ?? record?.deviceType ?? "",
    lineType: record?.line_type ?? record?.lineType ?? "",
    vendor: record?.vendor ?? "HPE",
  }));

const isValidationError = (error) =>
  error instanceof Error &&
  (error.message.startsWith("Cleaned spec is missing required columns:") ||
    error.message === "Invoice template has no worksheets." ||
    error.message === "Invoice template worksheet is empty." ||
    error.message.startsWith("invoice template does not match expected format"));

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    usage();
    process.exit(0);
  }
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(1);
  }

  let specPath = parsed.specPath || resolveDefaultPath("samples/hpe_docs/отладочный шаблон 1_cleaned.xlsx");
  const templateOverride = parsed.templatePath || process.env[TEMPLATE_ENV_VAR];
  let templatePath = templateOverride ? path.resolve(templateOverride) : resolveDefaultPath(DEFAULT_TEMPLATE_PATH);
  const outPath = parsed.outPath || resolveDefaultPath("out/hpe_invoice.xlsx");
  const deviceDictPath = parsed.deviceDictPath || resolveDefaultPath("assets/templates/device_type_dictionary_template.xlsx");
  const itemsLayerPath = path.join(path.dirname(outPath), "items.jsonl");

  console.log(`Using invoice template: ${templatePath}`);

  if (!fs.existsSync(specPath)) {
    if (parsed.specPath) {
      console.error(`Cleaned spec not found: ${specPath}`);
      process.exit(1);
    } else {
      specPath = await createDefaultCleanedSpec();
    }
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`Invoice template not found: ${templatePath}`);
    process.exit(1);
  }

  let deviceTypeDictionary;
  if (fs.existsSync(deviceDictPath)) {
    deviceTypeDictionary = loadDeviceTypeDictionary(deviceDictPath);
  }

  let itemsLayerRecords = [];
  let invoiceItems = [];
  let shouldUseItemsLayer = false;
  if (fs.existsSync(itemsLayerPath)) {
    itemsLayerRecords = readItemsJsonl(itemsLayerPath);
    if (itemsLayerRecords.length === 0) {
      console.error(`No items found in ${itemsLayerPath}.`);
      process.exit(1);
    }
    invoiceItems = buildInvoiceItemsFromItemsLayer(itemsLayerRecords);
    shouldUseItemsLayer = true;
    console.log(`Items layer path: ${itemsLayerPath}`);
    console.log(`Items layer rows read: ${itemsLayerRecords.length}`);
  } else {
    const items = readCleanedSpecXlsx(specPath, { deviceTypeDictionary });
    if (items.length === 0) {
      console.error("No items found in cleaned spec.");
      process.exit(1);
    }

    invoiceItems = items.map((item) => {
      const classification = classifyDeviceType({
        description: item.description,
        partNumber: item.partNumber,
        vendor: item.vendor,
      });
      return {
        ...item,
        deviceType: classification.device_type,
      };
    });
  }

  await ensureDir(outPath);
  const clearedTemplatePath = clearInvoiceItemRows(templatePath);
  const result = await generateInvoiceXlsx({
    templatePath: clearedTemplatePath,
    items: invoiceItems,
    outPath,
    itemsLayer: shouldUseItemsLayer ? itemsLayerRecords : undefined,
    itemsLayerPath: shouldUseItemsLayer ? itemsLayerPath : undefined,
    segmentsPath: path.join(path.dirname(outPath), "segments.json"),
  });
  if (result?.missingAnchors?.length) {
    console.warn(`Invoice template is missing recommended anchors: ${result.missingAnchors.join(", ")}`);
  }

  if (shouldUseItemsLayer) {
    console.log(`Invoice rows written: ${invoiceItems.length}`);
  }

  console.log(`Invoice generated: ${outPath}`);

  if (process.env[SKIP_DIAGNOSTICS_ENV_VAR]) {
    console.log("Diagnostics snapshot skipped (JARVIS_SKIP_DIAGNOSTICS set).");
  } else {
    try {
      const diagnostics = await runHpeDiagnostics({
        inputPath: specPath,
        outPath,
        itemsPath: itemsLayerPath,
      });
      console.log(`Diagnostics snapshot: ${diagnostics.runDir}`);
      console.log(`Diagnostics history entries: ${diagnostics.historyCount}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Diagnostics warning: ${message}`);
    }
  }
};

try {
  await main();
} catch (error) {
  if (isValidationError(error)) {
    console.error(`Error: ${error.message}`);
  } else {
    console.error(error);
  }
  process.exitCode = 1;
}
