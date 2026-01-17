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

const HEADER_MATCHERS = {
  keyword: [/keyword/i, /ключ/i, /термин/i, /pattern/i],
  deviceType: [/device\s*type/i, /тип\s*устройств/i, /категор/i, /type/i],
};

const detectHeaderColumns = (sheet, range) => {
  const maxRow = Math.min(range.e.r, range.s.r + 20);
  let bestMatch = null;

  for (let r = range.s.r; r <= maxRow; r += 1) {
    const columnMap = {
      keyword: null,
      deviceType: null,
      matchCount: 0,
      rowIndex: r + 1,
    };

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeString(cell?.v);
      if (!value) {
        continue;
      }

      if (!columnMap.keyword && HEADER_MATCHERS.keyword.some((regex) => regex.test(value))) {
        columnMap.keyword = c + 1;
        columnMap.matchCount += 1;
      }
      if (!columnMap.deviceType && HEADER_MATCHERS.deviceType.some((regex) => regex.test(value))) {
        columnMap.deviceType = c + 1;
        columnMap.matchCount += 1;
      }
    }

    if (columnMap.matchCount > 0 && (!bestMatch || columnMap.matchCount > bestMatch.matchCount)) {
      bestMatch = columnMap;
    }
  }

  return bestMatch;
};

export const loadDeviceTypeDictionary = (filePath) => {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { entries: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) {
    return { entries: [] };
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const header = detectHeaderColumns(sheet, range);

  const keywordColumn = header?.keyword || range.s.c + 1;
  const deviceTypeColumn = header?.deviceType || range.s.c + 2;
  const startRow = header?.rowIndex ? header.rowIndex + 1 : range.s.r + 1;

  const entries = [];
  for (let r = startRow - 1; r <= range.e.r; r += 1) {
    const keywordCell = sheet[xlsx.utils.encode_cell({ r, c: keywordColumn - 1 })];
    const typeCell = sheet[xlsx.utils.encode_cell({ r, c: deviceTypeColumn - 1 })];
    const keyword = normalizeString(keywordCell?.v);
    const deviceType = normalizeString(typeCell?.v);

    if (!keyword || !deviceType) {
      continue;
    }

    entries.push({ keyword, deviceType });
  }

  return { entries };
};

export const detectDeviceType = (item, dictionary) => {
  if (!dictionary?.entries?.length) {
    return undefined;
  }

  const haystack = `${item.description || ""} ${item.partNumber || ""}`.toLowerCase();

  for (const entry of dictionary.entries) {
    const keyword = entry.keyword?.toLowerCase();
    if (!keyword) {
      continue;
    }
    if (haystack.includes(keyword)) {
      return entry.deviceType || undefined;
    }
  }

  return undefined;
};
