import fs from "node:fs";
import path from "node:path";

const readJsonl = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const normalizeVendor = (vendor) => String(vendor || "").trim().toLowerCase();

const isDellAnchor = (item) =>
  normalizeVendor(item?.source?.vendor) === "dell" && item?.line_type === "anchor";

const resolveRowIndex = (item) => {
  const row = item?.raw_ref?.row_index ?? item?.source?.row_index ?? item?.source?.row ?? item?.source?.rowIndex ?? null;
  if (row === null || row === undefined) {
    return null;
  }
  const parsed = Number(row);
  return Number.isFinite(parsed) ? parsed : null;
};

const makeRowReference = (item) => ({
  sheet: item?.raw_ref?.sheet ?? item?.source?.sheet ?? null,
  row_index: resolveRowIndex(item),
  source_ref: item?.id ?? null,
});

const resolveInputKey = (items) => {
  const files = Array.from(
    new Set(items.map((item) => item?.source?.file).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  if (files.length === 1) {
    return files[0];
  }
  if (files.length > 1) {
    return files.join(",");
  }
  return "unknown";
};

const buildSegments = (items) => {
  const anchors = items
    .map((item, index) => (isDellAnchor(item) ? { item, index } : null))
    .filter(Boolean);

  return anchors.map((anchor, idx) => {
    const start = anchor.index;
    const end = idx + 1 < anchors.length ? anchors[idx + 1].index : items.length;
    const slice = items.slice(start, end);
    const rows = slice.map((item) => makeRowReference(item));
    return {
      segment_id: `dell_dl2_s${String(idx + 1).padStart(3, "0")}`,
      anchor: makeRowReference(anchor.item),
      rows,
      counts: {
        items: rows.length,
        anchors: 1,
      },
    };
  });
};

export const segmentDellItems = ({ items }) => {
  const dellItems = items.filter((item) => normalizeVendor(item?.source?.vendor) === "dell");
  return {
    vendor: "dell",
    input_key: resolveInputKey(dellItems),
    segments: buildSegments(dellItems),
    meta: {
      schema_version: 1,
    },
  };
};

export const segmentDellItemsFile = async ({ itemsPath }) => {
  if (!itemsPath) {
    throw new Error("itemsPath is required");
  }
  const items = await readJsonl(itemsPath);
  return segmentDellItems({ items });
};

export const writeDellSegments = async ({ outputPath, payload }) => {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
};
