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
  "Module Name",
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

const normalizeModuleName = (value) => (value === null || value === undefined ? "" : String(value));

const resolvePartNumber = (item) =>
  item?.product_number ?? item?.part_number ?? item?.partNumber ?? item?.product ?? "";

const resolveModuleNameRaw = (item) =>
  normalizeModuleName(
    item?.module_name ??
      item?.moduleName ??
      item?.moduleNameRaw ??
      item?.module_name_raw ??
      item?.["Module Name"]
  );

const parseSourceRef = (sourceRef) => {
  if (typeof sourceRef !== "string") {
    return { file: "", sheet: "", row: "" };
  }
  const parts = sourceRef.split("::");
  if (parts.length !== 3) {
    return { file: "", sheet: "", row: "" };
  }
  const [file, sheet, rowText] = parts;
  const row = Number.parseInt(rowText, 10);
  return {
    file: file || "",
    sheet: sheet || "",
    row: Number.isFinite(row) ? row : "",
  };
};

const resolveAnchorItem = ({ segment, items }) => {
  const anchorRef = segment?.anchor?.source_ref ?? null;
  if (anchorRef) {
    const anchorItem = items.find((item) => item?.source_ref === anchorRef);
    if (anchorItem) {
      return anchorItem;
    }
  }
  return items.find((item) => item?.line_type === "anchor") ?? null;
};

const normalizeText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const normalizeLineRole = (value) => normalizeText(value).toLowerCase();

const STRUCTURED_FIELD_SPECS = [
  {
    label: "component_type",
    keys: ["component_type", "componentType", "Component Type", "ComponentType"],
  },
  {
    label: "category",
    keys: ["category", "Category"],
  },
  {
    label: "feature_group",
    keys: [
      "feature_group",
      "featureGroup",
      "Feature Group",
      "Group / Feature Group",
      "Group/Feature Group",
      "group",
      "Group",
    ],
  },
  {
    label: "item_type",
    keys: ["item_type", "itemType", "Item Type", "ItemType"],
  },
  {
    label: "option_type",
    keys: ["option_type", "optionType", "Option Type", "OptionType"],
  },
  {
    label: "line_item_type",
    keys: ["line_item_type", "lineItemType", "Line Item Type", "LineItemType"],
  },
];

const LINE_TYPE_ENUM_MAP = new Map([
  ["Service", "SERVICE"],
  ["Services", "SERVICE"],
  ["Support", "SERVICE"],
  ["Warranty", "SERVICE"],
  ["Maintenance", "SERVICE"],
  ["Software", "SOFTWARE_LICENSE"],
  ["Software License", "SOFTWARE_LICENSE"],
  ["License", "SOFTWARE_LICENSE"],
]);

const PHYSICAL_DEVICE_TYPE_ENUM_MAP = new Map([
  ["CPU", "CPU"],
  ["Processor", "CPU"],
  ["Memory", "RAM"],
  ["Memory Module", "RAM"],
  ["RAM", "RAM"],
  ["DIMM", "RAM"],
  ["SSD", "SSD"],
  ["Solid State Drive", "SSD"],
  ["HDD", "HDD"],
  ["Hard Drive", "HDD"],
  ["Hard Disk Drive", "HDD"],
  ["PSU", "PSU"],
  ["Power Supply", "PSU"],
  ["Power Supply Unit", "PSU"],
  ["RAID Controller", "RAID_CONTROLLER"],
  ["RAID Controller Card", "RAID_CONTROLLER"],
  ["NIC", "NIC"],
  ["Network Adapter", "NIC"],
  ["Network Interface Card", "NIC"],
  ["GPU", "GPU"],
  ["Graphics", "GPU"],
  ["Graphics Card", "GPU"],
  ["Video Card", "GPU"],
]);

const getStructuredFieldValue = (item, keys) => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(item ?? {}, key)) {
      return item[key];
    }
  }
  return undefined;
};

const resolveStructuredEnumMatch = (item, enumMap) => {
  for (const field of STRUCTURED_FIELD_SPECS) {
    const rawValue = getStructuredFieldValue(item, field.keys);
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      continue;
    }
    if (typeof rawValue !== "string") {
      continue;
    }
    const mapped = enumMap.get(rawValue);
    if (mapped) {
      return mapped;
    }
  }
  return null;
};

const inferDellLineType = (item) => {
  const lineRole = normalizeLineRole(item?.line_type);
  if (lineRole === "anchor") {
    return "SYSTEM";
  }
  if (lineRole === "attribute") {
    return "CONFIGURATION";
  }
  if (lineRole === "meta" || lineRole === "footer") {
    return "META";
  }

  const structuredLineType = resolveStructuredEnumMatch(item, LINE_TYPE_ENUM_MAP);
  if (structuredLineType) {
    return structuredLineType;
  }

  if (lineRole === "item" || lineRole === "unknown" || !lineRole) {
    return "PHYSICAL_COMPONENT";
  }
  return "PHYSICAL_COMPONENT";
};

