import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_BATCH_INPUT_DIR = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\diag\\_batch_inputs";
const DEFAULT_SAMPLES_DIR = path.resolve("samples/hpe");
const DEFAULT_OUT_DIR = path.resolve("out");
const DEFAULT_DIAG_ROOT = path.resolve("diag");
const STAGING_FILENAME = "input.xlsx";
const DIAGNOSTICS_SKIP_ENV = "JARVIS_SKIP_DIAGNOSTICS";
const INVALID_LABEL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const MAX_LABEL_LENGTH = 80;
const REQUIRED_ARTIFACTS = [
  "canonical.jsonl",
  "items.jsonl",
  "summary.json",
  "segments.json",
  "hpe_invoice.xlsx",
  "cleaned_spec.xlsx",
];

const isXlsxFile = (name) => name.toLowerCase().endsWith(".xlsx");

const compareBatchNames = (a, b) => {
  const aName = path.basename(a);
  const bName = path.basename(b);
  const aLower = aName.toLowerCase();
  const bLower = bName.toLowerCase();
  if (aLower < bLower) {
    return -1;
  }
  if (aLower > bLower) {
    return 1;
  }
  if (aName < bName) {
    return -1;
  }
  if (aName > bName) {
    return 1;
  }
  return 0;
};

export const discoverHpeBatchInputs = async (batchInputDir) => {
  const entries = await fs.promises.readdir(batchInputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const xlsxFiles = files.filter(isXlsxFile);
  const absolutePaths = xlsxFiles.map((file) => path.resolve(batchInputDir, file));
  return absolutePaths.sort(compareBatchNames);
};

export const resolveNpmCommand = (platform = process.platform) => {
  if (platform === "win32") {
    return { command: "cmd.exe", args: ["/c", "npm.cmd"] };
  }
  return { command: "npm", args: [] };
};

export const stageHpeBatchInput = async (inputPath, samplesDir = DEFAULT_SAMPLES_DIR) => {
  await fs.promises.mkdir(samplesDir, { recursive: true });
  const entries = await fs.promises.readdir(samplesDir, { withFileTypes: true });
  const removals = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter(isXlsxFile)
    .map((name) => fs.promises.unlink(path.join(samplesDir, name)));
  await Promise.all(removals);
  const stagingPath = path.join(samplesDir, STAGING_FILENAME);
  await fs.promises.copyFile(inputPath, stagingPath);
  return stagingPath;
};

const getTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const normalizeLabel = (label) => {
  let normalized = String(label || "")
    .replace(/\s+/g, "_")
    .replace(INVALID_LABEL_CHARS, "_")
    .replace(/^[. ]+/, "")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!normalized) {
    normalized = "run";
  }

  if (normalized.length > MAX_LABEL_LENGTH) {
    normalized = normalized.slice(0, MAX_LABEL_LENGTH).replace(/[. ]+$/g, "").trim();
  }

  return normalized || "run";
};

const uniqueLabelForInput = (label, labelCounts) => {
  const seenCount = labelCounts.get(label) || 0;
  const nextCount = seenCount + 1;
  labelCounts.set(label, nextCount);

  if (seenCount === 0) {
    return label;
  }

  const suffix = `_${nextCount}`;
  let base = label;
  if (base.length + suffix.length > MAX_LABEL_LENGTH) {
    base = base.slice(0, Math.max(1, MAX_LABEL_LENGTH - suffix.length)).replace(/[. ]+$/g, "");
    if (!base) {
      base = "run";
    }
  }

  return `${base}${suffix}`;
};

class StepError extends Error {
  constructor(stepName, options = {}) {
    super(options.message || `Step failed: ${stepName}`);
    this.stepName = stepName;
    this.exitCode = options.exitCode ?? null;
    this.signal = options.signal ?? null;
    this.stdout = options.stdout ?? "";
    this.stderr = options.stderr ?? "";
  }
}

