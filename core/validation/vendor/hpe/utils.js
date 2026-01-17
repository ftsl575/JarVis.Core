const normalizeText = (value) => {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim();
};

const collapseWhitespace = (value) => value.replace(/\s+/g, " ").trim();

const normalizePartNumber = (value) => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return "";
  }
  return trimmed.toUpperCase();
};

const normalizeDescription = (value) => {
  const trimmed = normalizeText(value);
  if (!trimmed) {
    return "";
  }
  return collapseWhitespace(trimmed).toLowerCase();
};

const normalizeHpePartNumber = (raw) => {
  const trimmed = normalizeText(raw);
  if (!trimmed) {
    return { normalized: "", tokens: [], notes: [] };
  }

  const collapsed = collapseWhitespace(trimmed);
  const tokens = collapsed.split(" ").filter(Boolean);
  const candidate = tokens[0] || "";
  const trailingTokens = tokens.slice(1);
  const notes = [];

  const hasTrailingTokens = trailingTokens.length > 0;
  const trailingTokensAreShort = trailingTokens.every((token) =>
    /^[A-Za-z0-9]{2,4}$/.test(token),
  );

  let normalizedCandidate = collapsed;
  if (hasTrailingTokens && trailingTokensAreShort) {
    normalizedCandidate = candidate;
    notes.push("removed_trailing_tokens");
  }

  return {
    normalized: normalizeText(normalizedCandidate).toUpperCase(),
    tokens: trailingTokens,
    notes,
  };
};

const isValidHpePnCandidate = (pn) => {
  const normalized = normalizeText(pn).toUpperCase();
  if (!normalized) {
    return false;
  }
  if (normalized.length < 5 || normalized.length > 20) {
    return false;
  }
  return /^[A-Z0-9-]+$/.test(normalized);
};

const extractTextSources = (item) => {
  const description =
    item?.parsed?.description || item?.description || item?.parsed?.desc || "";
  const rawText =
    item?.raw?.text || (typeof item?.raw === "string" ? item.raw : "");
  return {
    description: normalizeText(description),
    rawText: normalizeText(rawText),
  };
};

const getQtyValue = (item) => {
  if (Object.prototype.hasOwnProperty.call(item ?? {}, "qty")) {
    return item.qty;
  }
  if (Object.prototype.hasOwnProperty.call(item?.parsed ?? {}, "qty")) {
    return item.parsed.qty;
  }
  return null;
};

const getPartNumberValue = (item) => {
  if (item?.parsed?.product_number) {
    return item.parsed.product_number;
  }
  if (item?.product_number) {
    return item.product_number;
  }
  return null;
};

const getDescriptionValue = (item) => {
  if (item?.parsed?.description) {
    return item.parsed.description;
  }
  if (item?.description) {
    return item.description;
  }
  return null;
};

const getItemRef = (item) => item?.id || item?.source?.line_ref || item?.source?.row_index;

export {
  collapseWhitespace,
  extractTextSources,
  getDescriptionValue,
  getItemRef,
  getPartNumberValue,
  getQtyValue,
  isValidHpePnCandidate,
  normalizeDescription,
  normalizeHpePartNumber,
  normalizePartNumber,
  normalizeText,
};
