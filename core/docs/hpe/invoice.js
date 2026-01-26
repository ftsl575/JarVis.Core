import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const normalizeString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value).trim();
};

const normalizeHeaderValue = (value) => normalizeString(value).replace(/\s+/g, " ");

const normalizeHeaderKey = (value) => normalizeHeaderValue(value).toLowerCase();

const normalizeLookupKey = (value) => normalizeString(value).toLowerCase();

const normalizeDescriptionValue = (value) =>
  normalizeString(value).replace(/\s+/g, " ").toLowerCase();

const isFactoryIntegrated = (value) =>
  normalizeString(value).toLowerCase().includes("factory integrated");

const HEADER_LABELS = {
  lineNo: "#",
  partNumber: "Part Number",
  description: "Description",
  deviceType: "Device Type",
  qty: "Qty components",
};

const REQUIRED_HEADER_KEYS = ["partNumber", "description", "qty"];
const REQUIRED_HEADERS = [
  HEADER_LABELS.partNumber,
  HEADER_LABELS.description,
  HEADER_LABELS.qty,
];
const OPTIONAL_ANCHORS = ["[Terms & Conditions:]", "[Bank Account]"];

const DEFAULT_HEADER_ROW = 12;
const PHYSICAL_LICENSE_MARKERS = [
  "paper",
  "printed",
  "certificate",
  "coa",
  "media",
  "dvd",
  "usb",
  "keycard",
  "license card",
  "documentation",
  "kit",
];

const NON_PHYSICAL_KEYWORDS = [
  "software",
  "license",
  "ltu",
  "support",
  "subscription",
  "tech care",
  "tracking",
  "enablement",
  "configuration",
  "service",
];

const readItemsLayerJsonl = (filePath) => {
  const content = fs.readFileSync(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const resolveItemsLayer = ({ itemsLayer, itemsLayerPath, outPath }) => {
  if (Array.isArray(itemsLayer)) {
    return itemsLayer;
  }

  let candidatePath = itemsLayerPath;
  if (!candidatePath && outPath) {
    candidatePath = path.join(path.dirname(outPath), "items.jsonl");
  }

  if (candidatePath && fs.existsSync(candidatePath)) {
    return readItemsLayerJsonl(candidatePath);
  }

  return [];
};

const buildDeviceTypeLookup = (itemsLayer) => {
  const lookup = new Map();
  itemsLayer.forEach((record) => {
    const partNumber = normalizeLookupKey(
      record?.product_number ?? record?.part_number ?? record?.productNumber ?? record?.partNumber
    );
    if (!partNumber) {
      return;
    }
    const description = normalizeDescriptionValue(record?.description);
    const deviceType = normalizeString(record?.device_type ?? record?.deviceType);
    const entries = lookup.get(partNumber) || [];
    entries.push({ description, deviceType });
    lookup.set(partNumber, entries);
  });
  return lookup;
};

const resolveDeviceType = (lookup, partNumber, description) => {
  const normalizedPartNumber = normalizeLookupKey(partNumber);
  if (!normalizedPartNumber) {
    return "";
  }
  const matches = lookup.get(normalizedPartNumber);
  if (!matches || matches.length === 0) {
    return "";
  }
  if (matches.length === 1) {
    return matches[0].deviceType;
  }
  const normalizedDescription = normalizeDescriptionValue(description);
  if (normalizedDescription) {
    const exactMatch = matches.find((match) => match.description === normalizedDescription);
    if (exactMatch) {
      return exactMatch.deviceType;
    }
  }
  return matches[0].deviceType;
};

const updateSheetRange = (sheet, row, col) => {
  const cellPosition = { r: row - 1, c: col - 1 };
  if (!sheet["!ref"]) {
    sheet["!ref"] = xlsx.utils.encode_range({ s: cellPosition, e: cellPosition });
    return;
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  if (cellPosition.r < range.s.r) {
    range.s.r = cellPosition.r;
  }
  if (cellPosition.c < range.s.c) {
    range.s.c = cellPosition.c;
  }
  if (cellPosition.r > range.e.r) {
    range.e.r = cellPosition.r;
  }
  if (cellPosition.c > range.e.c) {
    range.e.c = cellPosition.c;
  }

  sheet["!ref"] = xlsx.utils.encode_range(range);
};

const setCellValue = (sheet, row, col, value, templateCell) => {
  const cellRef = xlsx.utils.encode_cell({ r: row - 1, c: col - 1 });
  const cell = sheet[cellRef] || {};

  if (templateCell?.s) {
    cell.s = templateCell.s;
  }
  if (templateCell?.z) {
    cell.z = templateCell.z;
  }

  if (typeof value === "number") {
    cell.t = "n";
    cell.v = value;
  } else {
    cell.t = "s";
    cell.v = value ?? "";
  }

  sheet[cellRef] = cell;
  updateSheetRange(sheet, row, col);
};

const cloneCell = (cell) => {
  if (!cell) {
    return null;
  }
  if (typeof structuredClone === "function") {
    return structuredClone(cell);
  }
  return JSON.parse(JSON.stringify(cell));
};

const cloneTemplateRow = (sheet, templateRowIndex, targetRowIndex) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return;
  }

  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const templateRef = xlsx.utils.encode_cell({ r: templateRowIndex - 1, c });
    const templateCell = sheet[templateRef];
    if (!templateCell) {
      continue;
    }
    const targetRef = xlsx.utils.encode_cell({ r: targetRowIndex - 1, c });
    const newCell = { ...templateCell, v: "", t: "s" };
    sheet[targetRef] = newCell;
  }
};

