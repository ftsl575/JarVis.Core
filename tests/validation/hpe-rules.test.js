import assert from "node:assert/strict";
import test from "node:test";
import {
  ruleLineTypeSanity,
  ruleOptionSpareMismatch,
  rulePartNumberFormat,
  ruleQuantityValidation,
} from "../../core/validation/vendor/hpe/rules/index.js";
import { validateHpeItems } from "../../core/validation/vendor/hpe/index.js";

const makeItem = (overrides = {}) => ({
  id: "file.xlsx::BOM::2",
  source: { vendor: "HPE" },
  line_type: "item",
  parsed: {
    qty: 1,
    product_number: "ABC123",
    description: "Base item",
  },
  raw: { text: "Base item" },
  ...overrides,
});

test("HPE.RULE.001 flags missing line type signals", () => {
  const findings = ruleLineTypeSanity(
    makeItem({ parsed: { qty: 1, product_number: "ABC123", description: "Server" } }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "HPE.RULE.001");
});

test("HPE.RULE.002 flags option and spare overlap", () => {
  const findings = ruleOptionSpareMismatch(
    makeItem({
      parsed: {
        qty: 1,
        product_number: "ABC123",
        description: "Option kit spare bundle",
      },
    }),
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].code, "HPE.RULE.002");
});

test("HPE.RULE.003 validates quantity", () => {
  const missing = ruleQuantityValidation(makeItem({ parsed: { qty: null } }));
  assert.equal(missing[0].severity, "warn");

  const invalid = ruleQuantityValidation(makeItem({ parsed: { qty: 0 } }));
  assert.equal(invalid[0].severity, "error");

  const ok = ruleQuantityValidation(makeItem({ parsed: { qty: 1.5 } }));
  assert.equal(ok.length, 0);
});

test("HPE.RULE.004 flags part number anomalies", () => {
  const whitespace = rulePartNumberFormat(
    makeItem({ parsed: { product_number: "ABC 123" } }),
  );
  assert.equal(whitespace.length, 1);

  const illegal = rulePartNumberFormat(
    makeItem({ parsed: { product_number: "P123-B21$" } }),
  );
  assert.equal(illegal.length, 1);
});

test("HPE.RULE.005 flags conflicting descriptions", () => {
  const items = [
    makeItem({ parsed: { product_number: "PN-001", description: "Widget" } }),
    makeItem({
      id: "file.xlsx::BOM::3",
      parsed: { product_number: "pn-001", description: "Widget Pro" },
    }),
  ];
  const result = validateHpeItems(items);
  assert.equal(result.codes["HPE.RULE.005"].count, 1);
});
