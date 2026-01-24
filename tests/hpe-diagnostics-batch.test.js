import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverHpeBatchInputs, runHpeBatch } from "../scripts/diagnostics/hpe-batch.js";

const writeFile = async (filePath, content) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
};

test("discoverHpeBatchInputs finds direct .xlsx files in stable order", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-batch-discovery-"));
  await writeFile(path.join(tempDir, "b.xlsx"), "b");
  await writeFile(path.join(tempDir, "A.xlsx"), "a");
  await writeFile(path.join(tempDir, "a.XLSX"), "aa");
  await writeFile(path.join(tempDir, "notes.txt"), "notes");
  await fs.mkdir(path.join(tempDir, "nested"), { recursive: true });
  await writeFile(path.join(tempDir, "nested", "ignored.xlsx"), "ignored");

  const found = await discoverHpeBatchInputs(tempDir);
  const expected = [
    path.resolve(tempDir, "A.xlsx"),
    path.resolve(tempDir, "a.XLSX"),
    path.resolve(tempDir, "b.xlsx"),
  ];

  assert.deepEqual(found, expected);
});

test("runHpeBatch records per-input snapshots with input paths and distinct inputs", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-batch-run-"));
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const batchInputDir = path.join(tempDir, "batch_inputs");
    const samplesDir = path.join(tempDir, "samples", "hpe");
    const outDir = path.join(tempDir, "out");
    const diagRoot = path.join(tempDir, "diag");
    await fs.mkdir(batchInputDir, { recursive: true });
    await fs.mkdir(samplesDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    const inputs = [
      path.join(batchInputDir, "alpha.xlsx"),
      path.join(batchInputDir, "bravo.XLSX"),
      path.join(batchInputDir, "charlie.xlsx"),
    ];
    await Promise.all([
      writeFile(inputs[0], "alpha"),
      writeFile(inputs[1], "bravo"),
      writeFile(inputs[2], "charlie"),
    ]);

    const execCommand = ({ args }) => {
      const scriptName = args[1];
      if (scriptName === "canon:hpe") {
        return fs
          .readFile(path.join(samplesDir, "input.xlsx"), "utf8")
          .then((content) =>
            Promise.all([
              writeFile(path.join(outDir, "canonical.jsonl"), JSON.stringify({ id: content.trim() })),
              writeFile(
                path.join(outDir, "items.jsonl"),
                `${JSON.stringify({
                  product_number: content.trim(),
                  description: "Item",
                  device_type: "Server",
                  source: { file: "input.xlsx" },
                })}\n`
              ),
              writeFile(path.join(outDir, "summary.json"), JSON.stringify({ ok: true })),
            ])
          );
      }
      if (scriptName === "docs:hpe:invoice") {
        return writeFile(path.join(outDir, "hpe_invoice.xlsx"), `invoice:${Date.now()}`);
      }
      throw new Error(`Unexpected command: ${args.join(" ")}`);
    };

    const result = await runHpeBatch({
      batchInputDir,
      samplesDir,
      outDir,
      diagRoot,
      execCommand,
    });

    assert.equal(result.failed, 0);
    assert.equal(result.ok, 3);

    const entries = await fs.readdir(diagRoot, { withFileTypes: true });
    const runDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("run_"));
    assert.equal(runDirs.length, 3);

    const inputContents = new Map();
    for (const inputPath of inputs) {
      inputContents.set(path.basename(inputPath, path.extname(inputPath)), await fs.readFile(inputPath, "utf8"));
    }

    for (const entry of runDirs) {
      const runDir = path.join(diagRoot, entry.name);
      const inputPathText = await fs.readFile(path.join(runDir, "input_path.txt"), "utf8");
      const expectedInput = inputs.find((inputPath) =>
        entry.name.includes(path.basename(inputPath, path.extname(inputPath)))
      );
      assert.ok(expectedInput);
      assert.equal(inputPathText, path.resolve(expectedInput));

      const runInputContent = await fs.readFile(path.join(runDir, "input.xlsx"), "utf8");
      const expectedContent = inputContents.get(path.basename(expectedInput, path.extname(expectedInput)));
      assert.equal(runInputContent, expectedContent);

      const outMirror = path.join(runDir, "out");
      const outEntries = await fs.readdir(outMirror);
      assert.ok(outEntries.includes("canonical.jsonl"));
      assert.ok(outEntries.includes("items.jsonl"));
      assert.ok(outEntries.includes("summary.json"));
      assert.ok(outEntries.includes("hpe_invoice.xlsx"));
    }
  } finally {
    process.chdir(originalCwd);
  }
});
