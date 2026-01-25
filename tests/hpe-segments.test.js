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

const readJson = async (filePath) => {
  const contents = await fs.readFile(filePath, "utf8");
  return JSON.parse(contents);
};

const createSampleWorkbook = (rows) => {
  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(rows);
  xlsx.utils.book_append_sheet(workbook, sheet, "BOM");
  return workbook;
};

const writeWorkbook = async (filePath, rows) => {
  const workbook = createSampleWorkbook(rows);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  xlsx.writeFile(workbook, filePath);
};

const runCanon = async (inputDir, outDir) => {
  await execFileAsync("node", ["adapters/hpe/index.js", inputDir, "--out", outDir], {
    cwd: process.cwd(),
  });
};

const runSegments = async (itemsPath, outputPath, mode = "strict") => {
  await execFileAsync(
    "node",
    ["scripts/diagnostics/hpe-segments.js", "--items", itemsPath, "--out", outputPath, "--mode", mode],
    { cwd: process.cwd() }
  );
};

const anchorSamples = [
  {
    name: "ex2.xlsx",
    anchorCount: 1,
    rows: [
      ["Qty", "Product #", "Product Description"],
      [2, "CTO100", "Configure-to-order Server DL360"],
      [4, "MEM100", "Memory DIMM"],
      [2, "NIC100", "Network Adapter"],
    ],
  },
  {
    name: "ex3.xlsx",
    anchorCount: 2,
    rows: [
      ["Qty", "Product #", "Product Description"],
      [1, "CTO200", "CTO Svr DL380"],
      [2, "DISK200", "Disk Drive"],
      [1, "CABLE200", "Cable Kit"],
      [3, "CTO201", "Configure-to-order Server DL360"],
      [6, "PSU201", "Power Supply"],
    ],
  },
  {
    name: "114649_DL360Gen12.xlsx",
    anchorCount: 1,
    rows: [
      ["Qty", "Product #", "Product Description"],
      [4, "CTO300", "Configure to order Server DL360 Gen12"],
      [8, "DIMM300", "32GB RAM"],
    ],
  },
  {
    name: "116945_DL380Gen12_5149181712-01.xlsx",
    anchorCount: 1,
    rows: [
      ["Qty", "Product #", "Product Description"],
      [2, "CTO400", "Configure-to-order Svr DL380 Gen12"],
      [4, "SSD400", "SSD 1TB"],
    ],
  },
  {
    name: "gleb1_5150324405-01.xlsx",
    anchorCount: 1,
    rows: [
      ["Qty", "Product #", "Product Description"],
      [3, "CTO500", "Configure-to-order Server"],
      [6, "NIC500", "10GbE NIC"],
    ],
  },
  {
    name: "99126 HPE_DL380G11.xlsx",
    anchorCount: 1,
    rows: [
      ["Qty", "Product #", "Product Description"],
      [2, "CTO600", "Configure-to-order Server DL380G11"],
      [4, "RAID600", "RAID Controller"],
    ],
  },
];

