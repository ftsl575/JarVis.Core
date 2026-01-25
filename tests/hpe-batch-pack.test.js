import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { discoverHpeBatchInputs, runHpeBatchPack } from "../scripts/diagnostics/hpe-batch-pack.js";

const writeFile = async (filePath, content) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
};

const readOptionalFile = async (filePath) => {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
};

const getScriptName = (args) =>
  args.find((arg) => arg === "canon:hpe" || arg === "diag:hpe:segments" || arg === "docs:hpe:invoice");

const getSpecPath = (args) => {
  const specIndex = args.indexOf("--spec");
  return specIndex === -1 ? null : args[specIndex + 1];
};

test("discoverHpeBatchInputs sorts by filename (case-insensitive)", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-batch-pack-discovery-"));
  await writeFile(path.join(tempDir, "B.xlsx"), "b");
  await writeFile(path.join(tempDir, "a.xlsx"), "a");
  await writeFile(path.join(tempDir, "c.XLSX"), "c");
  await writeFile(path.join(tempDir, "notes.txt"), "notes");

  const found = await discoverHpeBatchInputs(tempDir);
  const expected = [
    path.resolve(tempDir, "a.xlsx"),
    path.resolve(tempDir, "B.xlsx"),
    path.resolve(tempDir, "c.XLSX"),
  ];

  assert.deepEqual(found, expected);
});

test("runHpeBatchPack snapshots per input and continues in permissive mode", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-batch-pack-"));
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const batchInputDir = path.join(tempDir, "batch_inputs");
    const samplesDir = path.join(tempDir, "samples", "hpe");
    const outDir = path.join(tempDir, "out");
    const diagRoot = path.join(tempDir, "diag");

    await fs.mkdir(batchInputDir, { recursive: true });

    const inputs = [
      path.join(batchInputDir, "alpha.xlsx"),
      path.join(batchInputDir, "bravo.xlsx"),
      path.join(batchInputDir, "charlie.xlsx"),
    ];

    await Promise.all([
      writeFile(inputs[0], "alpha"),
      writeFile(inputs[1], "bravo-fail"),
      writeFile(inputs[2], "charlie"),
    ]);

    const processedInputs = [];
    const execCommand = async ({ args }) => {
      const scriptName = getScriptName(args);
      if (!scriptName) {
        throw new Error(`Unexpected command: ${args.join(" ")}`);
      }

      const stagedPath = path.join(samplesDir, "input.xlsx");
      const content = await readOptionalFile(stagedPath);

      if (scriptName === "canon:hpe") {
        processedInputs.push(content);
        await writeFile(path.join(outDir, "canonical.jsonl"), JSON.stringify({ id: content }));
        await writeFile(path.join(outDir, "items.jsonl"), `${JSON.stringify({ id: content })}\n`);
        await writeFile(path.join(outDir, "summary.json"), JSON.stringify({ ok: true }));
        return { status: 0, stdout: "", stderr: "" };
      }

      if (scriptName === "diag:hpe:segments") {
        if (content?.includes("fail")) {
          return { status: 1, stdout: "segment out", stderr: "segment error" };
        }
        await writeFile(path.join(outDir, "segments.json"), JSON.stringify({ ok: true }));
        return { status: 0, stdout: "", stderr: "" };
      }

      if (scriptName === "docs:hpe:invoice") {
        const specPath = getSpecPath(args);
        assert.ok(specPath);
        await writeFile(path.join(outDir, "hpe_invoice.xlsx"), `invoice:${path.basename(specPath)}`);
        return { status: 0, stdout: "", stderr: "" };
      }

      return { status: 0, stdout: "", stderr: "" };
    };

    const result = await runHpeBatchPack({
      batchInputDir,
      samplesDir,
      outDir,
      diagRoot,
      execCommand,
    });

    assert.equal(result.ok, 2);
    assert.equal(result.failed, 1);
    assert.equal(result.exitCode, 0);
    assert.deepEqual(processedInputs, ["alpha", "bravo-fail", "charlie"]);

    const entries = await fs.readdir(diagRoot, { withFileTypes: true });
    const runDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("run_"));
    assert.equal(runDirs.length, 3);

    for (const entry of runDirs) {
      const runDir = path.join(diagRoot, entry.name);
      const inputPathText = await fs.readFile(path.join(runDir, "input_path.txt"), "utf8");
      const inputBase = path.basename(inputPathText);
      const expectedInput = inputs.find((inputPath) => path.basename(inputPath) === inputBase);
      assert.ok(expectedInput);
      assert.equal(inputPathText, path.resolve(expectedInput));

      const inputCopy = await fs.readFile(path.join(runDir, "input.xlsx"), "utf8");
      assert.equal(inputCopy, await fs.readFile(expectedInput, "utf8"));

      const errorText = await readOptionalFile(path.join(runDir, "error.txt"));
      if (inputBase === "bravo.xlsx") {
        assert.ok(errorText);
        assert.match(errorText, /Step: diag:hpe:segments/);
        assert.match(errorText, /Exit code: 1/);
        assert.match(errorText, /segment error/);
      } else {
        assert.equal(errorText, null);
        for (const name of [
          "canonical.jsonl",
          "items.jsonl",
          "summary.json",
          "segments.json",
          "hpe_invoice.xlsx",
        ]) {
          const filePath = path.join(runDir, name);
          await assert.doesNotReject(() => fs.stat(filePath));
        }
      }
    }
  } finally {
    process.chdir(originalCwd);
  }
});

test("runHpeBatchPack sets exit code in strict mode", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "hpe-batch-pack-strict-"));
  const originalCwd = process.cwd();
  process.chdir(tempDir);

  try {
    const batchInputDir = path.join(tempDir, "batch_inputs");
    const samplesDir = path.join(tempDir, "samples", "hpe");
    const outDir = path.join(tempDir, "out");
    const diagRoot = path.join(tempDir, "diag");

    await fs.mkdir(batchInputDir, { recursive: true });
    const inputPath = path.join(batchInputDir, "bad name?.xlsx");
    await writeFile(inputPath, "fail");

    const execCommand = async ({ args }) => {
      const scriptName = getScriptName(args);
      if (!scriptName) {
        throw new Error(`Unexpected command: ${args.join(" ")}`);
      }
      if (scriptName === "canon:hpe") {
        await writeFile(path.join(outDir, "canonical.jsonl"), "{}");
        await writeFile(path.join(outDir, "items.jsonl"), "{}\n");
        await writeFile(path.join(outDir, "summary.json"), "{}");
        return { status: 0, stdout: "", stderr: "" };
      }
      if (scriptName === "diag:hpe:segments") {
        return { status: 1, stdout: "", stderr: "segments failed" };
      }
      return { status: 0, stdout: "", stderr: "" };
    };

    const result = await runHpeBatchPack({
      batchInputDir,
      samplesDir,
      outDir,
      diagRoot,
      execCommand,
      strict: true,
    });

    assert.equal(result.failed, 1);
    assert.equal(result.exitCode, 1);

    const entries = await fs.readdir(diagRoot, { withFileTypes: true });
    const runDirs = entries.filter((entry) => entry.isDirectory() && entry.name.startsWith("run_"));
    assert.equal(runDirs.length, 1);
    assert.match(runDirs[0].name, /run_\d{4}-\d{2}-\d{2}_\d{6}__bad_name_/);
  } finally {
    process.chdir(originalCwd);
  }
});
