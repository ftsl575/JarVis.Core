import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import xlsx from "xlsx";
import { readCleanedSpecXlsx } from "../core/docs/hpe/read-cleaned-spec.js";

const createWorkbook = (rows, sheetName = "Sheet1") => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, sheetName);
  return workbook;
};

const writeWorkbook = async (rows, tempDir, fileName = "cleaned.xlsx") => {
  const filePath = path.join(tempDir, fileName);
  const workbook = createWorkbook(rows, "Cleaned");
  xlsx.writeFile(workbook, filePath);
  return filePath;
};

test("throws when cleaned spec is missing Part Number header", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-missing-pn-"));

  try {
    const rows = [
      ["#", "Description", "Qty Components", "Qty Servers"],
      [1, "Widget", 2, 1],
    ];
    const cleanedSpecPath = await writeWorkbook(rows, tempDir);

    assert.throws(() => readCleanedSpecXlsx(cleanedSpecPath), (error) => {
      assert.match(error.message, /Part Number/i);
      return true;
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("throws when cleaned spec is missing Qty Components header", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-missing-qty-"));

  try {
    const rows = [
      ["#", "Part Number", "Description", "Qty Servers"],
      [1, "PN-100", "Widget", 1],
    ];
    const cleanedSpecPath = await writeWorkbook(rows, tempDir);

    assert.throws(() => readCleanedSpecXlsx(cleanedSpecPath), (error) => {
      assert.match(error.message, /Qty Components/i);
      return true;
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("reads cleaned spec when required headers are present", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-valid-"));

  try {
    const rows = [
      [
        "#",
        "Part Number",
        "Description",
        "Device Type",
        "Тип устройства (RU)",
        "Qty Components",
        "Qty Servers",
      ],
      [1, "PN-200", "Server Bundle", "Server", "Сервер", 2, 1],
    ];
    const cleanedSpecPath = await writeWorkbook(rows, tempDir);

    const items = readCleanedSpecXlsx(cleanedSpecPath);
    assert.equal(items.length, 1);
    assert.equal(items[0].partNumber, "PN-200");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
