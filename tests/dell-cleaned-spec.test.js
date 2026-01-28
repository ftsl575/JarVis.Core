import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import xlsx from "xlsx";

const execFileAsync = promisify(execFile);

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

const writeSegmentPayload = async ({ dir, payload, filename }) => {
  await fs.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
};

test("docs:dell:cleaned_spec emits deterministic rows from Stage 3 segment JSON", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-"));

  try {
    const payload = {
      vendor: "dell",
      segment_id: "dell_dl2_s001",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "dl2.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "dl2.xlsx::BOM::2",
          qty: 2,
          product_number: "R740",
          description: "PowerEdge R740 Server",
          device_type: "server",
          line_type: "anchor",
        },
        {
          source_ref: "dl2.xlsx::BOM::3",
          qty: 4,
          product_number: "MEM740",
          description: "Memory DIMM",
          device_type: "memory",
          line_type: "item",
        },
        {
          source_ref: "dl2.xlsx::BOM::4",
          qty: 1,
          product_number: "BIOSTUNE",
          description: "BIOS Setting",
          device_type: "configuration",
          line_type: "attribute",
        },
        {
          source_ref: "dl2.xlsx::BOM::5",
          qty: 1,
          product_number: "SVC-1",
          description: "Support plan",
          device_type: "support",
          line_type: "item",
        },
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl2_s001.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const outputPath = path.join(tempDir, "cleaned_spec.dell.segment_dell_dl2_s001.xlsx");
    await assert.doesNotReject(() => fs.stat(outputPath));

    const workbook = xlsx.readFile(outputPath);
    assert.deepEqual(workbook.SheetNames, ["Cfg 01"]);

    const sheet = workbook.Sheets["Cfg 01"];
    const rows = readSheetRows(sheet);

    const configRow = rows[findRowIndex(rows, "Configuration")];
    assert.equal(configRow?.[1], "dell_dl2_s001");

    const serverDescRow = rows[findRowIndex(rows, "Server model/description")];
    assert.equal(serverDescRow?.[1], "PowerEdge R740 Server");

    const serverCountRow = rows[findRowIndex(rows, "Server count in order")];
    assert.equal(serverCountRow?.[1], 2);

    const tableHeaderIndex = findTableHeaderIndex(rows);
    assert.ok(tableHeaderIndex >= 0);

    const anchorRow = rows[tableHeaderIndex + 1];
    assert.deepEqual(anchorRow.slice(0, 6), [
      1,
      2,
      "R740",
      "PowerEdge R740 Server",
      "server",
      "anchor",
    ]);
    assert.deepEqual(anchorRow.slice(6, 10), [
      "dl2.xlsx",
      "BOM",
      2,
      "dl2.xlsx::BOM::2",
    ]);

    const memoryRow = rows[tableHeaderIndex + 2];
    assert.deepEqual(memoryRow.slice(0, 6), [
      "",
      4,
      "MEM740",
      "Memory DIMM",
      "memory",
      "item",
    ]);

    const attributeRow = rows[tableHeaderIndex + 3];
    assert.deepEqual(attributeRow.slice(0, 6), [
      "",
      1,
      "BIOSTUNE",
      "BIOS Setting",
      "configuration",
      "attribute",
    ]);

    const supportRow = rows[tableHeaderIndex + 4];
    assert.deepEqual(supportRow.slice(0, 6), [
      "",
      1,
      "SVC-1",
      "Support plan",
      "support",
      "item",
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
