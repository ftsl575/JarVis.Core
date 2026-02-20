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
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "dl2.xlsx::BOM::3",
          qty: 4,
          product_number: "MEM740",
          description: "Memory DIMM",
          device_type: "memory",
          module_name_raw: "Memory",
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
          module_name_raw: "Service",
        },
        {
          source_ref: "dl2.xlsx::BOM::6",
          qty: 1,
          product_number: "SVC-2",
          description: "Deployment",
          device_type: "",
          line_type: "item",
          module_name_raw: "Service",
        },
        {
          source_ref: "dl2.xlsx::BOM::7",
          qty: 1,
          product_number: "MISC-1",
          description: "Misc component",
          device_type: "",
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
      "SERVER",
      "SYSTEM",
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
      "RAM",
      "PHYSICAL_COMPONENT",
    ]);

    const miscRow = rows[tableHeaderIndex + 3];
    assert.deepEqual(miscRow.slice(0, 6), [
      "",
      1,
      "MISC-1",
      "Misc component",
      "UNCLEAR",
      "PHYSICAL_COMPONENT",
    ]);

    const supportRow = rows[tableHeaderIndex + 4];
    assert.deepEqual(supportRow.slice(0, 6), [
      "",
      1,
      "SVC-1",
      "Support plan",
      "SERVICE",
      "SERVICE",
    ]);

    const deploymentRow = rows[tableHeaderIndex + 5];
    assert.deepEqual(deploymentRow.slice(0, 6), [
      "",
      1,
      "SVC-2",
      "Deployment",
      "SERVICE",
      "SERVICE",
    ]);

    const attributeRow = rows[tableHeaderIndex + 6];
    assert.deepEqual(attributeRow.slice(0, 6), [
      "",
      1,
      "BIOSTUNE",
      "BIOS Setting",
      "CONFIGURATION",
      "CONFIGURATION",
    ]);

    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);
    const unclearRows = tableRows.filter((row) => row[4] === "UNCLEAR");
    for (const row of tableRows) {
      assert.ok(row[5], "Expected semantic class column to be populated");
      assert.ok(row[4], "Expected device_type to be populated");
    }
    assert.equal(memoryRow[5], "PHYSICAL_COMPONENT");
    assert.equal(unclearRows.length, 1);
    assert.deepEqual(unclearRows[0].slice(0, 6), [
      "",
      1,
      "MISC-1",
      "Misc component",
      "UNCLEAR",
      "PHYSICAL_COMPONENT",
    ]);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});


test("docs:dell:cleaned_spec maps Block 1 hardware accessories to CHASSIS_PART via exact module name", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-block1-"));

  try {
    const accessoryModuleNames = [
      "Motherboard",
      "PCIe Riser",
      "Risers",
      "Front Bezel",
      "Bezel",
      "Power Cord",
      "Cables",
      "Rack Rails",
      "Rails",
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl2_s002",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "dl2.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "dl2.xlsx::BOM::2",
          qty: 1,
          product_number: "R650",
          description: "PowerEdge R650 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...accessoryModuleNames.map((moduleName, index) => ({
          source_ref: `dl2.xlsx::BOM::${index + 3}`,
          qty: 1,
          product_number: `PART-${index + 1}`,
          description: `${moduleName} part`,
          line_type: "item",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl2_s002.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const outputPath = path.join(tempDir, "cleaned_spec.dell.segment_dell_dl2_s002.xlsx");
    const workbook = xlsx.readFile(outputPath);
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    for (const moduleName of accessoryModuleNames) {
      const row = tableRows.find((candidate) => candidate[10] === moduleName);
      assert.ok(row, `Expected row for module ${moduleName}`);
      assert.equal(row[4], "CHASSIS_PART");
      assert.equal(row[5], "PHYSICAL_COMPONENT");
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec maps Block 3 configuration and metadata modules to CONFIGURATION", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-block3-"));

  try {
    const configurationModuleNames = [
      "Memory Configuration Type",
      "Advanced System Configurations",
      "BIOS Settings",
      "Trusted Platform Module",
      "Order Configuration",
      "Shipping",
      "Shipping Material",
      "Regulatory",
      "Asset Tagging",
      "Anti Theft Device & Asset Tagging",
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl2_s003",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "dl2.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "dl2.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "dl2.xlsx::BOM::3",
          qty: 2,
          product_number: "CPU-1",
          description: "Processor",
          line_type: "item",
          module_name_raw: "CPU",
        },
        ...configurationModuleNames.map((moduleName, index) => ({
          source_ref: `dl2.xlsx::BOM::${index + 4}`,
          qty: 1,
          product_number: `CFG-${index + 1}`,
          description: `${moduleName} setting`,
          line_type: "item",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl2_s003.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const outputPath = path.join(tempDir, "cleaned_spec.dell.segment_dell_dl2_s003.xlsx");
    const workbook = xlsx.readFile(outputPath);
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const cpuRow = tableRows.find((candidate) => candidate[10] === "CPU");
    assert.ok(cpuRow, "Expected CPU row to exist");
    assert.equal(cpuRow[4], "CPU");
    assert.equal(cpuRow[5], "PHYSICAL_COMPONENT");

    for (const moduleName of configurationModuleNames) {
      const row = tableRows.find((candidate) => candidate[10] === moduleName);
      assert.ok(row, `Expected row for module ${moduleName}`);
      assert.equal(row[4], "CONFIGURATION");
      assert.equal(row[5], "CONFIGURATION");
    }

    const unclearRows = tableRows.filter((row) => row[4] === "UNCLEAR");
    assert.equal(unclearRows.length, 0);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec maps Stage 4 V2 physical component exact names deterministically", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-stage4v2-"));

  try {
    const expectations = [
      ["Power Cords", "CHASSIS_PART"],
      ["Cables", "CHASSIS_PART"],
      ["Rails", "CHASSIS_PART"],
      ["GPU/FPGA/Acceleration Cables", "CHASSIS_PART"],
      ["Heatsink", "HEATSINK"],
      ["Power Supply", "PSU"],
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl5_s001",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "dl5.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "dl5.xlsx::BOM::2",
          qty: 1,
          product_number: "R660",
          description: "PowerEdge R660 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...expectations.map(([moduleName], index) => ({
          source_ref: `dl5.xlsx::BOM::${index + 3}`,
          qty: 1,
          product_number: `PART-${index + 1}`,
          description: `${moduleName} component`,
          line_type: "item",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl5_s001.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const outputPath = path.join(tempDir, "cleaned_spec.dell.segment_dell_dl5_s001.xlsx");
    const workbook = xlsx.readFile(outputPath);
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    for (const [moduleName, expectedDeviceType] of expectations) {
      const row = tableRows.find((candidate) => candidate[10] === moduleName);
      assert.ok(row, `Expected row for module ${moduleName}`);
      assert.equal(row[4], expectedDeviceType);
      assert.equal(row[5], "PHYSICAL_COMPONENT");
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
