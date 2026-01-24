import assert from "node:assert/strict";
import test from "node:test";
import { buildCleanedRows } from "../scripts/docs-hpe-clean.js";

test("filters factory integrated rows from cleaned spec output", () => {
  const rows = buildCleanedRows([
    { product_number: "PN-100", description: "Factory Integrated Controller", qty: 1 },
    { product_number: "PN-200", description: "Standard Adapter", qty: 2 },
    { product_number: "PN-300", description: "factory integrated module", qty: 1 },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[1][1], "PN-200");
  assert.equal(rows[1][2], "Standard Adapter");
  assert.ok(!/factory integrated/i.test(String(rows[1][2])));
});
