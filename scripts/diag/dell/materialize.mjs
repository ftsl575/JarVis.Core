import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readItemsJsonl } from "./_lib/readItemsJsonl.mjs";

const readSegmentsJson = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return JSON.parse(content);
};

const buildItemLookup = (items) => {
  const lookup = new Map();
  for (const item of items) {
    const key = item?.id;
    if (!key) {
      throw new Error("Encountered item without id in items.jsonl");
    }
    if (lookup.has(key)) {
      throw new Error(`Duplicate item id encountered in items.jsonl: ${key}`);
    }
    lookup.set(key, item);
  }
  return lookup;
};

const resolveSegmentItems = ({ segment, itemLookup }) => {
  const rows = Array.isArray(segment.rows) && segment.rows.length > 0 ? segment.rows : [segment.anchor];

  return rows.map((row, index) => {
    const ref = row?.source_ref;
    if (!ref) {
      throw new Error(`Missing source_ref for segment ${segment.segment_id} row ${index}`);
    }
    const item = itemLookup.get(ref);
    if (!item) {
      throw new Error(`Missing item for source_ref ${ref} in segment ${segment.segment_id}`);
    }
    return item;
  });
};

export const materializeDellSegments = async ({ segmentsPath, itemsPath, outDir }) => {
  if (!segmentsPath || !itemsPath || !outDir) {
    throw new Error("segmentsPath, itemsPath, and outDir are required");
  }

  const [segmentsPayload, items] = await Promise.all([
    readSegmentsJson(segmentsPath),
    readItemsJsonl(itemsPath),
  ]);

  const itemLookup = buildItemLookup(items);
  const segments = segmentsPayload?.segments ?? [];

  await fs.promises.mkdir(outDir, { recursive: true });

  for (const segment of segments) {
    const itemsBySegment = resolveSegmentItems({ segment, itemLookup });
    const outputPath = path.join(outDir, `items.${segment.segment_id}.jsonl`);
    const serialized = itemsBySegment.map((item) => JSON.stringify(item)).join("\n");
    await fs.promises.writeFile(outputPath, `${serialized}\n`, "utf8");
  }
};

const run = async () => {
  const root = process.cwd();
  const outDir = path.join(root, "out");
  await materializeDellSegments({
    segmentsPath: path.join(outDir, "segments.dell.json"),
    itemsPath: path.join(outDir, "items.jsonl"),
    outDir,
  });
};

const isDirectRun = () => {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return import.meta.url === pathToFileURL(path.resolve(entry)).href;
};

if (isDirectRun()) {
  run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
