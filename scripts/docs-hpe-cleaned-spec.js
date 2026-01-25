import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const OUT_DIR_ENV = "OUT_DIR";
const INCLUDE_FIO_ENV = "HPE_CLEANED_SPEC_INCLUDE_FIO";
const DEFAULT_OUT_DIR = path.resolve("out");
const OUTPUT_FILENAME = "cleaned_spec.xlsx";
const TABLE_HEADERS = [
  "Qty per server",
  "Total Qty",
  "Part Number",
  "Description",
  "device_type",
  "line_type",
  "Source File",
  "Source Sheet",
  "Source Row",
  "Item ID",
];

const usage = () => {
  console.log("Usage: node scripts/docs-hpe-cleaned-spec.js");
  console.log(`Reads out/items.jsonl and out/segments.json to generate out/${OUTPUT_FILENAME}`);
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

const readJsonl = async (filePath) => {
  const contents = await fs.promises.readFile(filePath, "utf8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line));
};

const resolveOutDir = () => path.resolve(process.env[OUT_DIR_ENV] || DEFAULT_OUT_DIR);

const buildItemMaps = (items) => {
  const byId = new Map();
  const byFileRow = new Map();

  for (const item of items) {
    if (item?.id) {
      byId.set(item.id, item);
    }
    const file = item?.source?.file ?? null;
    const row = item?.source?.row ?? null;
    if (file && Number.isFinite(row)) {
      const key = `${file}::${row}`;
      if (!byFileRow.has(key)) {
        byFileRow.set(key, item);
      }
    }
  }

  return { byId, byFileRow };
};

const normalizeNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  return value;
};

const resolvePartNumber = (item) =>
  item?.product_number ?? item?.part_number ?? item?.partNumber ?? item?.product ?? "";

const buildSecondaryAnchorText = ({ segment, file, itemByFileRow }) => {
  const rows = segment?.secondary_anchor_rows ?? [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return "";
  }
  const descriptions = rows.map((row) => {
    const key = `${file}::${row}`;
    const item = itemByFileRow.get(key);
    if (item?.description) {
      return item.description;
    }
    if (item?.product_number) {
      return item.product_number;
    }
    return `Row ${row}`;
  });
  return descriptions.join("; ");
};

const normalizeDescription = (value) =>
  typeof value === "string" ? value.trim() : "";

const isFactoryIntegrated = (description) =>
  normalizeDescription(description).toLowerCase() === "factory integrated";

const TRACKING_DEVICE_TYPES = new Set([
  "service",
  "license",
  "support",
  "subscription",
  "enablement",
  "warranty",
]);
const TRACKING_KEYWORDS = [
  "support",
  "service",
  "care",
  "warranty",
  "license",
  "subscription",
  "enablement",
  "registration",
  "entitlement",
];

const isTrackingRow = ({ description, deviceType }) => {
  const normalizedType = normalizeDescription(deviceType).toLowerCase();
  if (TRACKING_DEVICE_TYPES.has(normalizedType)) {
    return true;
  }
  const normalizedDescription = normalizeDescription(description).toLowerCase();
  return TRACKING_KEYWORDS.some((keyword) => normalizedDescription.includes(keyword));
};

const buildSegmentTableRows = ({
  segment,
  file,
  itemById,
  includeFactoryIntegrated,
  warnings,
}) => {
  const items = Array.isArray(segment?.items) ? segment.items : [];
  const anchorRef = items.find((item) => item?.is_anchor);
  const rows = [];
  const serverCount = segment?.server_anchor?.qty ?? null;

  const shouldIncludeRow = (ref) => {
    const item = ref?.item_id ? itemById.get(ref.item_id) : null;
    const description = item?.description ?? ref?.description ?? "";
    if (!includeFactoryIntegrated && isFactoryIntegrated(description)) {
      return false;
    }
    return true;
  };

  const sorted = items
    .filter(shouldIncludeRow)
    .sort((a, b) => {
      const rowA = Number.isFinite(a?.source?.row) ? a.source.row : Number.POSITIVE_INFINITY;
      const rowB = Number.isFinite(b?.source?.row) ? b.source.row : Number.POSITIVE_INFINITY;
      if (rowA !== rowB) {
        return rowA - rowB;
      }
      const idA = a?.item_id ?? "";
      const idB = b?.item_id ?? "";
      return idA.localeCompare(idB);
    });

  const nonAnchorRows = anchorRef ? sorted.filter((item) => item !== anchorRef) : sorted;

  if (segment?.server_anchor) {
    const anchorItem = anchorRef?.item_id ? itemById.get(anchorRef.item_id) : null;
    if (!anchorItem && anchorRef?.item_id) {
      warnings.add(`Missing item in items.jsonl: ${anchorRef.item_id}`);
    }
    const description =
      anchorItem?.description ?? anchorRef?.description ?? segment.server_anchor?.description ?? "";
    rows.push({
      isTracking: isTrackingRow({
        description,
        deviceType: anchorItem?.device_type ?? "",
      }),
      values: [
        1,
        normalizeNumber(segment.server_anchor?.qty ?? ""),
        resolvePartNumber(anchorItem) ||
          resolvePartNumber(anchorRef) ||
          segment.server_anchor?.part_number ||
          "",
        description,
        anchorItem?.device_type ?? "",
        anchorItem?.line_type ?? "",
        anchorItem?.source?.file ?? anchorRef?.source?.file ?? file ?? "",
        anchorItem?.source?.sheet ?? anchorRef?.source?.sheet ?? "",
        normalizeNumber(anchorItem?.source?.row ?? anchorRef?.source?.row ?? ""),
        anchorItem?.id ?? anchorRef?.item_id ?? "",
      ],
    });
  }

  for (const ref of nonAnchorRows) {
    const item = ref?.item_id ? itemById.get(ref.item_id) : null;
    if (!item && ref?.item_id) {
      warnings.add(`Missing item in items.jsonl: ${ref.item_id}`);
    }
    const perServerQty = ref?.per_server_qty ?? "";
    const totalQty =
      Number.isFinite(perServerQty) && Number.isFinite(serverCount)
        ? perServerQty * serverCount
        : item?.qty ?? ref?.qty ?? "";
    const description = item?.description ?? ref?.description ?? "";
    rows.push({
      isTracking: isTrackingRow({
        description,
        deviceType: item?.device_type ?? "",
      }),
      values: [
        normalizeNumber(perServerQty),
        normalizeNumber(totalQty),
        resolvePartNumber(item) || resolvePartNumber(ref),
        description,
        item?.device_type ?? "",
        item?.line_type ?? "",
        item?.source?.file ?? ref?.source?.file ?? file ?? "",
        item?.source?.sheet ?? ref?.source?.sheet ?? "",
        normalizeNumber(item?.source?.row ?? ref?.source?.row ?? ""),
        item?.id ?? ref?.item_id ?? "",
      ],
    });
  }

  const physical = [];
  const tracking = [];
  for (const row of rows) {
    if (row.isTracking) {
      tracking.push(row.values);
    } else {
      physical.push(row.values);
    }
  }
  return [...physical, ...tracking];
};

const normalizeWorksheetView = (sheet, rows) => {
  const maxRows = rows.length;
  const maxCols = rows.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0
  );
  if (maxRows > 0 && maxCols > 0) {
    sheet["!ref"] = xlsx.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: maxRows - 1, c: maxCols - 1 },
    });
  }
  delete sheet["!autofilter"];
  delete sheet["!printarea"];
  delete sheet["!freeze"];
  delete sheet["!pane"];
  delete sheet["!panes"];
  sheet["!views"] = [
    {
      state: "normal",
      activeCell: "A1",
      topLeftCell: "A1",
      zoomScale: 100,
      zoomScaleNormal: 100,
    },
  ];
};

