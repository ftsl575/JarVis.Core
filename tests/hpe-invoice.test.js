import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import xlsx from "xlsx";
import { readCleanedSpecXlsx } from "../core/docs/hpe/read-cleaned-spec.js";
import { generateInvoiceXlsx } from "../core/docs/hpe/invoice.js";

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
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cell = sheet[xlsx.utils.encode_cell({ r, c })];
      if (cell?.v === "Description") {
        return { rowIndex: r + 1, descriptionCol: c + 1 };
      }
    }
  }
  return null;
};

test("generates invoice with expected line count", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-invoice-"));

  try {
    const cleanedSpecPath = path.join(tempDir, "cleaned.xlsx");
    const templatePath = path.join(tempDir, "template.xlsx");
    const outPath = path.join(tempDir, "invoice.xlsx");

    const cleanedRows = [
      ["Qty", "Product #", "Product Description"],
      [2, "ABC123", "Widget"],
      [1, "DEF456", "Gadget"],
    ];
    const cleanedWorkbook = createWorkbook(cleanedRows, "Cleaned");
    xlsx.writeFile(cleanedWorkbook, cleanedSpecPath);

    const templateRows = [
      ["", "", "", ""],
      ["", "", "", ""],
      ["", "", "", ""],
      ["№", "Description", "Product #", "Qty"],
      ["", "", "", ""],
    ];
    const templateWorkbook = createWorkbook(templateRows, "Invoice");
    xlsx.writeFile(templateWorkbook, templatePath);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    await generateInvoiceXlsx({ templatePath, items, outPath });

    const outputWorkbook = xlsx.readFile(outPath);
    assert.equal(outputWorkbook.SheetNames.length, 1);

    const outputSheet = outputWorkbook.Sheets[outputWorkbook.SheetNames[0]];
    const header = findHeaderRow(outputSheet);
    assert.ok(header);

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
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
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
