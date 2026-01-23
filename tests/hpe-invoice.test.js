import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import xlsx from "xlsx";
import { readCleanedSpecXlsx } from "../core/docs/hpe/read-cleaned-spec.js";
import { generateInvoiceXlsx, validateInvoiceTemplate } from "../core/docs/hpe/invoice.js";

const createWorkbook = (rows, sheetName = "Sheet1") => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
  return workbook;
};

const findHeaderRow = (sheet) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return null;
  }

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    let partNumberCol;
    let descriptionCol;
    let deviceTypeCol;
    let qtyCol;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (cell?.v === "Part Number") {
        partNumberCol = c + 1;
      }
      if (cell?.v === "Description") {
        descriptionCol = c + 1;
      }
      if (cell?.v === "Device Type") {
        deviceTypeCol = c + 1;
      }
      if (cell?.v === "Qty components") {
        qtyCol = c + 1;
      }
    }
    if (partNumberCol && descriptionCol && qtyCol) {
      return { rowIndex: r + 1, descriptionCol, deviceTypeCol };
    }
  }
  return null;
};

const findRowsByLabels = (sheet, labels) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return [];
  }

  const matches = [];
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    let match = true;
    for (let c = 0; c < labels.length; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c: c + 1 })];
      if (cell?.v !== labels[c]) {
        match = false;
        break;
      }
    }
    if (match) {
      matches.push(r + 1);
    }
  }

  return matches;
};

const findRowWithValue = (sheet, value) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return null;
  }

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (cell?.v === value) {
        return r + 1;
      }
    }
  }

  return null;
};

const countCellsWithValue = (sheet, value) => {
  const range = sheet["!ref"] ? xlsx.utils.decode_range(sheet["!ref"]) : null;
  if (!range) {
    return 0;
  }

  let count = 0;
  for (let r = range.s.r; r <= range.e.r; r += 1) {
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (cell?.v === value) {
        count += 1;
      }
    }
  }

  return count;
};

