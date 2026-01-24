import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DIAG_ROOT = path.resolve("diag");
const HISTORY_PATH = path.join(DIAG_ROOT, "history.jsonl");
const INVALID_LABEL_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;

const getTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
};

const normalizeLabel = (label) => {
  const normalized = String(label || "")
    .replace(/\s+/g, "_")
    .replace(INVALID_LABEL_CHARS, "_")
    .replace(/[. ]+$/g, "")
    .trim();
  return normalized || "run";
};

const resolveGitSha = () => {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch (error) {
    return "unknown";
  }
};

const sha256File = (filePath) =>
  new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });

const readJsonl = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const countJsonlLines = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
};

const deriveLabel = ({ inputPath, itemsPath }) => {
  const candidate = inputPath || itemsPath || "run";
  const baseName = path.parse(candidate).name;
  return normalizeLabel(baseName || "run");
};

const resolveRunId = async (label) => {
  const timestamp = getTimestamp();
  const baseId = `run_${timestamp}__${label}`;
  let runId = baseId;
  let suffix = 2;

  while (fs.existsSync(path.join(DIAG_ROOT, runId))) {
    runId = `${baseId}__${suffix}`;
    suffix += 1;
  }

  return runId;
};

const describeArtifact = async ({ name, sourcePath, destPath }) => {
  if (!sourcePath || !fs.existsSync(sourcePath)) {
    return {
      name,
      source_path: sourcePath || null,
      exists: false,
    };
  }

  await fs.promises.copyFile(sourcePath, destPath);
  const stat = await fs.promises.stat(destPath);
  const hash = await sha256File(destPath);

  return {
    name,
    source_path: sourcePath,
    exists: true,
    size_bytes: stat.size,
    sha256: hash,
  };
};

const buildTotalsByDeviceType = (items) => {
  const totals = {};
  for (const item of items) {
    const deviceType = item?.device_type ?? item?.deviceType ?? "unknown";
    const key = deviceType || "unknown";
    totals[key] = (totals[key] || 0) + 1;
  }
  return totals;
};

const appendHistory = async (historyRecords) => {
  if (!historyRecords.length) {
    return;
  }

  await fs.promises.mkdir(DIAG_ROOT, { recursive: true });

  const lines = historyRecords.map((record) => JSON.stringify(record)).join("\n");
  await fs.promises.appendFile(HISTORY_PATH, `${lines}\n`, "utf8");
};

const aggregateHistory = ({ items, runId, timestamp, gitSha, defaultSourceFile }) => {
  const counts = new Map();

  for (const item of items) {
    const partNumber = item?.product_number ?? item?.part_number ?? item?.productNumber ?? item?.partNumber ?? "";
    const description = item?.description ?? "";
    const deviceType = item?.device_type ?? item?.deviceType ?? "";
    const sourceFile = item?.source?.file || defaultSourceFile || "";
    const key = JSON.stringify([partNumber, description, deviceType, sourceFile]);
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [partNumber, description, deviceType, sourceFile] = JSON.parse(key);
    return {
      vendor: "HPE",
      run_id: runId,
      timestamp,
      git_sha: gitSha,
      source_file: sourceFile,
      part_number: partNumber,
      description,
      device_type: deviceType,
      count_in_run: count,
    };
  });
};

export const runHpeDiagnostics = async ({ inputPath, outPath, itemsPath } = {}) => {
  const resolvedInputPath = inputPath ? path.resolve(inputPath) : null;
  const resolvedOutPath = outPath ? path.resolve(outPath) : path.resolve("out/hpe_invoice.xlsx");
  const outDir = path.dirname(resolvedOutPath);
  const resolvedItemsPath = itemsPath ? path.resolve(itemsPath) : path.join(outDir, "items.jsonl");
  const canonicalPath = path.join(outDir, "canonical.jsonl");
  const summaryPath = path.join(outDir, "summary.json");
  const label = deriveLabel({ inputPath: resolvedInputPath, itemsPath: resolvedItemsPath });
  const runId = await resolveRunId(label);
  const runDir = path.join(DIAG_ROOT, runId);
  const createdAt = new Date().toISOString();
  const gitSha = resolveGitSha();
  const inputFilename = resolvedInputPath ? path.basename(resolvedInputPath) : "";

  await fs.promises.mkdir(runDir, { recursive: true });
  await fs.promises.writeFile(path.join(runDir, "input_path.txt"), resolvedInputPath || "", "utf8");

  const artifacts = [];
  artifacts.push(
    await describeArtifact({
      name: "input.xlsx",
      sourcePath: resolvedInputPath,
      destPath: path.join(runDir, "input.xlsx"),
    })
  );
  artifacts.push(
    await describeArtifact({
      name: "canonical.jsonl",
      sourcePath: canonicalPath,
      destPath: path.join(runDir, "canonical.jsonl"),
    })
  );
  artifacts.push(
    await describeArtifact({
      name: "items.jsonl",
      sourcePath: resolvedItemsPath,
      destPath: path.join(runDir, "items.jsonl"),
    })
  );
  artifacts.push(
    await describeArtifact({
      name: "summary.json",
      sourcePath: summaryPath,
      destPath: path.join(runDir, "summary.json"),
    })
  );
  artifacts.push(
    await describeArtifact({
      name: "hpe_invoice.xlsx",
      sourcePath: resolvedOutPath,
      destPath: path.join(runDir, "hpe_invoice.xlsx"),
    })
  );

  let items = [];
  let canonicalLines = null;
  let itemsLines = null;
  let totalsByDeviceType = {};

  if (fs.existsSync(resolvedItemsPath)) {
    items = await readJsonl(resolvedItemsPath);
    itemsLines = items.length;
    totalsByDeviceType = buildTotalsByDeviceType(items);
  }

  if (fs.existsSync(canonicalPath)) {
    canonicalLines = await countJsonlLines(canonicalPath);
  }

  const runMeta = {
    run_id: runId,
    created_at: createdAt,
    finished_at: new Date().toISOString(),
    git_sha: gitSha,
    input_path: resolvedInputPath,
    input_filename: inputFilename,
    artifacts,
    counts: {
      items_lines: itemsLines,
      canonical_lines: canonicalLines,
      totals_by_device_type: totalsByDeviceType,
    },
  };

  await fs.promises.writeFile(path.join(runDir, "run_meta.json"), JSON.stringify(runMeta, null, 2), "utf8");

  const historyRecords = aggregateHistory({
    items,
    runId,
    timestamp: createdAt,
    gitSha,
    defaultSourceFile: inputFilename,
  });
  await appendHistory(historyRecords);

  return {
    runId,
    runDir,
    historyCount: historyRecords.length,
  };
};
