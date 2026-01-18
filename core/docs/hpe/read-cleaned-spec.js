import xlsx from "xlsx";
import { detectDeviceType } from "./device-type-dict.js";

const normalizeString = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value.trim();
  }
  return String(value).trim();
};

const parseQty = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  const parsed = Number.parseFloat(String(value).replace(/\s+/g, "").replace(",", "."));
  return Number.isNaN(parsed) ? null : parsed;
};

const HEADER_MATCHERS = {
  qtyPreferred: [/qty\s*components/i, /components\s*qty/i],
  qtyFallback: [/^qty$/i, /quantity/i, /кол-?во/i, /количество/i],
  partNumber: [/part\s*number/i, /product\s*#?/i, /^pn$/i, /артикул/i, /номер/i],
  description: [/description/i, /описание/i, /наименован/i, /product\s*descript/i],
};

const isQtyServersHeader = (value) => /qty\s*servers?/i.test(value);

const findHeader = (sheet, range) => {
  const maxRow = Math.min(range.e.r, range.s.r + 25);
  let bestMatch = null;

  for (let r = range.s.r; r <= maxRow; r += 1) {
    const match = {
      rowIndex: r + 1,
      qty: null,
      qtyPriority: 0,
      partNumber: null,
      description: null,
      matchCount: 0,
    };

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeString(cell?.v);
      if (!value) {
        continue;
      }

      if (!isQtyServersHeader(value)) {
        if (HEADER_MATCHERS.qtyPreferred.some((regex) => regex.test(value))) {
          if (!match.qty) {
            match.matchCount += 1;
          }
          match.qty = c + 1;
          match.qtyPriority = 2;
        } else if (
          (!match.qty || match.qtyPriority !== 2) &&
          HEADER_MATCHERS.qtyFallback.some((regex) => regex.test(value))
        ) {
          if (!match.qty) {
            match.matchCount += 1;
          }
          match.qty = c + 1;
          match.qtyPriority = 1;
        }
      }
      if (!match.partNumber && HEADER_MATCHERS.partNumber.some((regex) => regex.test(value))) {
        match.partNumber = c + 1;
        match.matchCount += 1;
      }
      if (!match.description && HEADER_MATCHERS.description.some((regex) => regex.test(value))) {
        match.description = c + 1;
        match.matchCount += 1;
      }
    }

    if (match.matchCount > 0 && (!bestMatch || match.matchCount > bestMatch.matchCount)) {
      bestMatch = match;
    }

    if (match.qty && match.description) {
      bestMatch = match;
      break;
    }
  }

  return bestMatch;
};

const isTotalRow = (description) => {
  if (!description) {
    return false;
  }
  const lowered = description.toLowerCase();
  return /\b(total|итого|summary)\b/.test(lowered);
};

export const readCleanedSpecXlsx = (filePath, { deviceTypeDictionary } = {}) => {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) {
    return [];
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const header = findHeader(sheet, range);
  const headerRow = header?.rowIndex ?? null;
  const startRow = headerRow ? headerRow + 1 : range.s.r + 1;

  const items = [];

  for (let r = startRow - 1; r <= range.e.r; r += 1) {
    const rowIndex = r + 1;
    const qtyCell = header?.qty ? sheet[xlsx.utils.encode_cell({ r, c: header.qty - 1 })] : null;
    const partCell = header?.partNumber
      ? sheet[xlsx.utils.encode_cell({ r, c: header.partNumber - 1 })]
      : null;
    const descCell = header?.description
      ? sheet[xlsx.utils.encode_cell({ r, c: header.description - 1 })]
      : null;

    let qty = parseQty(qtyCell?.v);
    const partNumber = normalizeString(partCell?.v) || undefined;
    const description = normalizeString(descCell?.v);

    if (header?.qty && qty === null && (description || partNumber)) {
      qty = 1;
    }
    if (!description && !partNumber && qty === null) {
      continue;
    }
    if (isTotalRow(description)) {
      continue;
    }
    if (qty === null || qty < 1) {
      continue;
    }
    if (!description) {
      continue;
    }

    const lineNo = items.length + 1;
    const item = {
      lineNo,
      vendor: "HPE",
      partNumber,
      description,
      qty,
      deviceType: undefined,
    };

    if (deviceTypeDictionary) {
      item.deviceType = detectDeviceType(item, deviceTypeDictionary);
    }

    items.push(item);
  }

  return items;
};
