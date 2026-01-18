import fs from "node:fs";
import path from "node:path";
import { validateHpeItems } from "../../core/validation/vendor/index.js";
import { parseHpeWorkbook } from "./parse.js";

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

  const canonicalRecords = [];
  const itemRecords = [];
  const warningCounts = {};
  let warningsTotal = 0;
  let linesTotal = 0;
  let linesExported = 0;
  let itemsExported = 0;
  let sheetsProcessed = 0;

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    let parsedWorkbook;
    try {
      parsedWorkbook = parseHpeWorkbook(inputPath, { inputDir });
    } catch (error) {
      console.error(error?.message || `Failed to read xlsx file: ${inputPath}`);
      process.exit(1);
    }

    canonicalRecords.push(...parsedWorkbook.canonicalRecords);
    itemRecords.push(...parsedWorkbook.itemRecords);
    linesTotal += parsedWorkbook.linesTotal;
    linesExported += parsedWorkbook.linesExported;
    itemsExported += parsedWorkbook.itemsExported;
    warningsTotal += parsedWorkbook.warningsTotal;
    sheetsProcessed += parsedWorkbook.sheetsProcessed;
    for (const [code, count] of Object.entries(parsedWorkbook.warningCounts)) {
      warningCounts[code] = (warningCounts[code] || 0) + count;
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
  const hpeValidation = validateHpeItems(canonicalRecords);
  summary.validation = { ...(summary.validation || {}), hpe: hpeValidation };

  const canonicalLines = canonicalRecords.map((line) => JSON.stringify(line));
  const itemLines = itemRecords.map((line) => JSON.stringify(line));

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
