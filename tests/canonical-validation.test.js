import assert from "node:assert/strict";
import test from "node:test";
import validateCanonical from "../core/canonical/validate.js";

test("validator accepts a minimal canonical record", () => {
  const record = {
    raw: "Sample",
    coords: {
      page: 1,
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    },
  };

  const result = validateCanonical(record);

  assert.equal(result.ok, true);
  assert.equal(result.errors.length, 0);
});

test("validator reports errors for missing required fields", () => {
  const record = { raw: "Sample" };

  const result = validateCanonical(record);

  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});
