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


test("docs:dell:cleaned_spec maps Stage 4 V5 configuration allowlist module names to CONFIGURATION", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-stage4v5-"));

  try {
    const configurationModuleNames = [
      "Base",
      "Thermal Configuration",
      "BIOS and Advanced System Configuration Settings",
      "DPU Cables",
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl6_s001",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "dl6.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "dl6.xlsx::BOM::2",
          qty: 1,
          product_number: "R760XA",
          description: "PowerEdge R760xa Server",
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "dl6.xlsx::BOM::3",
          qty: 2,
          product_number: "CPU-1",
          description: "Processor",
          line_type: "item",
          module_name_raw: "CPU",
        },
        ...configurationModuleNames.map((moduleName, index) => ({
          source_ref: `dl6.xlsx::BOM::${index + 4}`,
          qty: 1,
          product_number: `CFG-${index + 1}`,
          description: `${moduleName} setting`,
          line_type: "attribute",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl6_s001.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const outputPath = path.join(tempDir, "cleaned_spec.dell.segment_dell_dl6_s001.xlsx");
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
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec Fast Path overrides item to SYSTEM/SERVER for PowerEdge model module names", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-fastpath-system-"));

  try {
    const powerEdgeModuleNames = [
      "PowerEdge R6715",
      "PowerEdge R660",
      "PowerEdge R770",
      "PowerEdge R7625",
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_fp_sys",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "fp.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "fp.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...powerEdgeModuleNames.map((moduleName, index) => ({
          source_ref: `fp.xlsx::BOM::${index + 3}`,
          qty: 1,
          product_number: `SYS-${index + 1}`,
          description: `Server ${moduleName}`,
          line_type: "item",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_fp_sys.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_fp_sys.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    for (const moduleName of powerEdgeModuleNames) {
      const row = tableRows.find((candidate) => candidate[10] === moduleName);
      assert.ok(row, `Expected row for module ${moduleName}`);
      assert.equal(row[5], "SYSTEM", `line_type for ${moduleName}`);
      assert.equal(row[4], "SERVER", `device_type for ${moduleName}`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec Fast Path overrides item to CONFIGURATION for metadata module names including Shipping Box Labels - Standard", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-fastpath-config-"));

  try {
    const configModuleNames = [
      "Regulatory",
      "Shipping Material",
      "Asset Tagging",
      "Trusted Platform Module",
      "Shipping Box Labels - Standard",
      "Order Configuration",
      "Shipping",
      "Anti Theft Device & Asset Tagging",
      "Memory Configuration Type",
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_fp_cfg",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "fp.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "fp.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...configModuleNames.map((moduleName, index) => ({
          source_ref: `fp.xlsx::BOM::${index + 3}`,
          qty: 1,
          product_number: `CFG-${index + 1}`,
          description: `Metadata ${moduleName}`,
          line_type: "item",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_fp_cfg.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_fp_cfg.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    for (const moduleName of configModuleNames) {
      const row = tableRows.find((candidate) => candidate[10] === moduleName);
      assert.ok(row, `Expected row for module ${moduleName}`);
      assert.equal(row[5], "CONFIGURATION", `line_type for ${moduleName}`);
      assert.equal(row[4], "CONFIGURATION", `device_type for ${moduleName}`);
    }

    const shippingBoxRow = tableRows.find((candidate) => candidate[10] === "Shipping Box Labels - Standard");
    assert.ok(shippingBoxRow, "Expected row for Shipping Box Labels - Standard");
    assert.equal(shippingBoxRow[4], "CONFIGURATION");
    assert.equal(shippingBoxRow[5], "CONFIGURATION");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec Base system anchor: each allowlisted description with module_name_raw Base yields SYSTEM/SERVER", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-base-anchor-"));

  try {
    const allowlistedDescriptions = [
      "PowerEdge R660 Server",
      "PowerEdge R770 Server",
      "PowerEdge R7625 Server",
      "PowerEdge R760 Server",
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_base",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "base.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "base.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...allowlistedDescriptions.map((description, index) => ({
          source_ref: `base.xlsx::BOM::${index + 3}`,
          qty: 1,
          product_number: `PN-${index + 1}`,
          description,
          line_type: "item",
          module_name_raw: "Base",
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_base.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_base.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const partNumbers = allowlistedDescriptions.map((_, index) => `PN-${index + 1}`);
    for (let i = 0; i < allowlistedDescriptions.length; i += 1) {
      const row = tableRows.find((candidate) => candidate[2] === partNumbers[i]);
      assert.ok(row, `Expected row for ${partNumbers[i]}`);
      assert.equal(row[3], allowlistedDescriptions[i]);
      assert.equal(row[5], "SYSTEM", `line_type for ${allowlistedDescriptions[i]}`);
      assert.equal(row[4], "SERVER", `device_type for ${allowlistedDescriptions[i]}`);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec Base with description not in allowlist does not yield SYSTEM/SERVER", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-base-no-overclaim-"));

  try {
    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_base_nolist",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "base.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "base.xlsx::BOM::2",
          qty: 1,
          product_number: "R740",
          description: "PowerEdge R740 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "base.xlsx::BOM::3",
          qty: 1,
          product_number: "OTHER",
          description: "PowerEdge R740 Server",
          line_type: "item",
          module_name_raw: "Base",
        },
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_base_nolist.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_base_nolist.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const anchorRow = tableRows[0];
    assert.equal(anchorRow[5], "SYSTEM");
    assert.equal(anchorRow[4], "SERVER");

    const baseNotInListRow = tableRows.find((candidate) => candidate[2] === "OTHER" && candidate[10] === "Base");
    assert.ok(baseNotInListRow, "Expected row with module_name_raw Base and description not in allowlist");
    assert.notEqual(baseNotInListRow[5], "SYSTEM", "Base + non-allowlist description must not be classified as SYSTEM");
    assert.notEqual(baseNotInListRow[4], "SERVER", "Base + non-allowlist description must not be classified as SERVER");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

const UNCLEAR_REDUCTION_MODULE_EXPECTATIONS = [
  ["Additional Processor Features", "CONFIGURATION", "CONFIGURATION"],
  ["Advanced System Configurations", "CONFIGURATION", "CONFIGURATION"],
  ["BIOS and Advanced System Configuration Settings", "CONFIGURATION", "CONFIGURATION"],
  ["Bezel", "PHYSICAL_COMPONENT", "CHASSIS_PART"],
  ["Boot Optimized Storage Cards", "PHYSICAL_COMPONENT", "RAID_CONTROLLER"],
  ["Cables", "CONFIGURATION", "CONFIGURATION"],
  ["Chassis Configuration", "CONFIGURATION", "CONFIGURATION"],
  ["DPU Cables", "CONFIGURATION", "CONFIGURATION"],
  ["Dell Secure Onboarding", "CONFIGURATION", "CONFIGURATION"],
  ["Dell Services: Hardware Support", "SERVICE", "SERVICE"],
  ["Embedded Systems Management", "CONFIGURATION", "CONFIGURATION"],
  ["Extended Service", "SERVICE", "SERVICE"],
  ["Fans", "PHYSICAL_COMPONENT", "FAN"],
  ["GPU/FPGA/Acceleration Cables", "CONFIGURATION", "CONFIGURATION"],
  ["Hard Drives", "PHYSICAL_COMPONENT", "HDD"],
  ["Hard Drives (PCIe SSD/Flex Bay)", "PHYSICAL_COMPONENT", "SSD"],
  ["Infrastructure Deployment Svcs", "SERVICE", "SERVICE"],
  ["KVM/Quick Sync", "CONFIGURATION", "CONFIGURATION"],
  ["Memory Capacity", "PHYSICAL_COMPONENT", "RAM"],
  ["Memory Configuration Type", "CONFIGURATION", "CONFIGURATION"],
  ["Memory DIMM Type and Speed", "CONFIGURATION", "CONFIGURATION"],
  ["Motherboard", "PHYSICAL_COMPONENT", "CHASSIS_PART"],
  ["OCP 3.0 Accessories", "PHYSICAL_COMPONENT", "CHASSIS_PART"],
  ["OCP 3.0 Network Adapters", "PHYSICAL_COMPONENT", "NIC"],
  ["OS Media Kits", "CONFIGURATION", "CONFIGURATION"],
  ["Operating System", "CONFIGURATION", "CONFIGURATION"],
  ["PCIe Riser", "PHYSICAL_COMPONENT", "CHASSIS_PART"],
  ["Password", "CONFIGURATION", "CONFIGURATION"],
  ["Power Cords", "PHYSICAL_COMPONENT", "CHASSIS_PART"],
  ["Power Supply", "PHYSICAL_COMPONENT", "PSU"],
  ["PowerEdge R6715", "SYSTEM", "SERVER"],
  ["Processor", "PHYSICAL_COMPONENT", "CPU"],
  ["Processor Thermal Configuration", "PHYSICAL_COMPONENT", "HEATSINK"],
  ["RAID Configuration", "CONFIGURATION", "CONFIGURATION"],
  ["RAID/Internal Storage Controllers", "PHYSICAL_COMPONENT", "RAID_CONTROLLER"],
  ["Rack Rails", "PHYSICAL_COMPONENT", "CHASSIS_PART"],
  ["Regulatory", "CONFIGURATION", "CONFIGURATION"],
  ["Shipping", "CONFIGURATION", "CONFIGURATION"],
  ["Shipping Material", "CONFIGURATION", "CONFIGURATION"],
];

test("docs:dell:cleaned_spec exact module_name_raw mapping reduces UNCLEAR for closed list", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-unclear-reduction-"));

  try {
    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_unclear",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "unclear.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "unclear.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...UNCLEAR_REDUCTION_MODULE_EXPECTATIONS.map(([moduleName], index) => ({
          source_ref: `unclear.xlsx::BOM::${index + 3}`,
          qty: 1,
          product_number: `M-${index + 1}`,
          description: `Item ${moduleName}`,
          line_type: "item",
          module_name_raw: moduleName,
        })),
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_unclear.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_unclear.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    for (const [moduleName, expectedLineType, expectedDeviceType] of UNCLEAR_REDUCTION_MODULE_EXPECTATIONS) {
      const row = tableRows.find((candidate) => candidate[10] === moduleName);
      assert.ok(row, `Expected row for module ${moduleName}`);
      assert.equal(row[5], expectedLineType, `line_type for ${moduleName}`);
      assert.equal(row[4], expectedDeviceType, `device_type for ${moduleName}`);
    }

    const ocpAccessoriesRow = tableRows.find((candidate) => candidate[10] === "OCP 3.0 Accessories");
    assert.ok(ocpAccessoriesRow, "Expected row for OCP 3.0 Accessories");
    assert.equal(ocpAccessoriesRow[4], "CHASSIS_PART", "OCP 3.0 Accessories must be CHASSIS_PART");
    assert.notEqual(ocpAccessoriesRow[4], "NIC", "OCP 3.0 Accessories must not be classified as NIC");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec Memory Capacity is PHYSICAL_COMPONENT/RAM; Memory Configuration Type and Memory DIMM Type and Speed remain CONFIGURATION", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-memory-capacity-"));

  try {
    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_mem",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "mem.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "mem.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "mem.xlsx::BOM::3",
          qty: 4,
          product_number: "MEM-1",
          description: "16GB RDIMM, 5600MT/s",
          line_type: "item",
          module_name_raw: "Memory Capacity",
        },
        {
          source_ref: "mem.xlsx::BOM::4",
          qty: 1,
          product_number: "CFG-1",
          description: "Memory config setting",
          line_type: "item",
          module_name_raw: "Memory Configuration Type",
        },
        {
          source_ref: "mem.xlsx::BOM::5",
          qty: 1,
          product_number: "CFG-2",
          description: "DIMM type and speed setting",
          line_type: "item",
          module_name_raw: "Memory DIMM Type and Speed",
        },
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_mem.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_mem.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const memoryCapacityRow = tableRows.find((candidate) => candidate[10] === "Memory Capacity");
    assert.ok(memoryCapacityRow, "Expected row for Memory Capacity");
    assert.equal(memoryCapacityRow[5], "PHYSICAL_COMPONENT", "Memory Capacity must be PHYSICAL_COMPONENT");
    assert.equal(memoryCapacityRow[4], "RAM", "Memory Capacity must be device_type RAM");

    const memoryConfigTypeRow = tableRows.find((candidate) => candidate[10] === "Memory Configuration Type");
    assert.ok(memoryConfigTypeRow, "Expected row for Memory Configuration Type");
    assert.equal(memoryConfigTypeRow[5], "CONFIGURATION", "Memory Configuration Type must remain CONFIGURATION");
    assert.equal(memoryConfigTypeRow[4], "CONFIGURATION", "Memory Configuration Type device_type must remain CONFIGURATION");

    const memoryDimmTypeRow = tableRows.find((candidate) => candidate[10] === "Memory DIMM Type and Speed");
    assert.ok(memoryDimmTypeRow, "Expected row for Memory DIMM Type and Speed");
    assert.equal(memoryDimmTypeRow[5], "CONFIGURATION", "Memory DIMM Type and Speed must remain CONFIGURATION");
    assert.equal(memoryDimmTypeRow[4], "CONFIGURATION", "Memory DIMM Type and Speed device_type must remain CONFIGURATION");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec misclassification fixes: RAM/thermal/cables/controller", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-misclass-fix-"));

  try {
    const items = [
      {
        source_ref: "fix.xlsx::BOM::3",
        qty: 4,
        product_number: "MEM-1",
        description: "16GB RDIMM, 5600MT/s, Single Rank",
        line_type: "item",
        module_name_raw: "Memory Capacity",
      },
      {
        source_ref: "fix.xlsx::BOM::4",
        qty: 1,
        product_number: "CFG-1",
        description: "Performance Optimized",
        line_type: "item",
        module_name_raw: "Memory Configuration Type",
      },
      {
        source_ref: "fix.xlsx::BOM::5",
        qty: 1,
        product_number: "CFG-2",
        description: "5600MT/s RDIMMs",
        line_type: "item",
        module_name_raw: "Memory DIMM Type and Speed",
      },
      {
        source_ref: "fix.xlsx::BOM::6",
        qty: 1,
        product_number: "HS-1",
        description: "Heatsink for 2 CPU configuration ...",
        line_type: "item",
        module_name_raw: "Processor Thermal Configuration",
      },
      {
        source_ref: "fix.xlsx::BOM::7",
        qty: 1,
        product_number: "CPU-F-1",
        description: "No HBM",
        line_type: "item",
        module_name_raw: "Additional Processor Features",
      },
      {
        source_ref: "fix.xlsx::BOM::8",
        qty: 1,
        product_number: "CBL-1",
        description: "No Cables Required, No GPU Blanks",
        line_type: "item",
        module_name_raw: "GPU/FPGA/Acceleration Cables",
      },
      {
        source_ref: "fix.xlsx::BOM::9",
        qty: 1,
        product_number: "CBL-2",
        description: "No DPUs Cable Required, No DPU",
        line_type: "item",
        module_name_raw: "Cables",
      },
      {
        source_ref: "fix.xlsx::BOM::10",
        qty: 1,
        product_number: "BOSS-1",
        description: "BOSS-N1 controller card + with 2 M.2 ...",
        line_type: "item",
        module_name_raw: "Boot Optimized Storage Cards",
      },
    ];

    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_fix",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "fix.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "fix.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        ...items,
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_fix.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_fix.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const byModule = (name) => tableRows.find((r) => r[10] === name);

    assert.deepEqual(
      [byModule("Memory Capacity")?.[5], byModule("Memory Capacity")?.[4]],
      ["PHYSICAL_COMPONENT", "RAM"],
      "Memory Capacity -> PHYSICAL_COMPONENT / RAM"
    );
    assert.deepEqual(
      [byModule("Memory Configuration Type")?.[5], byModule("Memory Configuration Type")?.[4]],
      ["CONFIGURATION", "CONFIGURATION"],
      "Memory Configuration Type -> CONFIGURATION / CONFIGURATION"
    );
    assert.deepEqual(
      [byModule("Memory DIMM Type and Speed")?.[5], byModule("Memory DIMM Type and Speed")?.[4]],
      ["CONFIGURATION", "CONFIGURATION"],
      "Memory DIMM Type and Speed -> CONFIGURATION / CONFIGURATION"
    );
    assert.deepEqual(
      [byModule("Processor Thermal Configuration")?.[5], byModule("Processor Thermal Configuration")?.[4]],
      ["PHYSICAL_COMPONENT", "HEATSINK"],
      "Processor Thermal Configuration -> PHYSICAL_COMPONENT / HEATSINK"
    );
    assert.deepEqual(
      [byModule("Additional Processor Features")?.[5], byModule("Additional Processor Features")?.[4]],
      ["CONFIGURATION", "CONFIGURATION"],
      "Additional Processor Features -> CONFIGURATION / CONFIGURATION"
    );
    assert.deepEqual(
      [byModule("GPU/FPGA/Acceleration Cables")?.[5], byModule("GPU/FPGA/Acceleration Cables")?.[4]],
      ["CONFIGURATION", "CONFIGURATION"],
      "GPU/FPGA/Acceleration Cables -> CONFIGURATION / CONFIGURATION"
    );
    assert.deepEqual(
      [byModule("Cables")?.[5], byModule("Cables")?.[4]],
      ["CONFIGURATION", "CONFIGURATION"],
      "Cables -> CONFIGURATION / CONFIGURATION"
    );
    assert.deepEqual(
      [byModule("Boot Optimized Storage Cards")?.[5], byModule("Boot Optimized Storage Cards")?.[4]],
      ["PHYSICAL_COMPONENT", "RAID_CONTROLLER"],
      "Boot Optimized Storage Cards -> PHYSICAL_COMPONENT / RAID_CONTROLLER"
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec Processor Thermal Configuration and Boot Optimized Storage Cards single mapping (no duplicate rules)", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-single-map-"));

  try {
    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_single",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "s.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "s.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "s.xlsx::BOM::3",
          qty: 1,
          product_number: "HS-1",
          description: "Heatsink for 2 CPU",
          line_type: "item",
          module_name_raw: "Processor Thermal Configuration",
        },
        {
          source_ref: "s.xlsx::BOM::4",
          qty: 1,
          product_number: "BOSS-1",
          description: "BOSS-N1 controller",
          line_type: "item",
          module_name_raw: "Boot Optimized Storage Cards",
        },
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_single.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_single.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const thermalRow = tableRows.find((r) => r[10] === "Processor Thermal Configuration");
    assert.ok(thermalRow, "Processor Thermal Configuration row");
    assert.equal(thermalRow[5], "PHYSICAL_COMPONENT", "Processor Thermal Configuration -> PHYSICAL_COMPONENT");
    assert.equal(thermalRow[4], "HEATSINK", "Processor Thermal Configuration -> HEATSINK");

    const bossRow = tableRows.find((r) => r[10] === "Boot Optimized Storage Cards");
    assert.ok(bossRow, "Boot Optimized Storage Cards row");
    assert.equal(bossRow[5], "PHYSICAL_COMPONENT", "Boot Optimized Storage Cards -> PHYSICAL_COMPONENT");
    assert.equal(bossRow[4], "RAID_CONTROLLER", "Boot Optimized Storage Cards -> RAID_CONTROLLER (storage controller)");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

test("docs:dell:cleaned_spec unknown module_name_raw still yields UNCLEAR (no overreach)", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dell-cleaned-spec-unknown-module-"));

  try {
    const payload = {
      vendor: "dell",
      segment_id: "dell_dl_unknown",
      anchor: {
        sheet: "BOM",
        row_index: 2,
        source_ref: "unk.xlsx::BOM::2",
      },
      items: [
        {
          source_ref: "unk.xlsx::BOM::2",
          qty: 1,
          product_number: "R760",
          description: "PowerEdge R760 Server",
          device_type: "Server",
          line_type: "anchor",
        },
        {
          source_ref: "unk.xlsx::BOM::3",
          qty: 1,
          product_number: "UNK-1",
          description: "Some unknown part",
          line_type: "item",
          module_name_raw: "Unknown Module XYZ",
        },
      ],
      meta: { schema_version: 1 },
    };

    const segmentPath = await writeSegmentPayload({
      dir: tempDir,
      payload,
      filename: "dell_segment_dell_dl_unknown.json",
    });

    await execFileAsync("node", ["scripts/dell-cleaned-spec.js", segmentPath], {
      cwd: process.cwd(),
    });

    const workbook = xlsx.readFile(path.join(tempDir, "cleaned_spec.dell.segment_dell_dl_unknown.xlsx"));
    const rows = readSheetRows(workbook.Sheets["Cfg 01"]);
    const tableHeaderIndex = findTableHeaderIndex(rows);
    const tableRows = rows.slice(tableHeaderIndex + 1, tableHeaderIndex + 1 + payload.items.length);

    const unknownRow = tableRows.find((candidate) => candidate[10] === "Unknown Module XYZ");
    assert.ok(unknownRow, "Expected row for unknown module");
    assert.equal(unknownRow[4], "UNCLEAR", "Unknown module_name_raw must yield device_type UNCLEAR");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
