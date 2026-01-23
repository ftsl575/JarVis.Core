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

export const generateInvoiceXlsx = async ({ templatePath, items, outPath }) => {
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

  const startRow = headerRow + 1;
  const delta = Math.max(0, items.length - 1);

  if (delta > 0) {
    shiftRowsDown(sheet, startRow + 1, delta);
  }

  for (let index = 0; index < items.length; index += 1) {
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

    const item = items[index];
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

  const itemsStartRow = startRow;
  const itemCount = items.length;
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
