import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import xlsx from "xlsx";

const execFileAsync = promisify(execFile);

const fixturesDir = path.join("tests", "fixtures", "cleaned-spec");
const itemsFixture = path.join(fixturesDir, "items.jsonl");
const segmentsFixture = path.join(fixturesDir, "segments.json");

const copyFixtures = async (outDir) => {
  await fs.mkdir(outDir, { recursive: true });
  await fs.copyFile(itemsFixture, path.join(outDir, "items.jsonl"));
  await fs.copyFile(segmentsFixture, path.join(outDir, "segments.json"));
};

const readSheetRows = (sheet) => xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" });

const findRowIndex = (rows, value) =>
  rows.findIndex((row) => row.some((cell) => cell === value));

const findTableHeaderIndex = (rows) =>
  rows.findIndex(
    (row) =>
      row[0] === "Qty per server" &&
      row[1] === "Total Qty" &&
      row[2] === "Part Number" &&
      row[3] === "Description"
  );

const runGenerator = async (outDir, env = {}) => {
  await execFileAsync("node", ["scripts/docs-hpe-cleaned-spec.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      OUT_DIR: outDir,
      ...env,
    },
  });
};

test("docs:hpe:cleaned-spec generates sheets and hides Factory Integrated rows by default", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-"));
  const outDir = path.join(tempDir, "out");

  try {
    await copyFixtures(outDir);
    await runGenerator(outDir);

    const outputPath = path.join(outDir, "cleaned_spec.xlsx");
    await assert.doesNotReject(() => fs.stat(outputPath));

    const workbook = xlsx.readFile(outputPath);
    assert.deepEqual(workbook.SheetNames, ["Cfg 01", "Cfg 02"]);

    const sheet1 = workbook.Sheets["Cfg 01"];
    const rows1 = readSheetRows(sheet1);

    const serverDescRow = rows1[findRowIndex(rows1, "Server model/description")];
    assert.equal(serverDescRow?.[1], "Server Model A");

    const serverCountRow = rows1[findRowIndex(rows1, "Server count in order")];
    assert.equal(serverCountRow?.[1], 2);

    const tableHeaderIndex = findTableHeaderIndex(rows1);
    assert.ok(tableHeaderIndex >= 0);
    const anchorRow = rows1[tableHeaderIndex + 1];
    assert.deepEqual(anchorRow.slice(0, 4), [1, 2, "CTO-1", "Server Model A"]);

    const memoryRow = rows1.find((row) => row[3] === "Memory DIMM");
    assert.ok(memoryRow);
    assert.equal(memoryRow[0], 2);
    assert.equal(memoryRow[1], 4);
    assert.equal(memoryRow[4], "memory");
    assert.equal(memoryRow[5], "component");

    const fioRow = rows1.find((row) => row[3] === "Factory Integrated");
    assert.equal(fioRow, undefined);

    const sheet2 = workbook.Sheets["Cfg 02"];
    const rows2 = readSheetRows(sheet2);
    const partialRow = rows2[findRowIndex(rows2, "PARTIAL / UNANCHORED")];
    assert.ok(partialRow);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:hpe:cleaned-spec includes Factory Integrated rows when enabled", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-cleaned-spec-fio-"));
  const outDir = path.join(tempDir, "out");

  try {
    await copyFixtures(outDir);
    await runGenerator(outDir, { HPE_CLEANED_SPEC_INCLUDE_FIO: "1" });

    const outputPath = path.join(outDir, "cleaned_spec.xlsx");
    const workbook = xlsx.readFile(outputPath);
    const sheet = workbook.Sheets["Cfg 01"];
    const rows = readSheetRows(sheet);
    const fioRow = rows.find((row) => row[3] === "Factory Integrated");
    assert.ok(fioRow);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
