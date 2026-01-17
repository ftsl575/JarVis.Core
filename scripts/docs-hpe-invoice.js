import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(1);
  }

  const specPath = parsed.specPath || resolveDefaultPath("samples/hpe_docs/отладочный шаблон 1_cleaned.xlsx");
  const templatePath = parsed.templatePath || resolveDefaultPath("assets/templates/Шаблон инвойса.xlsx");
  const outPath = parsed.outPath || resolveDefaultPath("out/hpe_invoice.xlsx");
  const deviceDictPath = parsed.deviceDictPath || resolveDefaultPath("assets/templates/device_type_dictionary_template.xlsx");

  if (!fs.existsSync(specPath)) {
    console.error(`Cleaned spec not found: ${specPath}`);
    process.exit(1);
  }
  if (!fs.existsSync(templatePath)) {
    console.error(`Invoice template not found: ${templatePath}`);
    process.exit(1);
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

main();
