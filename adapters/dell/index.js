import fs from "node:fs";
import path from "node:path";
import { parseDellWorkbook } from "./parse.js";

const usage = () => {
  console.error("Usage: node adapters/dell/index.js <inputFile> --out <outputDir>");
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  let inputFile;
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

    if (!inputFile) {
      inputFile = arg;
      continue;
    }

    return { error: `Unexpected argument: ${arg}` };
  }

  if (!inputFile) {
    return { error: "Missing inputFile" };
  }
  if (!outputDir) {
    return { error: "Missing --out <outputDir>" };
  }

  return { inputFile, outputDir };
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

  const { inputFile, outputDir } = parsed;
  const startedAt = new Date();

  if (!fs.existsSync(inputFile)) {
    console.error(`Input file does not exist: ${inputFile}`);
    process.exit(1);
  }

  await ensureOutDir(outputDir);

  let parsedWorkbook;
  try {
    parsedWorkbook = parseDellWorkbook(inputFile, { inputDir: path.dirname(inputFile) });
  } catch (error) {
    console.error(error?.message || `Failed to read xlsx file: ${inputFile}`);
    process.exit(1);
  }

  const summary = {
    files_processed: 1,
    sheets_processed: parsedWorkbook.sheetsProcessed,
    lines_total: parsedWorkbook.linesTotal,
    lines_exported: parsedWorkbook.linesExported,
    items_exported: parsedWorkbook.itemsExported,
    warnings_total: parsedWorkbook.warningsTotal,
    warnings_by_code: parsedWorkbook.warningCounts,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
  };

  const canonicalLines = parsedWorkbook.canonicalRecords.map((line) => JSON.stringify(line));
  const itemLines = parsedWorkbook.itemRecords.map((line) => JSON.stringify(line));

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
