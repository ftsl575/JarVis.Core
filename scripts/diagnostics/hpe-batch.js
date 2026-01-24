import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runHpeDiagnostics } from "./hpe.js";

const DEFAULT_BATCH_INPUT_DIR = "C:\\Users\\G\\Desktop\\JarVis\\JarVis.Core\\diag\\_batch_inputs";
const DEFAULT_SAMPLES_DIR = path.resolve("samples/hpe");
const DEFAULT_OUT_DIR = path.resolve("out");
const DEFAULT_OUT_PATH = path.join(DEFAULT_OUT_DIR, "hpe_invoice.xlsx");
const DEFAULT_ITEMS_PATH = path.join(DEFAULT_OUT_DIR, "items.jsonl");
const STAGING_FILENAME = "input.xlsx";
const DIAGNOSTICS_SKIP_ENV = "JARVIS_SKIP_DIAGNOSTICS";

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

export const discoverHpeBatchInputs = async (batchInputDir) => {
  const entries = await fs.promises.readdir(batchInputDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
  const xlsxFiles = files.filter(isXlsxFile);
  const absolutePaths = xlsxFiles.map((file) => path.resolve(batchInputDir, file));
  return absolutePaths.sort(compareBatchPaths);
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

const formatError = (error) => {
  if (!error) {
    return "Unknown error";
  }
  if (error instanceof Error && error.message) {
    return error.stack || error.message;
  }
  return String(error);
};

const ensureOutMirror = async (runDir, outDir) => {
  const mirrorDir = path.join(runDir, "out");
  await fs.promises.mkdir(mirrorDir, { recursive: true });
  const artifacts = ["canonical.jsonl", "items.jsonl", "summary.json", "hpe_invoice.xlsx"];
  await Promise.all(
    artifacts.map(async (name) => {
      const sourcePath = path.join(outDir, name);
      const destPath = path.join(mirrorDir, name);
      if (fs.existsSync(sourcePath)) {
        await fs.promises.copyFile(sourcePath, destPath);
      }
    })
  );
};

export const resolveNpmCommand = (platform = process.platform) => {
  const command = platform === "win32" ? "npm.cmd" : "npm";
  return { command, args: [] };
};

const defaultExec = ({ command, args, env }) => {
  execFileSync(command, args, {
    stdio: "inherit",
    env: {
      ...process.env,
      ...env,
    },
  });
};

export const runHpeBatch = async ({
  batchInputDir = DEFAULT_BATCH_INPUT_DIR,
  samplesDir = DEFAULT_SAMPLES_DIR,
  outDir = DEFAULT_OUT_DIR,
  diagRoot,
  execCommand = defaultExec,
  diagnosticsFn = runHpeDiagnostics,
} = {}) => {
  const inputs = await discoverHpeBatchInputs(batchInputDir);
  const { command: npmCommand, args: npmArgs } = resolveNpmCommand();

  if (inputs.length === 0) {
    console.log(`HPE batch diagnostics: no inputs found in ${batchInputDir}`);
    return { ok: 0, failed: 0 };
  }

  let ok = 0;
  let failed = 0;

  for (const inputPath of inputs) {
    let runError = null;
    let runDir = null;
    try {
      await stageHpeBatchInput(inputPath, samplesDir);
      await execCommand({ command: npmCommand, args: [...npmArgs, "run", "canon:hpe"] });
      await execCommand({
        command: npmCommand,
        args: [...npmArgs, "run", "docs:hpe:invoice", "--", "--spec", inputPath],
        env: {
          [DIAGNOSTICS_SKIP_ENV]: "1",
        },
      });
    } catch (error) {
      runError = error;
    }

    try {
      const diagnostics = await diagnosticsFn({
        inputPath,
        outPath: path.join(outDir, "hpe_invoice.xlsx"),
        itemsPath: path.join(outDir, "items.jsonl"),
        diagRoot,
      });
      runDir = diagnostics?.runDir || null;
      if (runDir) {
        await ensureOutMirror(runDir, outDir);
      }
    } catch (error) {
      if (!runError) {
        runError = error;
      }
    }

    if (runDir && runError) {
      await fs.promises.writeFile(path.join(runDir, "error.txt"), formatError(runError), "utf8");
    }

    if (runError) {
      failed += 1;
      console.error(`FAIL: ${inputPath}`);
      console.error(formatError(runError));
    } else {
      ok += 1;
      console.log(`OK: ${inputPath}`);
    }
  }

  console.log(`HPE batch diagnostics done: ok=${ok} failed=${failed}`);
  return { ok, failed };
};

const main = async () => {
  try {
    const result = await runHpeBatch();
    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(formatError(error));
    process.exitCode = 1;
  }
};

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (entryPath && entryPath === fileURLToPath(import.meta.url)) {
  await main();
}
