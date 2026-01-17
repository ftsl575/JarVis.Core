import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import xlsx from "xlsx";

const execFileAsync = promisify(execFile);

const readJsonLines = async (filePath) => {
  const contents = await fs.readFile(filePath, "utf8");
  return contents
    .trim()
    .split("\n")
    .filter((line) => line)
    .map((line) => JSON.parse(line));
};

const fileExists = async (filePath) => {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const runAdapter = async (inputDir, outDir) => {
  await execFileAsync("node", ["adapters/hpe/index.js", inputDir, "--out", outDir], {
    cwd: process.cwd(),
  });
};

const createSampleWorkbook = (rows) => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, "BOM");
  return workbook;
};

test("exports canonical, items, and summary", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-adapter-"));
  const inputDir = path.join(tempDir, "input");
  const outDir = path.join(tempDir, "out");

  try {
    await fs.mkdir(inputDir, { recursive: true });

    const data = [
      ["Qty", "Product #", "Product Description"],
      [2, "ABC123", "Widget"],
      [3, "", "Missing Part"],
      ["", "", "Section Header"],
    ];

    const workbook = createSampleWorkbook(data);
    const inputFile = path.join(inputDir, "sample.xlsx");
    xlsx.writeFile(workbook, inputFile);

    await runAdapter(inputDir, outDir);

    const canonicalPath = path.join(outDir, "canonical.jsonl");
    const itemsPath = path.join(outDir, "items.jsonl");
    const summaryPath = path.join(outDir, "summary.json");

    assert.equal(await fileExists(canonicalPath), true);
    assert.equal(await fileExists(itemsPath), true);
    assert.equal(await fileExists(summaryPath), true);

    const canonicalLines = await readJsonLines(canonicalPath);
    const itemLines = await readJsonLines(itemsPath);
    const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));

    assert.ok(canonicalLines.length >= 1);
    assert.ok(itemLines.length >= 1);
    assert.equal(summary.items_exported, 1);
    assert.equal(summary.warnings_by_code.MISSING_PARTNUMBER, 1);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("preserves unicode filenames in outputs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-adapter-unicode-"));
  const inputDir = path.join(tempDir, "input");
  const outDir = path.join(tempDir, "out");

  try {
    await fs.mkdir(inputDir, { recursive: true });

    const data = [
      ["Qty", "Product #", "Product Description"],
      [1, "UNI123", "Unicode Item"],
    ];

    const workbook = createSampleWorkbook(data);
    const unicodeFilename = "зебра.xlsx";
    const inputFile = path.join(inputDir, unicodeFilename);

    try {
      xlsx.writeFile(workbook, inputFile);
    } catch (error) {
      if (error && (error.code === "EINVAL" || error.code === "ENOENT")) {
        return;
      }
      throw error;
    }

    await runAdapter(inputDir, outDir);

    const canonicalLines = await readJsonLines(path.join(outDir, "canonical.jsonl"));
    const itemLines = await readJsonLines(path.join(outDir, "items.jsonl"));

    assert.equal(canonicalLines[0].source.file, unicodeFilename);
    assert.ok(itemLines[0].id.includes(unicodeFilename));
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
