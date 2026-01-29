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

const NON_PHYSICAL_DEVICE_TYPES = new Set([
  "software",
  "license",
  "support",
  "service",
  "warranty",
  "deployment",
  "subscription",
  "enablement",
]);

const normalizeText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const resolveDeviceTypeForOutput = (item) => {
  const lineType = normalizeText(item?.line_type).toLowerCase();
  if (lineType !== "anchor") {
    return "Unclear";
  }
  return "Server";
};

const resolveRowClass = (item) => {
  const deviceType = normalizeText(item?.device_type).toLowerCase();
  const lineType = normalizeText(item?.line_type).toLowerCase();

  if (lineType === "attribute" || deviceType === "configuration") {
    return "service_tail";
  }
  if (NON_PHYSICAL_DEVICE_TYPES.has(deviceType)) {
    return "non_physical";
  }
  return "physical";
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
    const anchorDeviceType = resolveDeviceTypeForOutput(anchorItem);
    rows.push([
      1,
      normalizeNumber(anchorItem?.qty ?? ""),
      resolvePartNumber(anchorItem),
      anchorItem?.description ?? "",
      anchorDeviceType,
      anchorItem?.line_type ?? "",
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
    const deviceType = resolveDeviceTypeForOutput(item);
    const row = [
      "",
      normalizeNumber(item?.qty ?? ""),
      resolvePartNumber(item),
      item?.description ?? "",
      deviceType,
      item?.line_type ?? "",
      source.file,
      source.sheet,
      normalizeNumber(source.row),
      item?.source_ref ?? "",
      resolveModuleNameRaw(item),
    ];
    const rowClass = resolveRowClass(item);
    if (rowClass === "service_tail") {
      serviceTailRows.push(row);
    } else if (rowClass === "non_physical") {
      nonPhysicalRows.push(row);
    } else {
      physicalRows.push(row);
    }
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
