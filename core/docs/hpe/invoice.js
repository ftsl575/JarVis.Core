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
  lineNo: [/^#$/i, /^№$/i, /^no\.?$/i, /line/i],
  description: [/description/i, /описание/i, /наименован/i, /product\s*descript/i],
  partNumber: [/part\s*number/i, /product\s*#?/i, /^pn$/i, /артикул/i, /номер/i],
  qty: [/^qty$/i, /quantity/i, /кол-?во/i, /количество/i],
};

const findHeaderRow = (sheet, range) => {
  const maxRow = Math.min(range.e.r, range.s.r + 40);
  let bestMatch = null;

  for (let r = range.s.r; r <= maxRow; r += 1) {
    const match = {
      rowIndex: r + 1,
      lineNo: null,
      description: null,
      partNumber: null,
      qty: null,
      matchCount: 0,
    };

    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      const value = normalizeString(cell?.v);
      if (!value) {
        continue;
      }

      if (!match.lineNo && HEADER_MATCHERS.lineNo.some((regex) => regex.test(value))) {
        match.lineNo = c + 1;
        match.matchCount += 1;
      }
      if (!match.description && HEADER_MATCHERS.description.some((regex) => regex.test(value))) {
        match.description = c + 1;
        match.matchCount += 1;
      }
      if (!match.partNumber && HEADER_MATCHERS.partNumber.some((regex) => regex.test(value))) {
        match.partNumber = c + 1;
        match.matchCount += 1;
      }
      if (!match.qty && HEADER_MATCHERS.qty.some((regex) => regex.test(value))) {
        match.qty = c + 1;
        match.matchCount += 1;
      }
    }

    if (match.matchCount > 0 && (!bestMatch || match.matchCount > bestMatch.matchCount)) {
      bestMatch = match;
    }
  }

  return bestMatch;
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

export const generateInvoiceXlsx = async ({ templatePath, items, outPath }) => {
  const workbook = xlsx.readFile(templatePath, { cellStyles: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Invoice template has no worksheets.");
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet["!ref"]) {
    throw new Error("Invoice template worksheet is empty.");
  }

  const range = xlsx.utils.decode_range(sheet["!ref"]);
  const header = findHeaderRow(sheet, range);
  if (!header || !header.description || !header.qty) {
    throw new Error("Unable to locate invoice table header.");
  }

  const startRow = header.rowIndex + 1;
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
      lineNo: header.lineNo
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: header.lineNo - 1 })]
        : null,
      description: header.description
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: header.description - 1 })]
        : null,
      partNumber: header.partNumber
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: header.partNumber - 1 })]
        : null,
      qty: header.qty
        ? sheet[xlsx.utils.encode_cell({ r: startRow - 1, c: header.qty - 1 })]
        : null,
    };

    const item = items[index];
    if (header.lineNo) {
      setCellValue(sheet, rowIndex, header.lineNo, item.lineNo, templateCells.lineNo);
    }
    if (header.description) {
      setCellValue(sheet, rowIndex, header.description, item.description, templateCells.description);
    }
    if (header.partNumber) {
      setCellValue(sheet, rowIndex, header.partNumber, item.partNumber || "", templateCells.partNumber);
    }
    if (header.qty) {
      setCellValue(sheet, rowIndex, header.qty, item.qty, templateCells.qty);
    }
  }

  xlsx.writeFile(workbook, outPath, { cellStyles: true });
};
