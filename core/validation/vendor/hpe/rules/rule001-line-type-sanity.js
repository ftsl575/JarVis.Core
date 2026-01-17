import {
  getItemRef,
  getLineSignals,
  getPartNumberValue,
  getQtyValue,
  isValidHpePnCandidate,
  normalizeHpePartNumber,
  normalizeText,
} from "../utils.js";

const RULE_CODE = "HPE.RULE.001";
const COMPONENT_NOUNS =
  /\b(disk|drive|hdd|ssd|nvme|cpu|processor|memory|ram|dimm|nic|network|ethernet|psu|power\s*supply|fan|heatsink|controller|raid|adapter|card|module|gpu|backplane|cable)\b/;
const GENERIC_WORDS = /\b(option|item|component|misc)\b/;
const CONFIDENCE_THRESHOLD = 40;

const ruleLineTypeSanity = (item) => {
  try {
    if (item?.source?.vendor && item.source.vendor !== "HPE") {
      return [];
    }
    if (item?.line_type && item.line_type !== "item") {
      return [];
    }

    const {
      combined,
      normalizedCombined,
      hasFactoryIntegrated,
      isService,
      hasNonItemMarker,
      hasWarrantyOnly,
    } = getLineSignals(item);

    if (!combined) {
      return [];
    }

    const partNumber = getPartNumberValue(item);
    const qtyValue = getQtyValue(item);
    const qtyNumber = Number(qtyValue);
    const hasQty = Number.isFinite(qtyNumber) && qtyNumber >= 1;
    const hasProductNumber = Boolean(normalizeText(partNumber));

    if (hasNonItemMarker || isService || hasWarrantyOnly) {
      return [];
    }

    if (!hasQty || !hasProductNumber) {
      return [];
    }

    if (hasFactoryIntegrated) {
      return [];
    }

    let confidence = 0;
    const { normalized } = normalizeHpePartNumber(partNumber);
    if (normalized && isValidHpePnCandidate(normalized)) {
      confidence += 40;
    }

    const isSmallInteger =
      Number.isInteger(qtyNumber) && qtyNumber >= 1 && qtyNumber <= 10;
    if (isSmallInteger) {
      confidence += 20;
    }

    if (COMPONENT_NOUNS.test(normalizedCombined)) {
      confidence += 20;
    }

    if (GENERIC_WORDS.test(normalizedCombined)) {
      confidence -= 40;
    }

    if (confidence < CONFIDENCE_THRESHOLD) {
      return [
        {
          code: RULE_CODE,
          severity: "warn",
          message: "HPE line item classification confidence is low for line type.",
          itemRef: getItemRef(item),
          fields: ["parsed.description", "raw.text"],
          context: {
            confidence,
          },
        },
      ];
    }

    return [];
  } catch (error) {
    return [];
  }
};

export { RULE_CODE, ruleLineTypeSanity };