const buildSegmentSheet = ({
  segment,
  file,
  itemById,
  itemByFileRow,
  includeFactoryIntegrated,
  warnings,
}) => {
  const rows = [];
  const segmentId = segment?.segment_id ?? "";
  const isPartial = Boolean(segment?.is_partial || !segment?.server_anchor);

  rows.push(["Configuration", segmentId !== "" ? segmentId : ""]);
  rows.push(["Server model/description", segment?.server_anchor?.description ?? ""]);
  rows.push(["Server count in order", normalizeNumber(segment?.server_anchor?.qty ?? "")]);
  rows.push([
    "Secondary anchors",
    buildSecondaryAnchorText({ segment, file, itemByFileRow }),
  ]);
  if (isPartial) {
    rows.push(["Status", "PARTIAL / UNANCHORED"]);
  }
  rows.push([]);
  rows.push(TABLE_HEADERS);

  const tableRows = buildSegmentTableRows({
    segment,
    file,
    itemById,
    includeFactoryIntegrated,
    warnings,
  });
  rows.push(...tableRows);

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  const hiddenStart = TABLE_HEADERS.length - 4;
  sheet["!cols"] = TABLE_HEADERS.map((_, index) =>
    index >= hiddenStart ? { hidden: true } : {}
  );
  normalizeWorksheetView(sheet, rows);
  return sheet;
};

const buildItemKey = (item) => {
  if (item?.item_id) {
    return `id:${item.item_id}`;
  }
  const file = item?.source?.file;
  const row = item?.source?.row;
  if (file && Number.isFinite(row)) {
    return `row:${file}:${row}`;
  }
  return null;
};

const getAnchorRow = (segment) => {
  const items = Array.isArray(segment?.items) ? segment.items : [];
  const anchor = items.find((item) => item?.is_anchor);
  const row = anchor?.source?.row;
  return Number.isFinite(row) ? row : null;
};

