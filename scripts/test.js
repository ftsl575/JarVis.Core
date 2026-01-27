import assert from "node:assert/strict";
import test from "node:test";
import { segmentDellItems } from "./diagnostics/segments/dell-segmenter.js";

const buildSource = (rowIndex) => ({
  vendor: "dell",
  sheet: "Sheet1",
  row_index: rowIndex,
  source_ref: null,
});

test("dell segmentation: multi-anchor yields one segment per anchor", () => {
  const items = [
    { line_type: "anchor", source: buildSource(1) },
    { line_type: "item", source: buildSource(2) },
    { line_type: "anchor", source: buildSource(3) },
    { line_type: "item", source: buildSource(4) },
  ];

  const payload = segmentDellItems({ items });

  assert.equal(payload.segments.length, 2);
  assert.deepEqual(
    payload.segments[0].rows.map((row) => row.row_index),
    [1, 2],
  );
  assert.deepEqual(
    payload.segments[1].rows.map((row) => row.row_index),
    [3, 4],
  );
  assert.equal(payload.segments[0].anchor.row_index, 1);
  assert.equal(payload.segments[1].anchor.row_index, 3);
});

test("dell segmentation: components-only yields zero segments", () => {
  const items = [
    { line_type: "item", source: buildSource(1) },
    { line_type: "item", source: buildSource(2) },
  ];

  const payload = segmentDellItems({ items });

  assert.equal(payload.segments.length, 0);
});