const shiftRowsDown = (sheet, startRow, delta) => {
  if (!delta) {
    return;
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const startRowIndex = Math.max(0, startRow - 1);

  for (let r = range.e.r; r >= startRowIndex; r -= 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const fromRef = xlsx.utils.encode_cell({ r, c });
      const toRef = xlsx.utils.encode_cell({ r: r + delta, c });
      if (sheet[fromRef]) {
        sheet[toRef] = sheet[fromRef];
        delete sheet[fromRef];
      }
    }
  }

  if (sheet["!merges"]) {
    sheet["!merges"] = sheet["!merges"].map((merge) => {
      if (merge.s.r >= startRowIndex) {
        return {
          s: { r: merge.s.r + delta, c: merge.s.c },
          e: { r: merge.e.r + delta, c: merge.e.c },
        };
      }
      return merge;
    });
  }

  if (sheet["!rows"]) {
    const rows = sheet["!rows"];
    for (let i = rows.length - 1; i >= startRowIndex; i -= 1) {
      rows[i + delta] = rows[i];
      rows[i] = undefined;
    }
  }

  range.e.r += delta;
  sheet["!ref"] = xlsx.utils.encode_range(range);
};

const rowHasContent = (sheet, rowIndex, range) => {
  for (let c = range.s.c; c <= range.e.c; c += 1) {
    const cell = sheet[xlsx.utils.encode_cell({ r: rowIndex, c })];
    if (normalizeString(cell?.v)) {
      return true;
    }
  }
  return false;
};

const findFallbackHeaderRow = (sheet, range) => {
  if (!range) {
    return DEFAULT_HEADER_ROW;
  }

  let targetRow = DEFAULT_HEADER_ROW;
  const maxRow = Math.max(range.e.r + 2, DEFAULT_HEADER_ROW);

  while (targetRow <= maxRow) {
    if (!rowHasContent(sheet, targetRow - 1, range)) {
      return targetRow;
    }
    targetRow += 1;
  }

  return targetRow;
};

