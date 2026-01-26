import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { materializeDellSegments } from "../../../scripts/diag/dell/materialize.mjs";

const toJsonl = (items) => `${items.map((item) => JSON.stringify(item)).join("\n")}\n`;

test("dell stage 3 materializes per-segment JSON deterministically", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-materialize-"));
  const outDir = path.join(tempDir, "out");
  await fs.mkdir(outDir, { recursive: true });

  const items = [
    {
      id: "dl2.xlsx::BOM::2",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 2 },
      qty: 2,
      product_number: "R740",
      description: "PowerEdge R740 Server",
      device_type: "Server",
      line_type: "anchor",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 2 },
    },
    {
      id: "dl2.xlsx::BOM::3",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 3 },
      qty: 4,
      product_number: "MEM740",
      description: "Memory DIMM",
      device_type: "Memory",
      line_type: "item",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 3 },
    },
    {
      id: "dl2.xlsx::BOM::4",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 4 },
      qty: 1,
      product_number: null,
      description: "Rail Kit",
      device_type: "Accessory",
      line_type: "item",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 4 },
    },
    {
      id: "dl2.xlsx::BOM::5",
      source: { vendor: "Dell", file: "dl2.xlsx", sheet: "BOM", row_index: 5 },
      qty: 8,
      product_number: "NIC",
      description: "Network Adapter",
      device_type: "Network",
      line_type: "anchor",
      raw_ref: { file: "dl2.xlsx", sheet: "BOM", row_index: 5 },
    },
  ];

  const segmentsPayload = {
    vendor: "dell",
    input_key: "dl2.xlsx",
    segments: [
      {
        segment_id: "dell_dl2_s001",
        anchor: { sheet: "BOM", row_index: 2, source_ref: "dl2.xlsx::BOM::2" },
        rows: [
          { sheet: "BOM", row_index: 2, source_ref: "dl2.xlsx::BOM::2" },
          { sheet: "BOM", row_index: 3, source_ref: "dl2.xlsx::BOM::3" },
          { sheet: "BOM", row_index: 4, source_ref: "dl2.xlsx::BOM::4" },
        ],
        counts: { items: 3, anchors: 1 },
      },
      {
        segment_id: "dell_dl2_s002",
        anchor: { sheet: "BOM", row_index: 5, source_ref: "dl2.xlsx::BOM::5" },
        rows: [{ sheet: "BOM", row_index: 5, source_ref: "dl2.xlsx::BOM::5" }],
        counts: { items: 1, anchors: 1 },
      },
    ],
    meta: { schema_version: 1 },
  };

  const itemsPath = path.join(outDir, "items.jsonl");
  const segmentsPath = path.join(outDir, "segments.dell.json");

  const itemsJsonl = toJsonl(items);
  const segmentsJson = `${JSON.stringify(segmentsPayload, null, 2)}\n`;

  await fs.writeFile(itemsPath, itemsJsonl, "utf8");
  await fs.writeFile(segmentsPath, segmentsJson, "utf8");

  const itemsBefore = await fs.readFile(itemsPath, "utf8");
  const segmentsBefore = await fs.readFile(segmentsPath, "utf8");

  await materializeDellSegments({ segmentsPath, itemsPath, outDir });

  const outputFiles = (await fs.readdir(outDir)).filter((name) => name.startsWith("dell_segment_"));
  assert.deepEqual(outputFiles.sort(), [
    "dell_segment_dell_dl2_s001.json",
    "dell_segment_dell_dl2_s002.json",
  ]);

  const firstOutput = await fs.readFile(path.join(outDir, "dell_segment_dell_dl2_s001.json"), "utf8");
  const secondOutput = await fs.readFile(path.join(outDir, "dell_segment_dell_dl2_s002.json"), "utf8");

  const expectedFirst = {
    vendor: "dell",
    segment_id: "dell_dl2_s001",
    anchor: { sheet: "BOM", row_index: 2, source_ref: "dl2.xlsx::BOM::2" },
    items: [
      {
        source_ref: "dl2.xlsx::BOM::2",
        qty: 2,
        product_number: "R740",
        description: "PowerEdge R740 Server",
        device_type: "Server",
        line_type: "anchor",
      },
      {
        source_ref: "dl2.xlsx::BOM::3",
        qty: 4,
        product_number: "MEM740",
        description: "Memory DIMM",
        device_type: "Memory",
        line_type: "item",
      },
      {
        source_ref: "dl2.xlsx::BOM::4",
        qty: 1,
        product_number: null,
        description: "Rail Kit",
        device_type: "Accessory",
        line_type: "item",
      },
    ],
    meta: { schema_version: 1 },
  };

  const expectedSecond = {
    vendor: "dell",
    segment_id: "dell_dl2_s002",
    anchor: { sheet: "BOM", row_index: 5, source_ref: "dl2.xlsx::BOM::5" },
    items: [
      {
        source_ref: "dl2.xlsx::BOM::5",
        qty: 8,
        product_number: "NIC",
        description: "Network Adapter",
        device_type: "Network",
        line_type: "anchor",
      },
    ],
    meta: { schema_version: 1 },
  };

  assert.equal(firstOutput, `${JSON.stringify(expectedFirst, null, 2)}\n`);
  assert.equal(secondOutput, `${JSON.stringify(expectedSecond, null, 2)}\n`);

  const itemsAfter = await fs.readFile(itemsPath, "utf8");
  const segmentsAfter = await fs.readFile(segmentsPath, "utf8");

  assert.equal(itemsAfter, itemsBefore);
  assert.equal(segmentsAfter, segmentsBefore);

  await fs.rm(tempDir, { recursive: true, force: true });
});