for (const sample of anchorSamples) {
  test(`segments anchored file: ${sample.name}`, async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-segments-"));
    const inputDir = path.join(tempDir, "input");
    const outDir = path.join(tempDir, "out");
    const segmentsPath = path.join(outDir, "segments.json");

    try {
      await fs.mkdir(inputDir, { recursive: true });
      const inputPath = path.join(inputDir, sample.name);
      await writeWorkbook(inputPath, sample.rows);

      await runCanon(inputDir, outDir);

      const itemsPath = path.join(outDir, "items.jsonl");
      await runSegments(itemsPath, segmentsPath, "strict");

      const items = await readJsonLines(itemsPath);
      const segments = await readJson(segmentsPath);

      assert.ok(segments.files);
      const fileEntry = segments.files.find((entry) => entry.file === sample.name);
      assert.ok(fileEntry, "file entry present");
      assert.equal(fileEntry.segments.length, sample.anchorCount);

      for (const segment of fileEntry.segments) {
        assert.equal(segment.is_partial, false);
        assert.ok(segment.server_anchor);
        assert.ok(segment.server_anchor.qty > 0);
        const nonAnchorItems = segment.items.filter((item) => !item.is_anchor);
        for (const item of nonAnchorItems) {
          assert.notEqual(item.per_server_qty, null);
        }
      }

      const divErrors = fileEntry.findings.filter((finding) => finding.code === "DIVISIBILITY" && finding.severity === "ERROR");
      assert.equal(divErrors.length, 0);

      const itemIds = items.map((item) => item.id);
      const segmentIds = fileEntry.segments.flatMap((segment) => segment.items.map((item) => item.item_id));
      assert.deepEqual(segmentIds, itemIds);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
}

test("segments group adjacent CTO variants into a single segment", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-segments-adjacent-"));
  const outDir = path.join(tempDir, "out");
  const itemsPath = path.join(outDir, "items.jsonl");
  const segmentsPath = path.join(outDir, "segments.json");

  const items = [
    {
      id: "adjacent.xlsx::BOM::10",
      source: { vendor: "HPE", file: "adjacent.xlsx", sheet: "BOM", row: 10 },
      qty: 2,
      product_number: "CTO900",
      description: "Configure-to-order Server DL360",
      device_type: "server",
      raw_ref: { file: "adjacent.xlsx", sheet: "BOM", row: 10 },
    },
    {
      id: "adjacent.xlsx::BOM::11",
      source: { vendor: "HPE", file: "adjacent.xlsx", sheet: "BOM", row: 11 },
      qty: 2,
      product_number: "CTO901",
      description: "Configure-to-order Server DL360 B19",
      device_type: "server",
      raw_ref: { file: "adjacent.xlsx", sheet: "BOM", row: 11 },
    },
    {
      id: "adjacent.xlsx::BOM::13",
      source: { vendor: "HPE", file: "adjacent.xlsx", sheet: "BOM", row: 13 },
      qty: 4,
      product_number: "MEM900",
      description: "Memory DIMM",
      device_type: "unknown",
      raw_ref: { file: "adjacent.xlsx", sheet: "BOM", row: 13 },
    },
    {
      id: "adjacent.xlsx::BOM::14",
      source: { vendor: "HPE", file: "adjacent.xlsx", sheet: "BOM", row: 14 },
      qty: 2,
      product_number: "NIC900",
      description: "Network Adapter",
      device_type: "unknown",
      raw_ref: { file: "adjacent.xlsx", sheet: "BOM", row: 14 },
    },
  ];

  try {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(itemsPath, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");

    await runSegments(itemsPath, segmentsPath, "strict");

    const segments = await readJson(segmentsPath);
    const fileEntry = segments.files.find((entry) => entry.file === "adjacent.xlsx");
    assert.ok(fileEntry);
    assert.equal(fileEntry.segments.length, 1);

    const [segment] = fileEntry.segments;
    const primaryAnchorItem = segment.items.find((item) => item.is_anchor);
    assert.equal(primaryAnchorItem?.source?.row, 10);
    assert.deepEqual(segment.secondary_anchor_rows, [11]);

    const segmentItemIds = segment.items.map((item) => item.item_id);
    assert.ok(segmentItemIds.includes("adjacent.xlsx::BOM::10"));
    assert.ok(segmentItemIds.includes("adjacent.xlsx::BOM::11"));

    const groupedFindings = fileEntry.findings.filter((finding) => finding.code === "ADJACENT_ANCHORS_GROUPED");
    assert.equal(groupedFindings.length, 1);
    assert.deepEqual(groupedFindings[0].context.secondary_anchor_rows, [11]);
    assert.equal(groupedFindings[0].context.primary_anchor_row, 10);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("segments file with no anchors produces single partial segment", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-segments-no-anchor-"));
  const outDir = path.join(tempDir, "out");
  const itemsPath = path.join(outDir, "items.jsonl");
  const segmentsPath = path.join(outDir, "segments.json");

  const items = [
    {
      id: "no-cto.xlsx::BOM::2",
      source: { vendor: "HPE", file: "no-cto.xlsx", sheet: "BOM", row_index: 2 },
      qty: 5,
      product_number: "ITEM1",
      description: "Standalone Option",
      device_type: "unknown",
      raw_ref: { file: "no-cto.xlsx", sheet: "BOM", row_index: 2 },
    },
    {
      id: "no-cto.xlsx::BOM::3",
      source: { vendor: "HPE", file: "no-cto.xlsx", sheet: "BOM", row_index: 3 },
      qty: 2,
      product_number: "ITEM2",
      description: "Another Option",
      device_type: "unknown",
      raw_ref: { file: "no-cto.xlsx", sheet: "BOM", row_index: 3 },
    },
  ];

  try {
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(itemsPath, `${items.map((item) => JSON.stringify(item)).join("\n")}\n`, "utf8");

    await runSegments(itemsPath, segmentsPath, "strict");

    const segments = await readJson(segmentsPath);
    const fileEntry = segments.files.find((entry) => entry.file === "no-cto.xlsx");
    assert.ok(fileEntry);
    assert.equal(fileEntry.segments.length, 1);
    assert.equal(fileEntry.segments[0].is_partial, true);

    const divErrors = fileEntry.findings.filter((finding) => finding.code === "DIVISIBILITY");
    assert.equal(divErrors.length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