const mergeSegmentItems = (target, source) => {
  const targetItems = Array.isArray(target?.items) ? [...target.items] : [];
  const existing = new Set(targetItems.map(buildItemKey).filter(Boolean));
  const sourceItems = Array.isArray(source?.items) ? source.items : [];
  for (const item of sourceItems) {
    const key = buildItemKey(item);
    if (!key || !existing.has(key)) {
      targetItems.push(item);
      if (key) {
        existing.add(key);
      }
    }
  }
  target.items = targetItems;
};

const mergeSecondaryAnchors = (target, source, anchorRow) => {
  const rows = new Set(
    Array.isArray(target?.secondary_anchor_rows) ? target.secondary_anchor_rows : []
  );
  if (Number.isFinite(anchorRow)) {
    rows.add(anchorRow);
  }
  for (const row of Array.isArray(source?.secondary_anchor_rows) ? source.secondary_anchor_rows : []) {
    if (Number.isFinite(row)) {
      rows.add(row);
    }
  }
  if (rows.size > 0) {
    target.secondary_anchor_rows = Array.from(rows).sort((a, b) => a - b);
  }
};

const normalizeSegments = (segments) => {
  const files = Array.isArray(segments?.files) ? segments.files : [];
  const normalizedFiles = files.map((fileEntry) => {
    const file = fileEntry?.file ?? "";
    const fileSegments = Array.isArray(fileEntry?.segments) ? fileEntry.segments : [];
    const secondaryAnchorMap = new Map();

    for (const segment of fileSegments) {
      const rows = Array.isArray(segment?.secondary_anchor_rows)
        ? segment.secondary_anchor_rows
        : [];
      for (const row of rows) {
        if (Number.isFinite(row)) {
          secondaryAnchorMap.set(`${file}::${row}`, segment);
        }
      }
    }

    const merged = [];
    for (const segment of fileSegments) {
      const anchorRow = getAnchorRow(segment);
      const anchorKey =
        Number.isFinite(anchorRow) && file ? `${file}::${anchorRow}` : null;
      const primary = anchorKey ? secondaryAnchorMap.get(anchorKey) : null;
      if (primary && primary !== segment) {
        mergeSegmentItems(primary, segment);
        mergeSecondaryAnchors(primary, segment, anchorRow);
        continue;
      }
      merged.push(segment);
    }

    return {
      ...fileEntry,
      segments: merged,
    };
  });

  return {
    ...segments,
    files: normalizedFiles,
  };
};

const buildWorkbook = ({ segments, items, includeFactoryIntegrated }) => {
  const workbook = xlsx.utils.book_new();
  const warnings = new Set();
  const { byId, byFileRow } = buildItemMaps(items);
  const normalizedSegments = normalizeSegments(segments);

  const flattened = [];
  for (const fileEntry of normalizedSegments?.files ?? []) {
    const file = fileEntry?.file ?? "";
    const fileSegments = Array.isArray(fileEntry?.segments) ? fileEntry.segments : [];
    for (const segment of fileSegments) {
      flattened.push({ file, segment });
    }
  }

  flattened.sort((a, b) => {
    const fileA = a.file ?? "";
    const fileB = b.file ?? "";
    if (fileA !== fileB) {
      return fileA.localeCompare(fileB);
    }
    const segA = a.segment?.segment_id ?? 0;
    const segB = b.segment?.segment_id ?? 0;
    return segA - segB;
  });

  flattened.forEach(({ file, segment }, index) => {
    const label = String(index + 1).padStart(2, "0");
    const sheetName = `Cfg ${label}`;
    const sheet = buildSegmentSheet({
      segment,
      file,
      itemById: byId,
      itemByFileRow: byFileRow,
      includeFactoryIntegrated,
      warnings,
    });
    xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
  });

  return { workbook, warnings };
};

const main = async () => {
  const outDir = resolveOutDir();
  const itemsPath = path.join(outDir, "items.jsonl");
  const segmentsPath = path.join(outDir, "segments.json");
  const outputPath = path.join(outDir, OUTPUT_FILENAME);
  const includeFactoryIntegrated = process.env[INCLUDE_FIO_ENV] === "1";

  try {
    const [items, segmentsRaw] = await Promise.all([
      readJsonl(itemsPath),
      fs.promises.readFile(segmentsPath, "utf8"),
    ]);
    const segments = JSON.parse(segmentsRaw);

    const { workbook, warnings } = buildWorkbook({
      segments,
      items,
      includeFactoryIntegrated,
    });

    await fs.promises.mkdir(outDir, { recursive: true });
    xlsx.writeFile(workbook, outputPath);

    for (const warning of warnings) {
      console.warn(`Warning: ${warning}`);
    }
  } catch (error) {
    console.error("Failed to generate cleaned spec.");
    console.error(formatError(error));
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    usage();
  } else {
    await main();
  }
}

export { main };