const findItemsHeaderRow = (sheet, range) => {
  const maxRow = Math.min(range.e.r, range.s.r + 40);

  for (let r = range.s.r; r <= maxRow; r += 1) {
    const colIndexMap = {
      lineNo: null,
      partNumber: null,
      description: null,
      deviceType: null,
      qty: null,
    };

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeHeaderKey(cell?.v);
      if (!value) {
        continue;
      }

      if (!colIndexMap.lineNo && value === normalizeHeaderKey(HEADER_LABELS.lineNo)) {
        colIndexMap.lineNo = c + 1;
      }
      if (!colIndexMap.partNumber && value === normalizeHeaderKey(HEADER_LABELS.partNumber)) {
        colIndexMap.partNumber = c + 1;
      }
      if (!colIndexMap.description && value === normalizeHeaderKey(HEADER_LABELS.description)) {
        colIndexMap.description = c + 1;
      }
      if (!colIndexMap.deviceType && value === normalizeHeaderKey(HEADER_LABELS.deviceType)) {
        colIndexMap.deviceType = c + 1;
      }
      if (!colIndexMap.qty && value === normalizeHeaderKey(HEADER_LABELS.qty)) {
        colIndexMap.qty = c + 1;
      }
    }

    const hasRequired = REQUIRED_HEADER_KEYS.every((key) => colIndexMap[key]);
    if (hasRequired) {
      return { headerRow: r + 1, colIndexMap };
    }
  }

  return null;
};

const findMissingHeaders = (sheet) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return [...REQUIRED_HEADERS];
  }

  const requiredNormalized = new Map(
    REQUIRED_HEADERS.map((header) => [normalizeHeaderKey(header), header])
  );
  const found = new Set();

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeHeaderKey(cell?.v);
      if (requiredNormalized.has(value)) {
        found.add(requiredNormalized.get(value));
      }
    }
  }

  const missing = REQUIRED_HEADERS.filter((header) => !found.has(header));
  if (missing.length === 0) {
    const headerRow = findItemsHeaderRow(sheet, range);
    if (!headerRow) {
      return [...REQUIRED_HEADERS];
    }
  }

  return missing;
};

const findMissingAnchors = (sheet) => {
  const missing = [];
  OPTIONAL_ANCHORS.forEach((anchor) => {
    if (!findCellByValue(sheet, anchor)) {
      missing.push(anchor);
    }
  });
  return missing;
};

export const validateInvoiceTemplate = (sheet) => {
  const missingHeaders = findMissingHeaders(sheet);
  if (missingHeaders.length > 0) {
    throw new Error(
      `invoice template does not match expected format (missing headers: ${missingHeaders.join(", ")})`
    );
  }

  const missingAnchors = findMissingAnchors(sheet);
  return { missingAnchors };
};

const ensureInvoiceTableHeader = (sheet) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  const header = range ? findItemsHeaderRow(sheet, range) : null;

  if (header) {
    return header;
  }

  const headerRow = findFallbackHeaderRow(sheet, range);
  const colIndexMap = {
    lineNo: 2,
    partNumber: 3,
    description: 4,
    deviceType: 5,
    qty: 6,
  };

  setCellValue(sheet, headerRow, colIndexMap.lineNo, HEADER_LABELS.lineNo);
  setCellValue(sheet, headerRow, colIndexMap.partNumber, HEADER_LABELS.partNumber);
  setCellValue(sheet, headerRow, colIndexMap.description, HEADER_LABELS.description);
  setCellValue(sheet, headerRow, colIndexMap.deviceType, HEADER_LABELS.deviceType);
  setCellValue(sheet, headerRow, colIndexMap.qty, HEADER_LABELS.qty);

  return { headerRow, colIndexMap };
};

const findCellByValue = (sheet, value) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return null;
  }

  const target = normalizeString(value);
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (normalizeString(cell?.v) === target) {
        return { rowIndex: r + 1, colIndex: c + 1 };
      }
    }
  }
  return null;
};

const captureBlock = (sheet, startRow, rowCount) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return null;
  }

  const rows = [];
  const cells = [];

  for (let offset = 0; offset < rowCount; offset += 1) {
    const rowIndex = startRow + offset;
    if (sheet["!rows"]) {
      rows.push(sheet["!rows"][rowIndex - 1]);
    }
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = xlsx.utils.encode_cell({ r: rowIndex - 1, c });
      if (sheet[ref]) {
        cells.push({ r: rowIndex, c: c + 1, cell: cloneCell(sheet[ref]) });
      }
    }
  }

  const merges = (sheet["!merges"] || []).filter((merge) => {
    const start = merge.s.r + 1;
    const end = merge.e.r + 1;
    return start >= startRow && end <= startRow + rowCount - 1;
  });

  return { startRow, rowCount, rows, cells, merges };
};

