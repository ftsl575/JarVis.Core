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
    return { ref, item };
  });
};

const DEFAULT_OUT_DIR = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\out";

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
  const vendor = segmentsPayload?.vendor ?? "dell";
  const meta = segmentsPayload?.meta ?? { schema_version: 1 };

  await fs.promises.mkdir(outDir, { recursive: true });

  for (const segment of segments) {
    const itemsBySegment = resolveSegmentItems({ segment, itemLookup });
    const outputPath = path.join(outDir, `dell_segment_${segment.segment_id}.json`);
    const payload = {
      vendor,
      segment_id: segment.segment_id ?? null,
      anchor: segment.anchor ?? null,
      items: itemsBySegment.map(({ ref, item }) => ({
        source_ref: ref,
        qty: item?.qty ?? null,
        product_number: item?.product_number ?? null,
        description: item?.description ?? null,
        module_name_raw: item?.module_name_raw ?? null,
        device_type: item?.device_type ?? null,
        line_type: item?.line_type ?? null,
      })),
      meta,
    };
    await fs.promises.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
};

const run = async () => {
  const outDir = DEFAULT_OUT_DIR;
  await materializeDellSegments({
    segmentsPath: path.join(DEFAULT_OUT_DIR, "segments.dell.json"),
    itemsPath: path.join(DEFAULT_OUT_DIR, "items.jsonl"),
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
