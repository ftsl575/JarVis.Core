import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { parseHpeWorkbook } from "../adapters/hpe/parse.js";

const INPUT_DIR = path.resolve("samples/hpe");
const OUTPUT_DIR = path.resolve("out/hpe_cleaned");
const CLEANED_HEADERS = [
  "#",
  "Part Number",
  "Description",
  "Device Type",
  "Тип устройства (RU)",
  "Qty Components",
  "Qty Servers",
];

const isExcludedName = (name) => {
  const lowered = name.toLowerCase();
  return (
    lowered.endsWith("_cleaned.xlsx") ||
    lowered.endsWith("_invoice.xlsx") ||
    lowered.startsWith("~$")
  );
};

export const selectHpeBatchInputs = (names) =>
  names.filter((name) => {
    const lowered = name.toLowerCase();
    if (!lowered.endsWith(".xlsx")) {
      return false;
    }
    return !isExcludedName(name);
  });

const buildCleanedRows = (items) => [
  CLEANED_HEADERS,
  ...items.map((item, index) => [
    index + 1,
    item.product_number ?? "",
    item.description ?? "",
    "",
    "",
    item.qty ?? "",
    "",
  ]),
];

const writeCleanedSpecXlsx = (items, outPath) => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(buildCleanedRows(items));
  xlsx.utils.book_append_sheet(workbook, sheet, "Cleaned");
  xlsx.writeFile(workbook, outPath);
};

const formatError = (error) => {
  if (!error) {
    return "Unknown error";
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return String(error);
};

const main = async () => {
  let entries;
  try {
    entries = await fs.promises.readdir(INPUT_DIR, { withFileTypes: true });
  } catch (error) {
    console.error(`Failed to read input directory: ${INPUT_DIR}`);
    console.error(formatError(error));
    process.exit(1);
  }

  const names = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const inputs = selectHpeBatchInputs(names);

  console.log(`HPE batch clean: ${inputs.length} file(s)`);

  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

  let ok = 0;
  let failed = 0;

  for (const file of inputs) {
    const inputPath = path.join(INPUT_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, `${path.parse(file).name}_cleaned.xlsx`);

    try {
      const parsed = parseHpeWorkbook(inputPath, { inputDir: INPUT_DIR });
      writeCleanedSpecXlsx(parsed.itemRecords, outputPath);
      ok += 1;
      console.log(`OK: ${inputPath} -> ${outputPath}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL: ${inputPath} — ${formatError(error)}`);
    }
  }

  console.log(`Done: ok=${ok} failed=${failed}`);
  process.exit(failed > 0 ? 1 : 0);
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  main();
}