const clearBlock = (sheet, startRow, rowCount) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return;
  }

  for (let offset = 0; offset < rowCount; offset += 1) {
    const rowIndex = startRow + offset;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const ref = xlsx.utils.encode_cell({ r: rowIndex - 1, c });
      if (sheet[ref]) {
        delete sheet[ref];
      }
    }
    if (sheet["!rows"]) {
      sheet["!rows"][rowIndex - 1] = undefined;
    }
  }

  if (sheet["!merges"]) {
    sheet["!merges"] = sheet["!merges"].filter((merge) => {
      const start = merge.s.r + 1;
      const end = merge.e.r + 1;
      return !(start >= startRow && end <= startRow + rowCount - 1);
    });
  }
};

const placeBlock = (sheet, block, targetRow) => {
  if (!block) {
    return;
  }

  const rowOffset = targetRow - block.startRow;

  block.cells.forEach(({ r, c, cell }) => {
    const targetRef = xlsx.utils.encode_cell({ r: r - 1 + rowOffset, c: c - 1 });
    sheet[targetRef] = cloneCell(cell);
    updateSheetRange(sheet, r + rowOffset, c);
  });

  if (sheet["!rows"] && block.rows.length > 0) {
    for (let i = 0; i < block.rows.length; i += 1) {
      sheet["!rows"][targetRow - 1 + i] = block.rows[i];
    }
  }

  if (block.merges.length > 0) {
    const offsetMerges = block.merges.map((merge) => ({
      s: { r: merge.s.r + rowOffset, c: merge.s.c },
      e: { r: merge.e.r + rowOffset, c: merge.e.c },
    }));
    sheet["!merges"] = [...(sheet["!merges"] || []), ...offsetMerges];
  }
};

