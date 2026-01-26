import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

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
  console.log("Usage: node scripts/dell-cleaned-spec.js <path/to/dell_segment_<id>.json>");
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

const normalizeNumber = (value) => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "";
  }
  return value;
};

const resolvePartNumber = (item) =>
  item?.product_number ?? item?.part_number ?? item?.partNumber ?? item?.product ?? "";

const normalizeDescription = (value) => (typeof value === "string" ? value.trim() : "");

const TRACKING_DEVICE_TYPES = new Set([
  "service",
  "license",
  "support",
  "subscription",
  "enablement",
  "warranty",
  "software",
  "configuration",
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
  "software",
  "configuration",
];

const isTrackingRow = ({ description, deviceType }) => {
  const normalizedType = normalizeDescription(deviceType).toLowerCase();
  if (TRACKING_DEVICE_TYPES.has(normalizedType)) {
    return true;
  }
  const normalizedDescription = normalizeDescription(description).toLowerCase();
  return TRACKING_KEYWORDS.some((keyword) => normalizedDescription.includes(keyword));
};

const PHYSICAL_DEVICE_TYPES = new Set([
  "server",
  "blade chassis",
  "compute",
  "storage",
  "cpu",
  "ram",
  "memory",
  "gpu",
  "network",
  "hdd",
  "ssd",
  "nvme",
  "disk",
  "drive",
  "drive cage",
  "disk enclosure",
  "tape library",
  "backplane",
  "raid controller",
  "controller",
  "network adapter",
  "network interface card",
  "nic",
  "hba",
  "psu",
  "power supply",
  "power cord",
  "cable",
  "rail kit",
  "fan",
  "cooling module",
  "riser kit",
  "bezel",
  "transceiver",
  "network switch",
  "router",
  "firewall",
  "fabric interconnect",
  "hardware (accessory)",
  "battery",
  "pdu",
]);
const NON_PHYSICAL_DEVICE_TYPES = new Set([
  "software",
  "license",
  "support",
  "subscription",
  "service",
  "enablement",
  "warranty",
  "configuration",
  "tracking",
]);
const NON_PHYSICAL_LINE_TYPES = new Set([
  "support",
  "subscription",
  "license",
  "service",
  "enablement",
  "configuration",
  "fio",
  "tracking",
]);

const isPhysicalRow = ({ description, deviceType, lineType }) => {
  const normalizedDeviceType = normalizeDescription(deviceType).toLowerCase();
  const normalizedLineType = normalizeDescription(lineType).toLowerCase();
  if (NON_PHYSICAL_LINE_TYPES.has(normalizedLineType)) {
    return false;
  }
  if (NON_PHYSICAL_DEVICE_TYPES.has(normalizedDeviceType)) {
    return false;
  }
  if (isTrackingRow({ description, deviceType })) {
    return false;
  }
  return PHYSICAL_DEVICE_TYPES.has(normalizedDeviceType);
};

const buildItemMaps = (items) => {
  const byId = new Map();
  const byFileRow = new Map();

  for (const item of items) {
    const itemId = item?.id ?? item?.item_id ?? null;
    if (itemId) {
      byId.set(itemId, item);
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

const buildSegmentTableRows = ({ segment, file, itemById }) => {
  const items = Array.isArray(segment?.items) ? segment.items : [];
  const anchorRef = items.find((item) => item?.is_anchor);
  const rows = [];
  let anchorRow = null;
  const serverCount = segment?.server_anchor?.qty ?? null;

  const sorted = items.sort((a, b) => {
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
    const description =
      anchorItem?.description ?? anchorRef?.description ?? segment.server_anchor?.description ?? "";
    rows.push({
      isAnchor: true,
      isPhysical: true,
      values: [
        1,
        normalizeNumber(segment.server_anchor?.qty ?? ""),
        resolvePartNumber(anchorItem) ||
          resolvePartNumber(anchorRef) ||
          segment.server_anchor?.part_number ||
          "",
        description,
        anchorItem?.device_type ?? anchorRef?.device_type ?? "",
        anchorItem?.line_type ?? anchorRef?.line_type ?? "",
        anchorItem?.source?.file ?? anchorRef?.source?.file ?? file ?? "",
        anchorItem?.source?.sheet ?? anchorRef?.source?.sheet ?? "",
        normalizeNumber(anchorItem?.source?.row ?? anchorRef?.source?.row ?? ""),
        anchorItem?.id ?? anchorItem?.item_id ?? anchorRef?.item_id ?? "",
      ],
    });
    anchorRow = rows[rows.length - 1];
  }

  for (const ref of nonAnchorRows) {
    const item = ref?.item_id ? itemById.get(ref.item_id) : null;
    const perServerQty = ref?.per_server_qty ?? "";
    const totalQty =
      Number.isFinite(perServerQty) && Number.isFinite(serverCount)
        ? perServerQty * serverCount
        : item?.qty ?? ref?.qty ?? "";
    const description = item?.description ?? ref?.description ?? "";
    rows.push({
      isAnchor: false,
      isPhysical: isPhysicalRow({
        description,
        deviceType: item?.device_type ?? ref?.device_type ?? "",
        lineType: item?.line_type ?? ref?.line_type ?? "",
      }),
      values: [
        normalizeNumber(perServerQty),
        normalizeNumber(totalQty),
        resolvePartNumber(item) || resolvePartNumber(ref),
        description,
        item?.device_type ?? ref?.device_type ?? "",
        item?.line_type ?? ref?.line_type ?? "",
        item?.source?.file ?? ref?.source?.file ?? file ?? "",
        item?.source?.sheet ?? ref?.source?.sheet ?? "",
        normalizeNumber(item?.source?.row ?? ref?.source?.row ?? ""),
        item?.id ?? item?.item_id ?? ref?.item_id ?? "",
      ],
    });
  }

  const physical = [];
  const nonPhysical = [];
  for (const row of rows) {
    if (row.isAnchor) {
      continue;
    }
    if (row.isPhysical) {
      physical.push(row.values);
    } else {
      nonPhysical.push(row.values);
    }
  }
  if (anchorRow) {
    return [anchorRow.values, ...physical, ...nonPhysical];
  }
  return [...physical, ...nonPhysical];
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

const MIN_COLUMN_WIDTH = 10;

const getMaxColumnCount = (rows) =>
  rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);

const enforceVisibleColumns = (sheet, rows) => {
  const maxCols = getMaxColumnCount(rows);
  if (maxCols === 0) {
    return;
  }

  const existingCols = Array.isArray(sheet["!cols"]) ? sheet["!cols"] : [];
  const cols = [];
  for (let index = 0; index < maxCols; index += 1) {
    const current = existingCols[index] ?? {};
    const currentWidth = Number.isFinite(current.wch) ? current.wch : 0;
    cols[index] = {
      ...current,
      hidden: false,
      wch: Math.max(currentWidth, MIN_COLUMN_WIDTH),
    };
  }
  sheet["!cols"] = cols;
};

const buildSegmentSheet = ({ segment, file, itemById, itemByFileRow }) => {
  const rows = [];
  const segmentId = segment?.segment_id ?? "";
  const isPartial = Boolean(segment?.is_partial || !segment?.server_anchor);

  rows.push(["Configuration", segmentId !== "" ? segmentId : ""]);
  rows.push(["Server model/description", segment?.server_anchor?.description ?? ""]);
  rows.push(["Server count in order", normalizeNumber(segment?.server_anchor?.qty ?? "")]);
  rows.push(["Secondary anchors", buildSecondaryAnchorText({ segment, file, itemByFileRow })]);
  if (isPartial) {
    rows.push(["Status", "PARTIAL / UNANCHORED"]);
  }
  rows.push([]);
  rows.push(TABLE_HEADERS);

  const tableRows = buildSegmentTableRows({
    segment,
    file,
    itemById,
  });
  rows.push(...tableRows);

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  normalizeWorksheetView(sheet, rows);
  enforceVisibleColumns(sheet, rows);
  return sheet;
};

const resolveSegmentData = (payload) => {
  if (payload?.segment) {
    return {
      segment: payload.segment,
      items: Array.isArray(payload.items) ? payload.items : [],
      file: payload.file ?? payload.segment?.file ?? payload.source_file ?? "",
    };
  }
  return {
    segment: payload,
    items: Array.isArray(payload?.items) ? payload.items : [],
    file: payload?.file ?? payload?.source_file ?? "",
  };
};

const resolveSegmentId = (segment, inputPath) => {
  const match = path.basename(inputPath).match(/dell_segment_(.+)\.json$/);
  if (match) {
    return match[1];
  }
  if (segment?.segment_id !== undefined && segment?.segment_id !== null) {
    return String(segment.segment_id);
  }
  return null;
};

const buildWorkbook = ({ segment, items, file }) => {
  const workbook = xlsx.utils.book_new();
  const { byId, byFileRow } = buildItemMaps(items);
  const sheet = buildSegmentSheet({
    segment,
    file,
    itemById: byId,
    itemByFileRow: byFileRow,
  });
  xlsx.utils.book_append_sheet(workbook, sheet, "Cfg 01");
  return workbook;
};

const discoverSegmentInputs = async () => {
  const outDir = path.resolve("out");
  try {
    const entries = await fs.promises.readdir(outDir);
    return entries
      .filter((entry) => entry.startsWith("dell_segment_") && entry.endsWith(".json"))
      .sort((a, b) => a.localeCompare(b))
      .map((entry) => path.join(outDir, entry));
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const processSegmentInput = async (inputPath) => {
  const raw = await fs.promises.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const { segment, items, file } = resolveSegmentData(payload);
  const segmentId = resolveSegmentId(segment, inputPath);
  if (!segmentId) {
    throw new Error("Unable to resolve segment id from input file name or payload.");
  }

  const workbook = buildWorkbook({ segment, items, file });
  const outputDir = path.dirname(inputPath);
  const outputPath = path.join(outputDir, `cleaned_spec.dell.segment_${segmentId}.xlsx`);

  await fs.promises.mkdir(outputDir, { recursive: true });
  xlsx.writeFile(workbook, outputPath);
};

const main = async () => {
  const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : null;
  try {
    if (inputPath) {
      await processSegmentInput(inputPath);
      return;
    }

    const inputs = await discoverSegmentInputs();
    if (inputs.length === 0) {
      console.error("No Dell segment JSON files found at out/dell_segment_*.json.");
      process.exitCode = 1;
      return;
    }

    for (const input of inputs) {
      await processSegmentInput(input);
    }
  } catch (error) {
    console.error("Failed to generate cleaned spec for Dell segment.");
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