const truncateOutput = (value, maxLength = 4000) => {
  if (!value) {
    return "";
  }
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n...truncated...`;
};

const formatErrorText = (error) => {
  const lines = [];
  if (error?.stepName) {
    lines.push(`Step: ${error.stepName}`);
  }
  if (error?.exitCode !== null && error?.exitCode !== undefined) {
    lines.push(`Exit code: ${error.exitCode}`);
  }
  if (error?.signal) {
    lines.push(`Signal: ${error.signal}`);
  }

  const stdout = truncateOutput(error?.stdout);
  const stderr = truncateOutput(error?.stderr);

  if (stdout) {
    lines.push("stdout:");
    lines.push(stdout);
  }
  if (stderr) {
    lines.push("stderr:");
    lines.push(stderr);
  }

  if (!stdout && !stderr) {
    const message = error instanceof Error ? error.message : String(error);
    lines.push(`Error: ${message}`);
  }

  return `${lines.join("\n")}\n`;
};

const defaultExecCommand = ({ command, args, env }) => {
  const result = spawnSync(command, args, {
    env: {
      ...process.env,
      ...env,
    },
    encoding: "utf8",
  });

  return {
    status: result.status ?? (result.error ? 1 : 0),
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    signal: result.signal ?? null,
    error: result.error || null,
  };
};

const execStep = async ({ stepName, command, args, env, execCommand }) => {
  let result = null;
  try {
    result = await execCommand({ command, args, env, stepName });
  } catch (error) {
    throw new StepError(stepName, {
      message: error instanceof Error ? error.message : String(error),
      stdout: error?.stdout,
      stderr: error?.stderr,
    });
  }

  if (!result || typeof result.status !== "number") {
    return;
  }

  if (result.status !== 0) {
    throw new StepError(stepName, {
      exitCode: result.status,
      signal: result.signal ?? null,
      stdout: result.stdout,
      stderr: result.stderr,
    });
  }
};

const ensureArtifacts = async ({ runDir, outDir }) => {
  await Promise.all(
    REQUIRED_ARTIFACTS.map(async (name) => {
      const sourcePath = path.join(outDir, name);
      const destPath = path.join(runDir, name);
      if (!fs.existsSync(sourcePath)) {
        throw new StepError("snapshot", { message: `Missing artifact: ${name}` });
      }
      await fs.promises.copyFile(sourcePath, destPath);
    })
  );
};

export const runHpeBatchPack = async ({
  batchInputDir = DEFAULT_BATCH_INPUT_DIR,
  samplesDir = DEFAULT_SAMPLES_DIR,
  outDir = DEFAULT_OUT_DIR,
  diagRoot = DEFAULT_DIAG_ROOT,
  execCommand = defaultExecCommand,
  strict = false,
} = {}) => {
  const inputs = await discoverHpeBatchInputs(batchInputDir);
  const { command: npmCommand, args: npmArgs } = resolveNpmCommand();

  if (inputs.length === 0) {
    console.log(`HPE batch packaging: no inputs found in ${batchInputDir}`);
    return { ok: 0, failed: 0, exitCode: 0 };
  }

  let ok = 0;
  let failed = 0;
  const labelCounts = new Map();

  for (const inputPath of inputs) {
    const resolvedInputPath = path.resolve(inputPath);
    const labelBase = normalizeLabel(path.parse(inputPath).name);
    const label = uniqueLabelForInput(labelBase, labelCounts);
    const runId = `run_${getTimestamp()}__${label}`;
    const runDir = path.join(diagRoot, runId);

    await fs.promises.mkdir(runDir, { recursive: true });
    await fs.promises.writeFile(path.join(runDir, "input_path.txt"), resolvedInputPath, "utf8");
    await fs.promises.copyFile(resolvedInputPath, path.join(runDir, "input.xlsx"));

    let runError = null;

    try {
      await stageHpeBatchInput(resolvedInputPath, samplesDir);
      await execStep({
        stepName: "canon:hpe",
        command: npmCommand,
        args: [...npmArgs, "run", "canon:hpe"],
        execCommand,
      });
      await execStep({
        stepName: "diag:hpe:segments",
        command: npmCommand,
        args: [...npmArgs, "run", "diag:hpe:segments"],
        execCommand,
      });
      await execStep({
        stepName: "docs:hpe:invoice",
        command: npmCommand,
        args: [...npmArgs, "run", "docs:hpe:invoice", "--", "--spec", resolvedInputPath],
        env: {
          [DIAGNOSTICS_SKIP_ENV]: "1",
        },
        execCommand,
      });
      await execStep({
        stepName: "docs:hpe:cleaned-spec",
        command: npmCommand,
        args: [...npmArgs, "run", "docs:hpe:cleaned-spec"],
        execCommand,
      });
      await ensureArtifacts({ runDir, outDir });
    } catch (error) {
      runError = error;
    }

    if (runError) {
      failed += 1;
      await fs.promises.writeFile(path.join(runDir, "error.txt"), formatErrorText(runError), "utf8");
      console.error(`FAIL: ${resolvedInputPath}`);
      console.error(formatErrorText(runError));
    } else {
      ok += 1;
      console.log(`OK: ${resolvedInputPath}`);
    }
  }

  console.log(`HPE batch packaging done: ok=${ok} failed=${failed}`);
  return { ok, failed, exitCode: strict && failed > 0 ? 1 : 0 };
};

const usage = () => {
  console.log("Usage: node scripts/diagnostics/hpe-batch-pack.js [--strict]");
};

const main = async () => {
  const args = process.argv.slice(2);
  let strict = false;

  for (const arg of args) {
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      usage();
      return;
    }
    console.error(`Unexpected argument: ${arg}`);
    usage();
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runHpeBatchPack({ strict });
    if (result.exitCode) {
      process.exitCode = result.exitCode;
    }
  } catch (error) {
    console.error(formatErrorText(error));
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
