import path from "node:path";
import { fileURLToPath } from "node:url";
import { segmentHpeItems, hasErrorFindings, writeSegments } from "./segments/segmenter.js";

const usage = () => {
  console.log("Usage: node scripts/diagnostics/hpe-segments.js --items <items.jsonl> [--out <segments.json>] [--mode strict|permissive]");
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  let itemsPath = null;
  let outputPath = null;
  let mode = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--items") {
      itemsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--out") {
      outputPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--mode") {
      mode = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    return { error: `Unexpected argument: ${arg}` };
  }

  return { itemsPath, outputPath, mode };
};

const normalizeMode = (mode) => {
  if (!mode) {
    return null;
  }
  const normalized = String(mode).toLowerCase();
  if (normalized !== "strict" && normalized !== "permissive") {
    throw new Error(`Invalid mode: ${mode}`);
  }
  return normalized;
};

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    usage();
    return;
  }
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exitCode = 1;
    return;
  }

  const itemsPath = parsed.itemsPath || path.resolve("out/items.jsonl");
  const outputPath = parsed.outputPath || path.resolve("out/segments.json");
  let mode = null;
  try {
    mode = normalizeMode(parsed.mode);
  } catch (error) {
    console.error(error.message);
    usage();
    process.exitCode = 1;
    return;
  }

  const { result, findings, mode: resolvedMode } = await segmentHpeItems({
    itemsPath,
    mode,
  });

  await writeSegments({ outputPath, payload: result });

  if (resolvedMode === "strict" && hasErrorFindings(findings)) {
    console.error("Segmentation completed with ERROR findings in strict mode.");
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  await main();
}

export { main };