test("generates invoice with expected line count", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-invoice-"));

  try {
    const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
    const templatePath = path.join(tempDir, "template.xlsx");
    const outPath = path.join(tempDir, "invoice.xlsx");

    const cleanedRows = [
      [
        "#",
        "Part Number",
        "Description",
        "Device Type",
        "Тип устройства (RU)",
        "Qty Components",
        "Qty Servers",
      ],
      [1, "ABC123", "Widget", "Device", "Устройство", 2, 1],
      [2, "DEF456", "Gadget", "Device", "Устройство", 1, 1],
    ];
    const cleanedWorkbook = createWorkbook(cleanedRows, "Cleaned");
    xlsx.writeFile(cleanedWorkbook, cleanedSpecPath);

    const templateRows = [
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["", "#", "Part Number", "Description", "Device Type", "Qty components"],
      ["", "", "", "", "", ""],
    ];
    const templateWorkbook = createWorkbook(templateRows, "Invoice");
    xlsx.writeFile(templateWorkbook, templatePath);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    items[0].deviceType = "Compute";
    await generateInvoiceXlsx({ templatePath, items, outPath });

    const outputWorkbook = xlsx.readFile(outPath);
    assert.equal(outputWorkbook.SheetNames.length, 1);

    const outputSheet = outputWorkbook.Sheets[outputWorkbook.SheetNames[0]];
    const header = findHeaderRow(outputSheet);
    assert.ok(header);
    assert.ok(header.deviceTypeCol);

    let lineCount = 0;
    for (let i = 1; i <= items.length; i += 1) {
      const cell = outputSheet[
        xlsx.utils.encode_cell({ r: header.rowIndex + i - 1, c: header.descriptionCol - 1 })
      ];
      if (cell?.v) {
        lineCount += 1;
      }
    }

    assert.equal(lineCount, items.length);

    const firstItemRow = findRowWithValue(outputSheet, "Widget");
    const secondItemRow = findRowWithValue(outputSheet, "Gadget");
    assert.ok(firstItemRow);
    assert.ok(secondItemRow);

    const firstDeviceTypeCell = outputSheet[
      xlsx.utils.encode_cell({ r: firstItemRow - 1, c: header.deviceTypeCol - 1 })
    ];
    const secondDeviceTypeCell = outputSheet[
      xlsx.utils.encode_cell({ r: secondItemRow - 1, c: header.deviceTypeCol - 1 })
    ];
    assert.equal(firstDeviceTypeCell?.v, "Compute");
    assert.equal(secondDeviceTypeCell?.v, "Unclear");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("places terms and bank blocks after items without duplicating the header", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-invoice-layout-"));

  try {
    const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
    const templatePath = path.join(tempDir, "template.xlsx");
    const outPath = path.join(tempDir, "invoice.xlsx");

    const cleanedRows = [
      [
        "#",
        "Part Number",
        "Description",
        "Device Type",
        "Тип устройства (RU)",
        "Qty Components",
        "Qty Servers",
      ],
      [1, "SKU-100", "Primary", "Device", "Устройство", 1, 1],
      [2, "SKU-200", "Secondary", "Device", "Устройство", 2, 1],
      [3, "SKU-300", "Tertiary", "Device", "Устройство", 1, 1],
    ];
    const cleanedWorkbook = createWorkbook(cleanedRows, "Cleaned");
    xlsx.writeFile(cleanedWorkbook, cleanedSpecPath);

    const templateRows = Array.from({ length: 20 }, () => ["", "", "", "", "", ""]);
    templateRows[10][1] = "#";
    templateRows[10][2] = "Part Number";
    templateRows[10][3] = "Description";
    templateRows[10][4] = "Device Type";
    templateRows[10][5] = "Qty components";
    templateRows[12][3] = "[Terms & Conditions:]";
    templateRows[18][3] = "[Bank Account]";
    const templateWorkbook = createWorkbook(templateRows, "Invoice");
    xlsx.writeFile(templateWorkbook, templatePath);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    await generateInvoiceXlsx({ templatePath, items, outPath });

    const outputWorkbook = xlsx.readFile(outPath);
    const outputSheet = outputWorkbook.Sheets[outputWorkbook.SheetNames[0]];
    const headerRows = findRowsByLabels(outputSheet, [
      "#",
      "Part Number",
      "Description",
      "Device Type",
      "Qty components",
    ]);
    assert.equal(headerRows.length, 1);
    assert.equal(countCellsWithValue(outputSheet, "Part Number"), 1);

    const headerRow = headerRows[0];
    const lastItemRow = headerRow + items.length;
    const termsRow = findRowWithValue(outputSheet, "[Terms & Conditions:]");
    const bankRow = findRowWithValue(outputSheet, "[Bank Account]");

    assert.ok(termsRow);
    assert.ok(bankRow);
    assert.ok(termsRow > lastItemRow);
    assert.ok(bankRow > lastItemRow);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("throws when template header is missing", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-invoice-missing-header-"));

  try {
    const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
    const templatePath = path.join(tempDir, "template.xlsx");
    const outPath = path.join(tempDir, "invoice.xlsx");

    const cleanedRows = [
      [
        "#",
        "Part Number",
        "Description",
        "Device Type",
        "Тип устройства (RU)",
        "Qty Components",
        "Qty Servers",
      ],
      [1, "HPE-100", "Server", "Server", "Сервер", 3, 1],
      [2, "HPE-200", "Storage", "Storage", "Хранилище", 4, 1],
    ];
    const cleanedWorkbook = createWorkbook(cleanedRows, "Cleaned");
    xlsx.writeFile(cleanedWorkbook, cleanedSpecPath);

    const templateRows = [["Invoice"], [""], ["Prepared for Customer"]];
    const templateWorkbook = createWorkbook(templateRows, "Invoice");
    xlsx.writeFile(templateWorkbook, templatePath);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    await assert.rejects(
      () => generateInvoiceXlsx({ templatePath, items, outPath }),
      (error) => {
        assert.ok(String(error).includes("invoice template does not match expected format"));
        return true;
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("throws when template header is incomplete", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-invoice-incomplete-header-"));

  try {
    const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
    const templatePath = path.join(tempDir, "template.xlsx");
    const outPath = path.join(tempDir, "invoice.xlsx");

    const cleanedRows = [
      [
        "#",
        "Part Number",
        "Description",
        "Device Type",
        "Тип устройства (RU)",
        "Qty Components",
        "Qty Servers",
      ],
      [1, "HPE-300", "Compute Node", "Server", "Сервер", 1, 1],
      [2, "HPE-400", "Expansion Shelf", "Storage", "Хранилище", 2, 1],
    ];
    const cleanedWorkbook = createWorkbook(cleanedRows, "Cleaned");
    xlsx.writeFile(cleanedWorkbook, cleanedSpecPath);

    const templateRows = [["Invoice"], [""], ["Description"]];
    const templateWorkbook = createWorkbook(templateRows, "Invoice");
    xlsx.writeFile(templateWorkbook, templatePath);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    await assert.rejects(
      () => generateInvoiceXlsx({ templatePath, items, outPath }),
      (error) => {
        assert.ok(String(error).includes("invoice template does not match expected format"));
        return true;
      }
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("validateInvoiceTemplate throws with missing headers list", () => {
  const workbook = createWorkbook([["Invoice"], ["Prepared for Customer"]], "Invoice");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];

  assert.throws(
    () => validateInvoiceTemplate(sheet),
    (error) => {
      const message = String(error);
      assert.ok(message.startsWith("Error:"));
      assert.ok(message.includes("missing headers: Part Number, Description, Qty components"));
      return true;
    }
  );
});

test("reads cleaned spec with qty components header", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-"));

  try {
    const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
    const cleanedRows = [
      [
        "#",
        "Part Number",
        "Description",
        "Device Type",
        "Тип устройства (RU)",
        "Qty Components",
        "Qty Servers",
      ],
      [1, "PN-100", "Server Bundle", "Server", "Сервер", 2, 1],
      [2, "PN-200", "Storage Shelf", "Storage", "Хранилище", 3, 1],
    ];

    const cleanedWorkbook = createWorkbook(cleanedRows, "Cleaned");
    xlsx.writeFile(cleanedWorkbook, cleanedSpecPath);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    assert.equal(items.length, 2);
    assert.equal(items[0].partNumber, "PN-100");
    assert.equal(items[0].description, "Server Bundle");
    assert.equal(items[0].qty, 2);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
