import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_STRATEGY_PATH = "./strategies/hpe.configurator.v1.json";

const readJsonl = async (filePath) => {
  const content = await fs.promises.readFile(filePath, "utf8");
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
};

const loadStrategyConfig = async (strategyPath = DEFAULT_STRATEGY_PATH) => {
  const baseDir = path.dirname(fileURLToPath(import.meta.url));
  const resolvedPath = path.resolve(baseDir, strategyPath);
  const content = await fs.promises.readFile(resolvedPath, "utf8");
  return JSON.parse(content);
};

const buildAnchorRegexes = (patterns = []) => {
  return patterns
    .map((pattern) => {
      try {
        return new RegExp(pattern, "i");
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
};

const isAnchorDescription = (description, regexes) => {
  if (!description) {
    return false;
  }
  return regexes.some((regex) => regex.test(description));
};

const buildAnchorGroupingConfig = (config = {}) => {
  const grouping = config?.anchor_grouping ?? {};
  const windowRows = Number.isFinite(grouping.window_rows) ? grouping.window_rows : 1;
  const variantRegexes = buildAnchorRegexes(grouping?.variant_markers?.description_regex ?? []);
  const priority = grouping?.priority ?? "first_anchor_wins";
  return {
    windowRows,
    variantRegexes,
    priority,
  };
};

const normalizeRow = (item) => {
  const row = item?.source?.row ?? item?.source?.row_index ?? item?.source?.rowIndex ?? null;
  if (row === null || row === undefined) {
    return null;
  }
  return Number(row);
};

const sortItems = (items) => {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const fileA = a.item?.source?.file || "";
      const fileB = b.item?.source?.file || "";
      if (fileA !== fileB) {
        return fileA.localeCompare(fileB);
      }
      const sheetA = a.item?.source?.sheet || "";
      const sheetB = b.item?.source?.sheet || "";
      if (sheetA !== sheetB) {
        return sheetA.localeCompare(sheetB);
      }
      const rowA = normalizeRow(a.item);
      const rowB = normalizeRow(b.item);
      if (rowA !== null && rowB !== null && rowA !== rowB) {
        return rowA - rowB;
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
};

const makeItemReference = (item, { isAnchor = false, perServerQty = null } = {}) => {
  const row = normalizeRow(item);
  return {
    item_id: item?.id ?? null,
    source: {
      file: item?.source?.file ?? null,
      sheet: item?.source?.sheet ?? null,
      row,
    },
    qty: item?.qty ?? null,
    product_number: item?.product_number ?? null,
    description: item?.description ?? null,
    is_anchor: isAnchor,
    per_server_qty: perServerQty,
  };
};

const isDivisible = (qty, divisor) => {
  if (!Number.isFinite(qty) || !Number.isFinite(divisor) || divisor === 0) {
    return false;
  }
  const remainder = qty % divisor;
  return Math.abs(remainder) < 1e-9 || Math.abs(remainder - divisor) < 1e-9;
};

const addFinding = (findings, { code, severity, message, context }) => {
  findings.push({
    code,
    severity,
    message,
    context,
  });
};

const validateContinuity = ({ file, sortedItems, segments, findings }) => {
  const flattened = segments.flatMap((segment) => segment.items || []);
  const sortedRefs = sortedItems.map((item) => item?.id ?? null);
  const flattenedRefs = flattened.map((ref) => ref.item_id ?? null);

  const seen = new Set();
  let hasDuplicate = false;
  for (const ref of flattenedRefs) {
    if (seen.has(ref)) {
      hasDuplicate = true;
      break;
    }
    seen.add(ref);
  }

  const sameLength = sortedRefs.length === flattenedRefs.length;
  const sameOrder = sortedRefs.every((ref, idx) => ref === flattenedRefs[idx]);

  if (!sameLength || !sameOrder || hasDuplicate) {
    addFinding(findings, {
      code: "SEGMENT_CONTINUITY",
      severity: "ERROR",
      message: "Segment items are not a contiguous, ordered coverage of source items.",
      context: {
        file,
      },
    });
  }
};

const validateDivisibility = ({ file, segment, serverQty, findings }) => {
  if (!Number.isFinite(serverQty) || serverQty <= 0) {
    return;
  }

  for (const itemRef of segment.items) {
    if (itemRef.is_anchor) {
      continue;
    }
    const qty = Number(itemRef.qty);
    if (!Number.isFinite(qty)) {
      addFinding(findings, {
        code: "DIVISIBILITY",
        severity: "ERROR",
        message: "Item quantity is not a finite number for divisibility checks.",
        context: {
          file,
          segment_id: segment.segment_id,
          item: itemRef.source,
        },
      });
      continue;
    }
    if (!isDivisible(qty, serverQty)) {
      addFinding(findings, {
        code: "DIVISIBILITY",
        severity: "ERROR",
        message: `Item quantity ${qty} is not divisible by server qty ${serverQty}.`,
        context: {
          file,
          segment_id: segment.segment_id,
          item: itemRef.source,
        },
      });
    }
  }
};

const validateMultiAnchor = ({ file, anchors, threshold, findings }) => {
  if (!threshold || threshold <= 0 || anchors.length < 2) {
    return;
  }

  for (let i = 1; i < anchors.length; i += 1) {
    const prev = anchors[i - 1];
    const current = anchors[i];
    const prevRow = normalizeRow(prev.item);
    const currentRow = normalizeRow(current.item);
    const distance =
      prevRow !== null && currentRow !== null ? currentRow - prevRow : current.index - prev.index;

    if (distance < threshold) {
      addFinding(findings, {
        code: "MULTI_ANCHOR_SANITY",
        severity: "WARN",
        message: `Anchors are only ${distance} rows apart (threshold ${threshold}).`,
        context: {
          file,
          segment_id: current.segmentId,
          item: {
            file: current.item?.source?.file ?? null,
            sheet: current.item?.source?.sheet ?? null,
            row: normalizeRow(current.item),
          },
        },
      });
    }
  }
};

const groupAnchors = ({ anchors }) => {
  const groups = [];
  let currentGroup = null;
  let previousAnchor = null;

  for (const anchor of anchors) {
    if (!currentGroup) {
      currentGroup = { primary: anchor, secondaries: [] };
      previousAnchor = anchor;
      continue;
    }

    const isConsecutive = anchor.index === (previousAnchor?.index ?? -1) + 1;

    if (isConsecutive) {
      currentGroup.secondaries.push(anchor);
    } else {
      groups.push(currentGroup);
      currentGroup = { primary: anchor, secondaries: [] };
    }
    previousAnchor = anchor;
  }

  if (currentGroup) {
    groups.push(currentGroup);
  }

  return groups;
};

export const segmentHpeItems = async ({
  itemsPath,
  strategyPath,
  mode,
} = {}) => {
  if (!itemsPath) {
    throw new Error("itemsPath is required");
  }

  const items = await readJsonl(itemsPath);
  const config = await loadStrategyConfig(strategyPath);
  const regexes = buildAnchorRegexes(config.anchor_patterns || []);
  const anchorGroupingConfig = buildAnchorGroupingConfig(config);
  const defaultMode = config?.defaults?.default_mode || "permissive";
  const resolvedMode = mode || defaultMode;

  const grouped = new Map();
  const sorted = sortItems(items);
  for (const item of sorted) {
    const file = item?.source?.file || "";
    if (!grouped.has(file)) {
      grouped.set(file, []);
    }
    grouped.get(file).push(item);
  }

  const files = [];
  const findings = [];

  for (const [file, fileItems] of grouped.entries()) {
    const fileFindings = [];
    const anchors = [];
    const segments = [];

    fileItems.forEach((item, index) => {
      if (isAnchorDescription(item?.description, regexes)) {
        anchors.push({ item, index });
      }
    });

    if (anchors.length === 0) {
      const segment = {
        segment_id: 1,
        is_partial: true,
        server_anchor: null,
        items: fileItems.map((item) => makeItemReference(item)),
      };
      segments.push(segment);
      addFinding(fileFindings, {
        code: "ANCHOR_PRESENCE",
        severity: "WARN",
        message: "No anchor items found; emitting a single partial segment.",
        context: { file },
      });
    } else {
      const anchorGroups = groupAnchors({ anchors });

      anchorGroups.forEach((group, idx) => {
        const start = group.primary.index;
        const end = idx + 1 < anchorGroups.length ? anchorGroups[idx + 1].primary.index : fileItems.length;
        const slice = fileItems.slice(start, end);
        const segmentId = idx + 1;
        const serverQty = group.primary.item?.qty ?? null;
        const serverAnchor = {
          description: group.primary.item?.description ?? null,
          qty: serverQty,
          part_number: group.primary.item?.product_number ?? null,
        };
        const secondaryRows = group.secondaries.map((secondary) => normalizeRow(secondary.item)).filter((row) => row !== null);

        const itemsWithDerived = slice.map((item) => {
          const isAnchor = item === group.primary.item;
          let perServerQty = null;
          if (!isAnchor && Number.isFinite(serverQty) && serverQty > 0) {
            perServerQty = Number(item?.qty) / serverQty;
          }
          return makeItemReference(item, { isAnchor, perServerQty });
        });

        const segment = {
          segment_id: segmentId,
          is_partial: false,
          server_anchor: serverAnchor,
          items: itemsWithDerived,
        };

        if (secondaryRows.length > 0) {
          segment.secondary_anchor_rows = secondaryRows;
          addFinding(fileFindings, {
            code: "ADJACENT_ANCHORS_GROUPED",
            severity: "INFO",
            message: "Grouped adjacent CTO anchors into a single segment.",
            context: {
              primary_anchor_row: normalizeRow(group.primary.item),
              secondary_anchor_rows: secondaryRows,
              window_rows: anchorGroupingConfig.windowRows,
            },
          });
        }

        segments.push(segment);
      });

      validateMultiAnchor({
        file,
        anchors: anchorGroups.map((group, idx) => ({
          ...group.primary,
          segmentId: idx + 1,
        })),
        threshold: config?.multi_anchor_thresholds?.min_rows_between_anchors ?? null,
        findings: fileFindings,
      });

      for (const segment of segments) {
        validateDivisibility({
          file,
          segment,
          serverQty: segment.server_anchor?.qty ?? null,
          findings: fileFindings,
        });
      }
    }

    validateContinuity({ file, sortedItems: fileItems, segments, findings: fileFindings });

    files.push({
      file,
      segments,
      findings: fileFindings,
    });

    findings.push(...fileFindings);
  }

  const result = {
    strategy_id: config.strategy_id || "hpe.configurator.v1",
    mode: resolvedMode,
    created_at: new Date().toISOString(),
    items_path: path.resolve(itemsPath),
    files,
    findings,
  };

  return { result, findings, mode: resolvedMode };
};

export const hasErrorFindings = (findings = []) => findings.some((finding) => finding.severity === "ERROR");

export const writeSegments = async ({ outputPath, payload }) => {
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.promises.writeFile(outputPath, JSON.stringify(payload, null, 2), "utf8");
};
