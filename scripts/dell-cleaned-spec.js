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
const normalizeText = (value) => (value === null || value === undefined ? "" : String(value).trim());
const normalizeModuleNameForMatch = (value) =>
  normalizeText(value).replace(/\s+/g, " ").toLowerCase();

const FAST_PATH_SYSTEM_RAW = [
  "PowerEdge R6715",
  "PowerEdge R660",
  "PowerEdge R770",
  "PowerEdge R7625",
];
const FAST_PATH_CONFIG_RAW = [
  "Regulatory",
  "Shipping Material",
  "Asset Tagging",
  "Trusted Platform Module",
  "Shipping Box Labels - Standard",
  "Order Configuration",
  "Shipping",
  "Anti Theft Device & Asset Tagging",
  "Memory Configuration Type",
];
const FAST_PATH_NORMALIZED_SYSTEM = new Set(
  FAST_PATH_SYSTEM_RAW.map((v) => normalizeModuleNameForMatch(v))
);
const FAST_PATH_NORMALIZED_CONFIG = new Set(
  FAST_PATH_CONFIG_RAW.map((v) => normalizeModuleNameForMatch(v))
);

const resolveFastPath = (item) => {
  const raw = resolveModuleNameRaw(item);
  const normalized = normalizeModuleNameForMatch(raw);
  if (!normalized) {
    return null;
  }
  if (FAST_PATH_NORMALIZED_SYSTEM.has(normalized)) {
    return { lineType: "SYSTEM", deviceType: "SERVER" };
  }
  if (FAST_PATH_NORMALIZED_CONFIG.has(normalized)) {
    return { lineType: "CONFIGURATION", deviceType: "CONFIGURATION" };
  }
  return null;
};

const BASE_SYSTEM_ANCHOR_DESCRIPTIONS_RAW = [
  "PowerEdge R660 Server",
  "PowerEdge R770 Server",
  "PowerEdge R7625 Server",
  "PowerEdge R760 Server",
];
const BASE_SYSTEM_ANCHOR_DESCRIPTIONS_NORMALIZED = new Set(
  BASE_SYSTEM_ANCHOR_DESCRIPTIONS_RAW.map((v) => normalizeModuleNameForMatch(v))
);

const resolveBaseSystemAnchor = (item) => {
  const normalizedModule = normalizeModuleNameForMatch(resolveModuleNameRaw(item));
  if (normalizedModule !== "base") {
    return null;
  }
  const description =
    item?.description ?? item?.description_raw ?? item?.["Description"] ?? "";
  const normalizedDescription = normalizeModuleNameForMatch(description);
  if (!BASE_SYSTEM_ANCHOR_DESCRIPTIONS_NORMALIZED.has(normalizedDescription)) {
    return null;
  }
  return { lineType: "SYSTEM", deviceType: "SERVER" };
};

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

const normalizeLineRole = (value) => normalizeText(value).toLowerCase();

const LINE_TYPE_RULES = [
  {
    matchKind: "exact",
    patterns: ["Service", "Services", "Support", "Warranty", "Maintenance"],
    resultLineType: "SERVICE",
  },
  {
    matchKind: "exact",
    patterns: [
      "Configuration",
      "System Configuration",
      "Advanced System Configuration",
      "Settings",
      "BIOS",
      "BIOS Settings",
      "BIOS Setting",
      "RAID Configuration",
    ],
    resultLineType: "CONFIGURATION",
  },
  {
    matchKind: "exact",
    patterns: [
      "Memory Configuration Type",
      "Advanced System Configurations",
      "BIOS Settings",
      "Trusted Platform Module",
      "Order Configuration",
      "Shipping",
      "Shipping Material",
      "Regulatory",
      "Asset Tagging",
      "Anti Theft Device & Asset Tagging",
    ],
    resultLineType: "CONFIGURATION",
  },
  {
    matchKind: "prefix",
    patterns: ["No "],
    resultLineType: "CONFIGURATION",
  },
  {
    matchKind: "exact",
    patterns: ["Software", "Software License", "License"],
    resultLineType: "SOFTWARE_LICENSE",
  },
  {
    matchKind: "exact",
    patterns: [
      "BIOS and Advanced System Configuration Settings",
      "Chassis Configuration",
      "DPU Cables",
      "Dell Secure Onboarding",
      "Embedded Systems Management",
      "KVM/Quick Sync",
      "Password",
      "OS Media Kits",
      "Operating System",
      "Memory DIMM Type and Speed",
      "Additional Processor Features",
      "GPU/FPGA/Acceleration Cables",
      "Cables",
    ],
    resultLineType: "CONFIGURATION",
  },
  {
    matchKind: "exact",
    patterns: [
      "Dell Services: Hardware Support",
      "Extended Service",
      "Infrastructure Deployment Svcs",
    ],
    resultLineType: "SERVICE",
  },
];

