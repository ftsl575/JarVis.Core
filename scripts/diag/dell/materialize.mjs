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

const STRUCTURED_FIELD_SPECS = [
  { label: "device_type", keys: ["device_type", "deviceType", "Device Type"] },
  { label: "component_type", keys: ["component_type", "componentType", "Component Type", "ComponentType"] },
  { label: "category", keys: ["category", "Category"] },
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
  { label: "item_type", keys: ["item_type", "itemType", "Item Type", "ItemType"] },
  { label: "option_type", keys: ["option_type", "optionType", "Option Type", "OptionType"] },
  { label: "line_item_type", keys: ["line_item_type", "lineItemType", "Line Item Type", "LineItemType"] },
];

const normalizeText = (value) => (value === null || value === undefined ? "" : String(value).trim());

const normalizeEnumKey = (value) => normalizeText(value).toLowerCase();

const buildEnumMap = (entries) => new Map(entries.map(([key, value]) => [normalizeEnumKey(key), value]));

const LINE_TYPE_ENUM_MAP = buildEnumMap([
  ["Service", "SERVICE"],
  ["Services", "SERVICE"],
  ["Support", "SERVICE"],
  ["Warranty", "SERVICE"],
  ["Maintenance", "SERVICE"],
  ["Configuration", "CONFIGURATION"],
  ["Software", "SOFTWARE_LICENSE"],
  ["Software License", "SOFTWARE_LICENSE"],
  ["License", "SOFTWARE_LICENSE"],
]);

const PHYSICAL_DEVICE_TYPE_ENUM_MAP = buildEnumMap([
  ["CPU", "CPU"],
  ["Processor", "CPU"],
  ["Memory", "RAM"],
  ["Memory Module", "RAM"],
  ["RAM", "RAM"],
  ["DIMM", "RAM"],
  ["SSD", "SSD"],
  ["Solid State Drive", "SSD"],
  ["Solid State Disk", "SSD"],
  ["HDD", "HDD"],
  ["Hard Drive", "HDD"],
  ["Hard Disk Drive", "HDD"],
  ["PSU", "PSU"],
  ["Power Supply", "PSU"],
  ["Power Supply Unit", "PSU"],
  ["RAID Controller", "RAID_CONTROLLER"],
  ["Raid Controller", "RAID_CONTROLLER"],
  ["RAID Controller Card", "RAID_CONTROLLER"],
  ["NIC", "NIC"],
  ["Network Adapter", "NIC"],
  ["Network Interface Card", "NIC"],
  ["GPU", "GPU"],
  ["Graphics", "GPU"],
  ["Graphics Card", "GPU"],
  ["Video Card", "GPU"],
  ["Heatsink", "HEATSINK"],
  ["Heat Sink", "HEATSINK"],
  ["Fan", "FAN"],
  ["Cooling Fan", "FAN"],
  ["Backplane", "BACKPLANE"],
  ["Chassis", "CHASSIS_PART"],
  ["Chassis Part", "CHASSIS_PART"],
  ["Chassis Component", "CHASSIS_PART"],
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
    const normalized = normalizeEnumKey(rawValue);
    if (!normalized) {
      continue;
    }
    const mapped = enumMap.get(normalized);
    if (mapped) {
      return mapped;
    }
  }
  return null;
};

const normalizeLineRole = (value) => normalizeText(value).toLowerCase();

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
      return "UNCLEAR";
    case "PHYSICAL_COMPONENT":
      return inferPhysicalDeviceType(item);
    default:
      return "UNCLEAR";
  }
};

const resolveDeviceTypeForDell = (item) => {
  const lineType = inferDellLineType(item);
  return inferDellDeviceType(item, lineType);
};

const STRUCTURED_FIELDS = [
  "component_type",
  "category",
  "feature_group",
  "item_type",
  "option_type",
  "line_item_type",
];

const appendStructuredFields = (payload, item) => {
  for (const field of STRUCTURED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(item ?? {}, field)) {
      payload[field] = item[field];
    }
  }
};

const DEFAULT_OUT_DIR = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\out";

export const materializeDellSegments = async ({ segmentsPath, itemsPath, outDir }) => {
  if (!segmentsPath || !itemsPath || !outDir) {
    throw new Error("segmentsPath, itemsPath, and outDir are required");
  }

  const [segmentsPayload, rawItems] = await Promise.all([
    readSegmentsJson(segmentsPath),
    readItemsJsonl(itemsPath),
  ]);

  const items = rawItems.map((item) => ({
    ...item,
    device_type: resolveDeviceTypeForDell(item),
  }));

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
        device_type: resolveDeviceTypeForDell(item),
        line_type: item?.line_type ?? null,
      })),
      meta,
    };
    for (const itemPayload of payload.items) {
      const sourceItem = itemLookup.get(itemPayload.source_ref);
      appendStructuredFields(itemPayload, sourceItem);
    }
    await fs.promises.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }

  const updatedItemsJsonl = `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;
  await fs.promises.writeFile(itemsPath, updatedItemsJsonl, "utf8");
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
