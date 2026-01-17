import { promises as fs } from "node:fs";
import path from "node:path";

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

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exit(2);
  }

  const { inputDir, outputDir } = parsed;

  let entries;
  try {
    entries = await fs.readdir(inputDir, { withFileTypes: true });
  } catch (error) {
    console.error(`Failed to read input directory: ${inputDir}`);
    console.error(error.message);
    process.exit(1);
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase().endsWith(".xlsx"));

  if (files.length === 0) {
    console.log(`No .xlsx files found in ${inputDir}.`);
    process.exit(0);
  }

  for (const file of files) {
    const inputPath = path.join(inputDir, file);
    console.log(`TODO: process ${inputPath} -> ${outputDir}`);
  }
};

main();
