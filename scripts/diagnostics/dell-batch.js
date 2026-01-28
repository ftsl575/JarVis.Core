import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_BATCH_INPUT_DIR = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\diag\\_batch_inputs";
const DEFAULT_OUT_DIR = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\out";
const DEFAULT_DIAG_ROOT = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\diag";

const isXlsxFile = (name) => name.toLowerCase().endsWith(".xlsx");

const compareBatchPaths = (a, b) => {
  const aName = path.basename(a).toLowerCase();
  const bName = path.basename(b).toLowerCase();
  if (aName < bName) {
    return -1;
  }
  if (aName > bName) {
    return 1;
  }
  if (a < b) {
    return -1;
  }
  if (a > b) {
    return 1;
  }
  return 0;
};

const usage = () => {
  console.log("Usage: node scripts/diagnostics/dell-batch.js [--inputs <dir>] [files/globs...]");
};

const hasGlob = (value) => /[*?]/.test(value);

const globToRegExp = (pattern) => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexText = `^${escaped.replace(/\\\*/g, ".*").replace(/\\\?/g, ".")}$`;
  return new RegExp(regexText, "i");
};

const discoverBatchInputs = async (batchInputDir) => {
  try {
    const entries = await fs.promises.readdir(batchInputDir, { withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    return files
      .filter(isXlsxFile)
      .map((file) => path.resolve(batchInputDir, file))
      .sort(compareBatchPaths);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const resolvePatternInputs = async (pattern) => {
  if (!hasGlob(pattern)) {
    const resolved = path.resolve(pattern);
    const stats = await fs.promises.stat(resolved);
    if (stats.isDirectory()) {
      return discoverBatchInputs(resolved);
    }
    if (stats.isFile()) {
      return [resolved];
    }
    throw new Error(`Unsupported input path: ${pattern}`);
  }

  const dirName = path.dirname(pattern);
  const basePattern = path.basename(pattern);
  const targetDir = path.resolve(dirName);
  const matcher = globToRegExp(basePattern);
  const entries = await fs.promises.readdir(targetDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => matcher.test(name))
    .filter(isXlsxFile)
    .map((name) => path.resolve(targetDir, name));
};

const resolveBatchInputs = async ({ batchInputDir, patterns }) => {
  if (!patterns || patterns.length === 0) {
    return discoverBatchInputs(batchInputDir);
  }

  const collected = [];
  for (const pattern of patterns) {
    const inputs = await resolvePatternInputs(pattern);
    collected.push(...inputs);
  }

  const unique = Array.from(new Set(collected));
  return unique.sort(compareBatchPaths);
};

const ensureCleanOutDir = async (outDir) => {
  await fs.promises.rm(outDir, { recursive: true, force: true });
  await fs.promises.mkdir(outDir, { recursive: true });
};

const runStep = ({ label, scriptPath, args = [] }) => {
  console.log(`Dell batch: ${label} -> start`);
  try {
    execFileSync(process.execPath, [scriptPath, ...args], { stdio: "inherit" });
    console.log(`Dell batch: ${label} -> exit=0`);
  } catch (error) {
    const exitCode = typeof error?.status === "number" ? error.status : 1;
    console.error(`Dell batch: ${label} -> exit=${exitCode}`);
    throw error;
  }
};

const copyXlsxArtifacts = async ({ inputPath, outDir, diagRoot }) => {
  const inputName = path.parse(inputPath).name;
  const runDir = path.join(diagRoot, inputName);
  await fs.promises.mkdir(runDir, { recursive: true });

  const entries = await fs.promises.readdir(outDir, { withFileTypes: true });
  const artifacts = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isXlsxFile);

  for (const artifact of artifacts) {
    await fs.promises.copyFile(path.join(outDir, artifact), path.join(runDir, artifact));
  }
};

const runDellBatch = async ({ batchInputDir, outDir, diagRoot, patterns }) => {
  const inputs = await resolveBatchInputs({ batchInputDir, patterns });

  if (inputs.length === 0) {
    console.log(`Dell batch diagnostics: no inputs found in ${batchInputDir}`);
    return { ok: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;

  for (const inputPath of inputs) {
    console.log(`Dell batch: input -> ${inputPath}`);
    await ensureCleanOutDir(outDir);

    try {
      runStep({
        label: "stage1:adapter",
        scriptPath: path.resolve("adapters/dell/index.js"),
        args: [inputPath, "--out", outDir],
      });
      runStep({
        label: "stage2:segments",
        scriptPath: path.resolve("scripts/diagnostics/dell-segments.js"),
        args: ["--items", path.join(outDir, "items.jsonl"), "--out", path.join(outDir, "segments.dell.json")],
      });
      runStep({
        label: "stage3:materialize",
        scriptPath: path.resolve("scripts/diag/dell/materialize.mjs"),
      });
      runStep({
        label: "stage4:cleaned-spec",
        scriptPath: path.resolve("scripts/dell-cleaned-spec.js"),
      });
      await copyXlsxArtifacts({ inputPath, outDir, diagRoot });
      console.log(`Dell batch: input -> done (${inputPath})`);
      ok += 1;
    } catch (error) {
      failed += 1;
      console.error(`Dell batch: input -> failed (${inputPath})`);
      throw error;
    }
  }

  console.log(`Dell batch diagnostics done: ok=${ok} failed=${failed}`);
  return { ok, failed };
};

const parseArgs = (argv) => {
  const args = argv.slice(2);
  let batchInputDir = DEFAULT_BATCH_INPUT_DIR;
  const patterns = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--inputs") {
      const next = args[i + 1];
      if (!next) {
        return { error: "Missing value for --inputs" };
      }
      batchInputDir = next;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      return { help: true };
    }
    if (arg.startsWith("-")) {
      return { error: `Unexpected argument: ${arg}` };
    }
    patterns.push(arg);
  }

  return { batchInputDir, patterns };
};

const main = async () => {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    usage();
    return;
  }
  if (parsed.error) {
    console.error(parsed.error);
    usage();
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runDellBatch({
      batchInputDir: parsed.batchInputDir,
      outDir: DEFAULT_OUT_DIR,
      diagRoot: DEFAULT_DIAG_ROOT,
      patterns: parsed.patterns,
    });
    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  await main();
}

export { runDellBatch };