const normalizeWord = (value) =>
  normalizeString(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const normalizeCompact = (value) =>
  normalizeString(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

const buildNormalizedText = (...values) =>
  values.map((value) => normalizeWord(value)).filter(Boolean).join(" ");

const hasLicenseMarker = (description) => {
  const normalized = normalizeCompact(description);
  if (!normalized) {
    return false;
  }
  return PHYSICAL_LICENSE_MARKERS.some((marker) =>
    normalized.includes(normalizeCompact(marker))
  );
};

const containsKeyword = (normalizedText, keyword) =>
  normalizedText.includes(normalizeWord(keyword));

const isNonPhysical = (item, deviceType, lineType) => {
  const normalized = buildNormalizedText(deviceType, lineType);
  return NON_PHYSICAL_KEYWORDS.some((keyword) => containsKeyword(normalized, keyword));
};

const isLicenseLike = (item, deviceType, lineType) => {
  const normalized = buildNormalizedText(deviceType, lineType);
  return containsKeyword(normalized, "license") || containsKeyword(normalized, "software");
};

const isPhysicalInvoiceItem = (item, deviceType, lineType) => {
  if (isLicenseLike(item, deviceType, lineType)) {
    return hasLicenseMarker(item?.description);
  }
  if (isNonPhysical(item, deviceType, lineType)) {
    return false;
  }
  return true;
};

const normalizeSegmentsPayload = (segments) => {
  const files = Array.isArray(segments?.files) ? segments.files : [];
  return files.map((fileEntry) => {
    const file = fileEntry?.file ?? "";
    const fileSegments = Array.isArray(fileEntry?.segments) ? fileEntry.segments : [];
    return {
      file,
      segments: fileSegments,
    };
  });
};

const readSegments = (segmentsPath) => {
  if (!segmentsPath || !fs.existsSync(segmentsPath)) {
    return null;
  }
  const content = fs.readFileSync(segmentsPath, "utf8");
  return JSON.parse(content);
};

const buildItemLookup = (itemsLayer) => {
  const byId = new Map();
  itemsLayer.forEach((record) => {
    if (record?.id) {
      byId.set(record.id, record);
    }
  });
  return byId;
};

const buildItemsBySegment = ({ items, segments, itemsLayerRecords, deviceTypeLookup }) => {
  const itemsById = buildItemLookup(itemsLayerRecords);
  const itemsBySegment = new Map();
  const unassigned = new Set(items.map((item) => item));

  const files = normalizeSegmentsPayload(segments);
  for (const fileEntry of files) {
    const fileSegments = Array.isArray(fileEntry?.segments) ? fileEntry.segments : [];
    const sortedSegments = [...fileSegments].sort(
      (a, b) => (a?.segment_id ?? 0) - (b?.segment_id ?? 0)
    );
    for (const segment of sortedSegments) {
      const segmentId = segment?.segment_id ?? null;
      const refs = Array.isArray(segment?.items) ? segment.items : [];
      const matchedItems = [];
      for (const ref of refs) {
        const refId = ref?.item_id ?? null;
        if (!refId) {
          continue;
        }
        const record = itemsById.get(refId);
        if (!record) {
          continue;
        }
        const match = items.find(
          (item) =>
            item?.itemId === refId ||
            (item?.description === record?.description &&
              item?.partNumber ===
                (record?.product_number ?? record?.part_number ?? record?.productNumber ?? record?.partNumber ?? "") &&
              Number(item?.qty) === Number(record?.qty))
        );
        if (!match) {
          continue;
        }
        matchedItems.push(match);
        unassigned.delete(match);
      }
      itemsBySegment.set(segmentId, {
        segment,
        items: matchedItems,
      });
    }
  }

  return { itemsBySegment, unassigned: Array.from(unassigned) };
};

const buildSectionLabel = (segment) => {
  const segmentId = segment?.segment_id ?? 1;
  const label = String(segmentId).padStart(2, "0");
  const isPartial = Boolean(segment?.is_partial);
  const anchor = segment?.server_anchor ?? null;
  if (isPartial && !anchor) {
    return `CFG ${label} (PARTIAL)`;
  }
  const anchorParts = [];
  if (anchor?.description) {
    anchorParts.push(normalizeString(anchor.description));
  }
  if (anchor?.qty !== null && anchor?.qty !== undefined) {
    anchorParts.push(`Qty ${anchor.qty}`);
  }
  if (anchorParts.length > 0) {
    return `CFG ${label} - ${anchorParts.join(" / ")}`;
  }
  return `CFG ${label}`;
};

const buildInvoiceRows = ({ items, segments, itemsLayerRecords, deviceTypeLookup }) => {
  const rows = [];
  let lineNo = 1;

  const addItems = (segmentItems) => {
    for (const item of segmentItems) {
      const deviceTypeFromItems = resolveDeviceType(deviceTypeLookup, item.partNumber, item.description);
      const deviceType = normalizeString(deviceTypeFromItems || item.deviceType);
      const lineType = normalizeString(item.lineType);
      if (!isPhysicalInvoiceItem(item, deviceType, lineType)) {
        continue;
      }
      rows.push({
        ...item,
        lineNo,
        deviceType,
      });
      lineNo += 1;
    }
  };

  if (segments) {
    const { itemsBySegment } = buildItemsBySegment({
      items,
      segments,
      itemsLayerRecords,
      deviceTypeLookup,
    });
    const sortedSegments = [...itemsBySegment.values()].sort(
      (a, b) => (a.segment?.segment_id ?? 0) - (b.segment?.segment_id ?? 0)
    );
    for (const entry of sortedSegments) {
      rows.push({
        lineNo: "",
        partNumber: "",
        description: "",
        deviceType: "",
        qty: "",
        isSectionSeparator: true,
      });
      rows.push({
        lineNo: "",
        partNumber: "",
        description: buildSectionLabel(entry.segment),
        deviceType: "",
        qty: "",
        isSectionHeader: true,
      });
      addItems(entry.items);
    }
    return rows;
  }

  rows.push({
    lineNo: "",
    partNumber: "",
    description: "CFG 01 (PARTIAL)",
    deviceType: "",
    qty: "",
    isSectionHeader: true,
  });
  addItems(items);
  return rows;
};

export const generateInvoiceXlsx = async ({
  templatePath,
  items,
  outPath,
  itemsLayer,
  itemsLayerPath,
  segmentsPath,
}) => {
  const workbook = xlsx.readFile(templatePath, { cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Invoice template has no worksheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error("Invoice template worksheet is empty.");
  }

  const { missingAnchors } = validateInvoiceTemplate(sheet);
  const { headerRow, colIndexMap } = ensureInvoiceTableHeader(sheet);

  const itemsLayerRecords = resolveItemsLayer({ itemsLayer, itemsLayerPath, outPath });
  const deviceTypeLookup = buildDeviceTypeLookup(itemsLayerRecords);
  const segments = readSegments(segmentsPath);
  const filteredItems = items.filter((item) => !isFactoryIntegrated(item?.description));
  const invoiceRows = buildInvoiceRows({
    items: filteredItems,
    segments,
    itemsLayerRecords,
    deviceTypeLookup,
  });

  const startRow = headerRow + 1;
  const delta = Math.max(0, invoiceRows.length - 1);

  if (delta > 0) {
    shiftRowsDown(sheet, startRow + 1, delta);
  }

  for (let index = 0; index < invoiceRows.length; index += 1) {
    const rowIndex = startRow + index;
    if (index > 0) {
      cloneTemplateRow(sheet, startRow, rowIndex);
    }

    const templateCells = {
      lineNo: colIndexMap.lineNo
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: colIndexMap.lineNo - 1 })]
        : null,
      description: colIndexMap.description
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: colIndexMap.description - 1 })]
        : null,
      partNumber: colIndexMap.partNumber
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: colIndexMap.partNumber - 1 })]
        : null,
      deviceType: colIndexMap.deviceType
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: colIndexMap.deviceType - 1 })]
        : null,
      qty: colIndexMap.qty
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: colIndexMap.qty - 1 })]
        : null,
    };

    const item = invoiceRows[index];
    if (colIndexMap.lineNo) {
      setCellValue(sheet, rowIndex, colIndexMap.lineNo, item.lineNo, templateCells.lineNo);
    }
    if (colIndexMap.description) {
      setCellValue(sheet, rowIndex, colIndexMap.description, item.description, templateCells.description);
    }
    if (colIndexMap.partNumber) {
      setCellValue(
        sheet,
        rowIndex,
        colIndexMap.partNumber,
        item.partNumber || "",
        templateCells.partNumber
      );
    }
    if (colIndexMap.qty) {
      setCellValue(sheet, rowIndex, colIndexMap.qty, item.qty, templateCells.qty);
    }
    if (colIndexMap.deviceType) {
      if (item.isSectionHeader || item.isSectionSeparator) {
        setCellValue(sheet, rowIndex, colIndexMap.deviceType, "", templateCells.deviceType);
      } else {
        const deviceTypeValue = normalizeString(item.deviceType);
        setCellValue(
          sheet,
          rowIndex,
          colIndexMap.deviceType,
          deviceTypeValue || "Unclear",
          templateCells.deviceType
        );
      }
    }
  }

  const itemsStartRow = startRow;
  const itemCount = invoiceRows.length;
  const lastItemRow = itemCount > 0 ? itemsStartRow + itemCount - 1 : itemsStartRow - 1;

  const termsAnchor = findCellByValue(sheet, "[Terms & Conditions:]");
  const bankAnchor = findCellByValue(sheet, "[Bank Account]");

  if (termsAnchor && bankAnchor) {
    const blockHeight = 6;
    const targetTermsRow = Math.max(termsAnchor.rowIndex, lastItemRow + 3);
    const targetBankRow = Math.max(bankAnchor.rowIndex, targetTermsRow + blockHeight + 2);

    if (targetTermsRow !== termsAnchor.rowIndex || targetBankRow !== bankAnchor.rowIndex) {
      const termsBlock = captureBlock(sheet, termsAnchor.rowIndex, blockHeight);
      const bankBlock = captureBlock(sheet, bankAnchor.rowIndex, blockHeight);

      clearBlock(sheet, termsAnchor.rowIndex, blockHeight);
      clearBlock(sheet, bankAnchor.rowIndex, blockHeight);

      placeBlock(sheet, termsBlock, targetTermsRow);
      placeBlock(sheet, bankBlock, targetBankRow);
    }
  }

  xlsx.writeFile(workbook, outPath, { cellStyles: true });
  return { missingAnchors };
};
