import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const RULES_PATH = new URL("../data/type-system/v1/rules.json", import.meta.url);
const TYPES_PATH = new URL("../data/type-system/v1/types.json", import.meta.url);

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));

const loadTypes = () => {
  const data = readJson(TYPES_PATH);
  if (!Array.isArray(data)) {
    throw new Error(
      "types.json must be an array of strings to validate rules.json device types."
    );
  }

  for (const entry of data) {
    if (typeof entry !== "string") {
      throw new Error(
        "types.json contains a non-string entry; cannot validate rules.json device types."
      );
    }
  }

  return new Set(data);
};

const collectRuleDeviceTypes = (rules) => {
  if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
    throw new Error("rules.json must be an object to validate device type references.");
  }

  const knownSections = new Set(["pn_exact", "keywords"]);
  const unknownSections = Object.keys(rules).filter((key) => !knownSections.has(key));
  if (unknownSections.length > 0) {
    throw new Error(
      `rules.json contains unsupported sections (${unknownSections.join(
        ", "
      )}); update guardrail extraction to include device_type references.`
    );
  }

  const referenced = new Set();

  if (rules.pn_exact !== undefined) {
    if (!rules.pn_exact || typeof rules.pn_exact !== "object" || Array.isArray(rules.pn_exact)) {
      throw new Error("rules.json pn_exact must be an object of part numbers to device types.");
    }
    for (const [partNumber, deviceType] of Object.entries(rules.pn_exact)) {
      if (typeof deviceType !== "string") {
        throw new Error(
          `rules.json pn_exact entry for ${partNumber} must map to a string device_type.`
        );
      }
      referenced.add(deviceType);
    }
  }

  if (rules.keywords !== undefined) {
    if (!Array.isArray(rules.keywords)) {
      throw new Error("rules.json keywords must be an array of keyword rules.");
    }
    for (const rule of rules.keywords) {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
        throw new Error("rules.json keyword rule entries must be objects.");
      }
      if (typeof rule.device_type !== "string") {
        throw new Error("rules.json keyword rule must include a string device_type.");
      }
      referenced.add(rule.device_type);
    }
  }

  return referenced;
};

test("type-system v1 rules reference only known device types", () => {
  const rules = readJson(RULES_PATH);
  const allowedTypes = loadTypes();
  const referencedTypes = collectRuleDeviceTypes(rules);

  const unknownTypes = [...referencedTypes].filter((type) => !allowedTypes.has(type)).sort();

  assert.equal(
    unknownTypes.length,
    0,
    `rules.json references device types not present in types.json: ${unknownTypes.join(
      ", "
    )}. This is a guardrail violation, not a runtime error.`
  );
});