const DEVICE_TYPE_RULES = [
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["CPU", "Processor"],
    resultDeviceType: "CPU",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: [
      "Memory",
      "Memory Module",
      "Memory DIMM",
      "Memory DIMMs",
      "Memory Capacity",
      "RAM",
      "DIMM",
      "DIMMs",
      "RDIMM",
      "RDIMMs",
      "UDIMM",
      "UDIMMs",
      "LRDIMM",
      "LRDIMMs",
    ],
    resultDeviceType: "RAM",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: [
      "SSD",
      "SSDs",
      "NVMe",
      "NVMe SSD",
      "NVMe Drives",
      "Solid State",
      "Solid State Drive",
      "Solid State Drives",
      "Solid State Disk",
      "Solid State Disks",
    ],
    resultDeviceType: "SSD",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: [
      "HDD",
      "Hard Drive",
      "Hard Drives",
      "Hard Disk",
      "Hard Disk Drive",
      "Hard Disk Drives",
    ],
    resultDeviceType: "HDD",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["PSU", "Power Supply", "Power Supply Unit"],
    resultDeviceType: "PSU",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: [
      "RAID",
      "PERC",
      "PERC Controller",
      "PERC Controllers",
      "RAID Controller",
      "Raid Controller",
      "RAID Controller Card",
      "Storage Controller",
      "Storage Controllers",
      "Internal Storage Controller",
      "Internal Storage Controllers",
      "Internal Storage Controller Card",
      "RAID/Internal Storage Controllers",
    ],
    resultDeviceType: "RAID_CONTROLLER",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["OCP 3.0 Accessories"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: [
      "NIC",
      "Network",
      "Network Adapter",
      "Network Adapters",
      "Network Interface Card",
      "Network Interface Cards",
      "OCP",
      "OCP 3.0",
    ],
    resultDeviceType: "NIC",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["GPU", "Graphics", "Graphics Card", "Video Card"],
    resultDeviceType: "GPU",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Heatsink", "Heat Sink"],
    resultDeviceType: "HEATSINK",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Fan", "Fans", "Cooling Fan", "Cooling Fans", "System Fan", "System Fans"],
    resultDeviceType: "FAN",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Backplane", "Backplanes"],
    resultDeviceType: "BACKPLANE",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: [
      "Chassis",
      "Chassis Part",
      "Chassis Parts",
      "Chassis Component",
      "Chassis Components",
    ],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Motherboard"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["PCIe Riser"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Risers"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Front Bezel"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Bezel"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Power Cord"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Rack Rails"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Rails"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    line_type: "PHYSICAL_COMPONENT",
    matchKind: "exact",
    patterns: ["Power Cords"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["cpu", "processor"],
    resultDeviceType: "CPU",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["memory", "ram", "dimm", "rdimm", "lrdimm", "udimm"],
    resultDeviceType: "RAM",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["psu", "power supply"],
    resultDeviceType: "PSU",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["raid controller", "storage controller"],
    resultDeviceType: "RAID_CONTROLLER",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["nic", "network adapter", "network interface", "ocp"],
    resultDeviceType: "NIC",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["fan", "cooling fan", "system fan"],
    resultDeviceType: "FAN",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["gpu", "graphics", "video card"],
    resultDeviceType: "GPU",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["heatsink", "heat sink"],
    resultDeviceType: "HEATSINK",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["backplane"],
    resultDeviceType: "BACKPLANE",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["chassis"],
    resultDeviceType: "CHASSIS_PART",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["ssd", "nvme", "solid state"],
    resultDeviceType: "SSD",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "contains",
    patterns: ["hdd", "hard drive", "hard disk"],
    resultDeviceType: "HDD",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["SAS", "SATA", "Drive", "Drives"],
    resultDeviceType: "UNCLEAR",
  },
  {
    lineTypes: ["CONFIGURATION"],
    matchKind: "exact",
    patterns: [
      "Memory Configuration Type",
      "Advanced System Configurations",
      "BIOS Settings",
      "Trusted Platform Module",
      "Order Configuration",
      "Shipping",
      "Shipping Material",
      "Regulatory",
      "Asset Tagging",
      "Anti Theft Device & Asset Tagging",
    ],
    resultDeviceType: "CONFIGURATION",
  },
  {
    lineTypes: ["CONFIGURATION"],
    matchKind: "exact",
    patterns: [
      "Base",
      "Thermal Configuration",
      "BIOS and Advanced System Configuration Settings",
      "DPU Cables",
    ],
    resultDeviceType: "CONFIGURATION",
  },
  {
    lineTypes: ["CONFIGURATION"],
    matchKind: "exact",
    patterns: [
      "Advanced System Configurations",
      "BIOS and Advanced System Configuration Settings",
      "Chassis Configuration",
      "DPU Cables",
      "Dell Secure Onboarding",
      "Embedded Systems Management",
      "KVM/Quick Sync",
      "Password",
      "Regulatory",
      "Shipping",
      "Shipping Material",
      "OS Media Kits",
      "Operating System",
      "Memory Configuration Type",
      "Memory DIMM Type and Speed",
      "Additional Processor Features",
      "GPU/FPGA/Acceleration Cables",
      "Cables",
      "RAID Configuration",
    ],
    resultDeviceType: "CONFIGURATION",
  },
  {
    lineTypes: ["SERVICE"],
    matchKind: "exact",
    patterns: [
      "Dell Services: Hardware Support",
      "Extended Service",
      "Infrastructure Deployment Svcs",
    ],
    resultDeviceType: "SERVICE",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["OCP 3.0 Network Adapters"],
    resultDeviceType: "NIC",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Boot Optimized Storage Cards"],
    resultDeviceType: "RAID_CONTROLLER",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Hard Drives (PCIe SSD/Flex Bay)"],
    resultDeviceType: "SSD",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Processor Thermal Configuration"],
    resultDeviceType: "HEATSINK",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["Hard Drives"],
    resultDeviceType: "HDD",
  },
  {
    lineTypes: ["PHYSICAL_COMPONENT"],
    matchKind: "exact",
    patterns: ["RAID/Internal Storage Controllers"],
    resultDeviceType: "RAID_CONTROLLER",
  },
];

const matchRule = (normalized, rule) => {
  if (!normalized) {
    return false;
  }
  const patterns = rule.patterns ?? [];
  switch (rule.matchKind) {
    case "exact":
      return patterns.includes(normalized);
    case "prefix":
      return patterns.some((pattern) => normalized.startsWith(pattern));
    case "contains":
      return patterns.some((pattern) => normalized.includes(pattern));
    default:
      return false;
  }
};

const normalizeRulePatterns = (patterns) =>
  patterns.map((pattern) => normalizeModuleNameForMatch(pattern)).filter(Boolean);

const prepareRules = (rules) =>
  rules.map((rule) => ({
    ...rule,
    patterns: normalizeRulePatterns(rule.patterns ?? []),
  }));

const LINE_TYPE_RULE_TABLE = prepareRules(LINE_TYPE_RULES);
const DEVICE_TYPE_RULE_TABLE = prepareRules(DEVICE_TYPE_RULES);

const resolveLineTypeRuleMatch = (item) => {
  const normalized = normalizeModuleNameForMatch(resolveModuleNameRaw(item));
  if (!normalized) {
    return null;
  }
  for (const rule of LINE_TYPE_RULE_TABLE) {
    if (matchRule(normalized, rule)) {
      return rule.resultLineType ?? null;
    }
  }
  return null;
};

const resolveDeviceTypeRuleMatch = (item, lineType) => {
  const normalized = normalizeModuleNameForMatch(resolveModuleNameRaw(item));
  if (!normalized) {
    return null;
  }
  for (const rule of DEVICE_TYPE_RULE_TABLE) {
    if (rule.lineTypes && !rule.lineTypes.includes(lineType)) {
      continue;
    }
    if (matchRule(normalized, rule)) {
      return rule.resultDeviceType ?? null;
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

  if (lineRole === "item" || lineRole === "unknown" || !lineRole) {
    const moduleLineType = resolveLineTypeRuleMatch(item);
    return moduleLineType ?? "PHYSICAL_COMPONENT";
  }
  return "PHYSICAL_COMPONENT";
};

const inferPhysicalDeviceType = (item) =>
  resolveDeviceTypeRuleMatch(item, "PHYSICAL_COMPONENT") ?? "UNCLEAR";

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
      return "UNCLEAR";
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
    const anchorBaseSystem = resolveBaseSystemAnchor(anchorItem);
    const anchorFastPath = resolveFastPath(anchorItem);
    const anchorLineType = anchorBaseSystem
      ? anchorBaseSystem.lineType
      : anchorFastPath
        ? anchorFastPath.lineType
        : inferDellLineType(anchorItem);
    const anchorDeviceType = anchorBaseSystem
      ? anchorBaseSystem.deviceType
      : anchorFastPath
        ? anchorFastPath.deviceType
        : inferDellDeviceType(anchorItem, anchorLineType);
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
    const baseSystem = resolveBaseSystemAnchor(item);
    const fastPath = resolveFastPath(item);
    const lineType = baseSystem
      ? baseSystem.lineType
      : fastPath
        ? fastPath.lineType
        : inferDellLineType(item);
    const deviceType = baseSystem
      ? baseSystem.deviceType
      : fastPath
        ? fastPath.deviceType
        : inferDellDeviceType(item, lineType);
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
