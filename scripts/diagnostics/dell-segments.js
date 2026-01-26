import path from "node:path";
import { fileURLToPath } from "node:url";
import { segmentDellItemsFile, writeDellSegments } from "./segments/dell-segmenter.js";

const DEFAULT_ITEMS_PATH = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\out\\items.jsonl";
const DEFAULT_OUTPUT_PATH = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\out\\segments.dell.json";

const usage = () => {
  console.log("Usage: node scripts/diagnostics/dell-segments.js [--items <items.jsonl>] [--out <segments.dell.json>]");
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  let itemsPath = null;
  let outputPath = null;

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
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    return { error: `Unexpected argument: ${arg}` };
  }

  return { itemsPath, outputPath };
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

  const itemsPath = parsed.itemsPath || DEFAULT_ITEMS_PATH;
  const outputPath = parsed.outputPath || DEFAULT_OUTPUT_PATH;

  const payload = await segmentDellItemsFile({ itemsPath });
  await writeDellSegments({ outputPath, payload });

  console.log(`Dell segmentation wrote ${payload.segments.length} segments to ${outputPath}`);
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  await main();
}

export { main };
