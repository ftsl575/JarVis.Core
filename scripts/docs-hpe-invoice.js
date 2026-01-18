import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { generateInvoiceXlsx } from "../core/docs/hpe/invoice.js";
import { readCleanedSpecXlsx } from "../core/docs/hpe/read-cleaned-spec.js";
import { loadDeviceTypeDictionary } from "../core/docs/hpe/device-type-dict.js";

const usage = () => {
  console.error("Usage: node scripts/docs-hpe-invoice.js --spec <cleaned.xlsx> --template <template.xlsx> --out <out.xlsx>");
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
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

const createDefaultInvoiceTemplate = async () => {
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "hpe-invoice-template-"));
  const templatePath = path.join(tempDir, "template.xlsx");
  const rows = [["", "#", "Part Number", "Description", "Device Type", "Qty components"]];
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, "Invoice");
  xlsx.writeFile(workbook, templatePath);
  return templatePath;
};

const isValidationError = (error) =>
  error instanceof Error &&
  (error.message.startsWith("Cleaned spec is missing required columns:") ||
    error.message === "Invoice template has no worksheets." ||
    error.message === "Invoice template worksheet is empty.");

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(1);
  }

  let specPath = parsed.specPath || resolveDefaultPath("samples/hpe_docs/отладочный шаблон 1_cleaned.xlsx");
  let templatePath = parsed.templatePath || resolveDefaultPath("assets/templates/Шаблон инвойса.xlsx");
  const outPath = parsed.outPath || resolveDefaultPath("out/hpe_invoice.xlsx");
  const deviceDictPath = parsed.deviceDictPath || resolveDefaultPath("assets/templates/device_type_dictionary_template.xlsx");

  if (!fs.existsSync(specPath)) {
    if (parsed.specPath) {
      console.error(`Cleaned spec not found: ${specPath}`);
      process.exit(1);
    } else {
      specPath = await createDefaultCleanedSpec();
    }
  }
  if (!fs.existsSync(templatePath)) {
    if (parsed.templatePath) {
      console.error(`Invoice template not found: ${templatePath}`);
      process.exit(1);
    } else {
      const generatedTemplate = await createDefaultInvoiceTemplate();
      console.warn(`Invoice template not found at ${templatePath}. Using generated template.`);
      templatePath = generatedTemplate;
    }
  }

  let deviceTypeDictionary;
  if (fs.existsSync(deviceDictPath)) {
    deviceTypeDictionary = loadDeviceTypeDictionary(deviceDictPath);
  }

  const items = readCleanedSpecXlsx(specPath, { deviceTypeDictionary });
  if (items.length === 0) {
    console.error("No items found in cleaned spec.");
    process.exit(1);
  }

  await ensureDir(outPath);
  await generateInvoiceXlsx({ templatePath, items, outPath });

  console.log(`Invoice generated: ${outPath}`);
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