const inferPhysicalDeviceType = (item) =>
  resolveStructuredEnumMatch(item, PHYSICAL_DEVICE_TYPE_ENUM_MAP) ?? "UNCLEAR";

const inferDellDeviceType = (item, lineType) => {
  switch (lineType) {
    case "SYSTEM":
      return "SERVER";
    case "CONFIGURATION":
      return "CONFIGURATION";
    case "SOFTWARE_LICENSE":
      return "SOFTWARE_LICENSE";
    case "SERVICE":
      return "SERVICE";
    case "META":
      return "META";
    case "PHYSICAL_COMPONENT":
      return inferPhysicalDeviceType(item);
    default:
      return "UNCLEAR";
  }
};

const buildSegmentTableRows = ({ segment, items }) => {
  const rows = [];
  const anchorItem = resolveAnchorItem({ segment, items });
  const orderedItems = Array.isArray(items) ? items : [];
  const physicalRows = [];
  const nonPhysicalRows = [];
  const serviceTailRows = [];

  if (anchorItem) {
    const anchorSource = parseSourceRef(anchorItem?.source_ref);
    const anchorLineType = inferDellLineType(anchorItem);
    const anchorDeviceType = inferDellDeviceType(anchorItem, anchorLineType);
    rows.push([
      1,
      normalizeNumber(anchorItem?.qty ?? ""),
      resolvePartNumber(anchorItem),
      anchorItem?.description ?? "",
      anchorDeviceType,
      anchorLineType,
      anchorSource.file,
      anchorSource.sheet,
      normalizeNumber(anchorSource.row),
      anchorItem?.source_ref ?? "",
      resolveModuleNameRaw(anchorItem),
    ]);
  }

  for (const item of orderedItems) {
    if (anchorItem && item?.source_ref === anchorItem.source_ref) {
      continue;
    }
    const source = parseSourceRef(item?.source_ref);
    const lineType = inferDellLineType(item);
    const deviceType = inferDellDeviceType(item, lineType);
    const row = [
      "",
      normalizeNumber(item?.qty ?? ""),
      resolvePartNumber(item),
      item?.description ?? "",
      deviceType,
      lineType,
      source.file,
      source.sheet,
      normalizeNumber(source.row),
      item?.source_ref ?? "",
      resolveModuleNameRaw(item),
    ];
    if (lineType === "CONFIGURATION") {
      serviceTailRows.push(row);
      continue;
    }
    if (lineType === "SOFTWARE_LICENSE" || lineType === "SERVICE" || lineType === "META") {
      nonPhysicalRows.push(row);
      continue;
    }
    physicalRows.push(row);
  }

  return rows.concat(physicalRows, nonPhysicalRows, serviceTailRows);
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

const buildSegmentSheet = ({ segment, items }) => {
  const rows = [];
  const segmentId = segment?.segment_id ?? "";
  const anchorItem = resolveAnchorItem({ segment, items });
  const isPartial = !anchorItem;

  rows.push(["Configuration", segmentId !== "" ? segmentId : ""]);
  rows.push(["Server model/description", anchorItem?.description ?? ""]);
  rows.push(["Server count in order", normalizeNumber(anchorItem?.qty ?? "")]);
  rows.push(["Secondary anchors", ""]);
  if (isPartial) {
    rows.push(["Status", "PARTIAL / UNANCHORED"]);
  }
  rows.push([]);
  rows.push(TABLE_HEADERS);

  const tableRows = buildSegmentTableRows({
    segment,
    items,
  });
  rows.push(...tableRows);

  const sheet = xlsx.utils.aoa_to_sheet(rows);
  normalizeWorksheetView(sheet, rows);
  enforceVisibleColumns(sheet, rows);
  return sheet;
};

const resolveSegmentData = (payload) => ({
  segment: payload,
  items: Array.isArray(payload?.items) ? payload.items : [],
});

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

const buildWorkbook = ({ segment, items }) => {
  const workbook = xlsx.utils.book_new();
  const sheet = buildSegmentSheet({
    segment,
    items,
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
  const { segment, items } = resolveSegmentData(payload);
  const segmentId = resolveSegmentId(segment, inputPath);
  if (!segmentId) {
    throw new Error("Unable to resolve segment id from input file name or payload.");
  }

  const workbook = buildWorkbook({ segment, items });
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
