import fs from "node:fs";
import { normalizePartNumber, normalizeText } from "./normalize.js";

const TYPES_PATH = new URL("../../../data/type-system/v1/types.json", import.meta.url);
const RULES_PATH = new URL("../../../data/type-system/v1/rules.json", import.meta.url);

const loadJson = (url) => JSON.parse(fs.readFileSync(url, "utf8"));

const TYPES = loadJson(TYPES_PATH);
const RULES = loadJson(RULES_PATH);

const FALLBACK_TYPE = "Unclear";

const isValidType = (value) => TYPES.includes(value);

const classifyDeviceType = (item = {}) => {
  const description = normalizeText(item.description);
  const partNumber = normalizePartNumber(item.partNumber || item.pn || item.product_number);

  if (partNumber && RULES.pn_exact?.[partNumber]) {
    const deviceType = RULES.pn_exact[partNumber];
    return {
      device_type: isValidType(deviceType) ? deviceType : FALLBACK_TYPE,
      matched_rule: `pn:${partNumber}`,
    };
  }

  if (description) {
    for (const rule of RULES.keywords || []) {
      const pattern = normalizeText(rule.pattern);
      if (pattern && description.includes(pattern)) {
        const deviceType = rule.device_type;
        return {
          device_type: isValidType(deviceType) ? deviceType : FALLBACK_TYPE,
          matched_rule: `kw:${pattern}`,
        };
      }
    }
  }

  return {
    device_type: FALLBACK_TYPE,
    matched_rule: "fallback",
  };
};

export { classifyDeviceType, FALLBACK_TYPE, RULES, TYPES };
