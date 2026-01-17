import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
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

describe("HPE adapter", () => {
  test("exports canonical, items, and summary", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-adapter-"));
    const inputDir = path.join(tempDir, "input");
    const outDir = path.join(tempDir, "out");

    await fs.mkdir(inputDir, { recursive: true });

    const data = [
      ["Qty", "Product #", "Product Description"],
      [2, "ABC123", "Widget"],
      [3, "", "Missing Part"],
      ["", "", "Section Header"],
    ];

    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(workbook, sheet, "BOM");

    const inputFile = path.join(inputDir, "sample.xlsx");
    xlsx.writeFile(workbook, inputFile);

    await execFileAsync("node", ["adapters/hpe/index.js", inputDir, "--out", outDir], {
      cwd: process.cwd(),
    });

    const canonicalLines = await readJsonLines(path.join(outDir, "canonical.jsonl"));
    const itemLines = await readJsonLines(path.join(outDir, "items.jsonl"));
    const summary = JSON.parse(await fs.readFile(path.join(outDir, "summary.json"), "utf8"));

    expect(canonicalLines).toHaveLength(3);
    expect(itemLines).toHaveLength(1);
    expect(itemLines[0].product_number).toBe("ABC123");

    expect(summary.files_processed).toBe(1);
    expect(summary.sheets_processed).toBe(1);
    expect(summary.lines_total).toBe(3);
    expect(summary.lines_exported).toBe(3);
    expect(summary.items_exported).toBe(1);
    expect(summary.warnings_by_code.MISSING_PARTNUMBER).toBe(1);
  });

  test("preserves unicode filenames in outputs", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-adapter-unicode-"));
    const inputDir = path.join(tempDir, "input");
    const outDir = path.join(tempDir, "out");

    await fs.mkdir(inputDir, { recursive: true });

    const data = [
      ["Qty", "Product #", "Product Description"],
      [1, "UNI123", "Unicode Item"],
    ];

    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet(data);
    xlsx.utils.book_append_sheet(workbook, sheet, "BOM");

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

    await execFileAsync("node", ["adapters/hpe/index.js", inputDir, "--out", outDir], {
      cwd: process.cwd(),
    });

    const canonicalLines = await readJsonLines(path.join(outDir, "canonical.jsonl"));
    const itemLines = await readJsonLines(path.join(outDir, "items.jsonl"));

    expect(canonicalLines[0].source.file).toBe(unicodeFilename);
    expect(itemLines[0].id).toContain(unicodeFilename);
  });
});
