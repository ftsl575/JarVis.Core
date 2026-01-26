import { execFile } from "node:child_process";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import xlsx from "xlsx";
import { segmentDellItems } from "../scripts/diagnostics/segments/dell-segmenter.js";

const execFileAsync = promisify(execFile);

const createWorkbook = (rows) => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, "BOM");
  return workbook;
};

const writeWorkbook = async (filePath, rows) => {
  const workbook = createWorkbook(rows);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  xlsx.writeFile(workbook, filePath);
};

test("dell segmentation splits anchors deterministically", () => {
  const items = [
    {
      id: "dl2.xlsx::BOM::2",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 2 },
      line_type: "anchor",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 2 },
    },
    {
      id: "dl2.xlsx::BOM::3",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 3 },
      line_type: "anchor",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 3 },
    },
    {
      id: "dl2.xlsx::BOM::4",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 4 },
      line_type: "item",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 4 },
    },
    {
      id: "dl2.xlsx::BOM::5",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 5 },
      line_type: "anchor",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 5 },
    },
    {
      id: "dl2.xlsx::BOM::6",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 6 },
      line_type: "item",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 6 },
    },
  ];

  const payload = segmentDellItems({ items });

  assert.equal(payload.vendor, "dell");
  assert.equal(payload.input_key, "dl2.xlsx");
  assert.equal(payload.segments.length, 3);

  const segmentIds = payload.segments.map((segment) => segment.segment_id);
  assert.deepEqual(segmentIds, ["dell_dl2_s001", "dell_dl2_s002", "dell_dl2_s003"]);

  for (const segment of payload.segments) {
    assert.equal(segment.counts.anchors, 1);
    assert.equal(segment.counts.items, segment.rows.length);
  }

  assert.deepEqual(payload.segments[0].rows.map((row) => row.row_index), [2]);
  assert.deepEqual(payload.segments[1].rows.map((row) => row.row_index), [3, 4]);
  assert.deepEqual(payload.segments[2].rows.map((row) => row.row_index), [5, 6]);
});

test("dell stage 1 outputs remain byte-identical for a sample workbook", async () => {
  const fixturePath = path.join("tests", "fixtures", "dell", "stage1-baseline.json");
  const fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-stage1-"));
  const inputPath = path.join(tempDir, "dl1.xlsx");
  const outDir = path.join(tempDir, "out");

  try {
    await writeWorkbook(inputPath, [
      ["Qty", "SKUs", "Option Name"],
      [2, "R740", "PowerEdge R740 Server"],
      [4, "MEM740", "Memory DIMM"],
    ]);

    await execFileAsync(
      "node",
      ["adapters/dell/index.js", inputPath, "--out", outDir],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_OPTIONS: `--require ${path.join(process.cwd(), "tests", "helpers", "fixed-date.cjs")}`,
        },
      },
    );

    const canonical = await fs.readFile(path.join(outDir, "canonical.jsonl"), "utf8");
    const items = await fs.readFile(path.join(outDir, "items.jsonl"), "utf8");
    const summary = await fs.readFile(path.join(outDir, "summary.json"), "utf8");

    assert.equal(canonical, fixture.canonical);
    assert.equal(items, fixture.items);
    assert.equal(summary, fixture.summary);

    const firstItem = JSON.parse(items.trim().split("\n")[0]);
    assert.ok(firstItem.line_type === "anchor" && firstItem.description);
    assert.ok(firstItem.product_number);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
