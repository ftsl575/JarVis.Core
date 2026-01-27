import assert from "node:assert/strict";
import test from "node:test";
import { segmentDellItems } from "./diagnostics/segments/dell-segmenter.js";
import { applyStableSegmentIds } from "./diagnostics/dell-segments.js";

const buildSource = (rowIndex, file) => ({
  vendor: "dell",
  file,
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

test("dell segmentation: segment_id format uses input basename with zero padding", () => {
  const items = [
    { line_type: "anchor", source: buildSource(1, "dl1.xlsx") },
    { line_type: "item", source: buildSource(2, "dl1.xlsx") },
    { line_type: "anchor", source: buildSource(3, "dl1.xlsx") },
  ];

  const payload = segmentDellItems({ items });
  applyStableSegmentIds(payload, { itemsPath: "Dl1.xlsx" });

  assert.equal(payload.segments[0].segment_id, "dell_dl1_s001");
  assert.equal(payload.segments[1].segment_id, "dell_dl1_s002");
});

test("dell segmentation: segment_id uniqueness across different inputs", () => {
  const itemsOne = [
    { line_type: "anchor", source: buildSource(1, "dl1.xlsx") },
    { line_type: "item", source: buildSource(2, "dl1.xlsx") },
  ];
  const itemsTwo = [
    { line_type: "anchor", source: buildSource(1, "dl2.xlsx") },
    { line_type: "item", source: buildSource(2, "dl2.xlsx") },
  ];

  const payloadOne = segmentDellItems({ items: itemsOne });
  const payloadTwo = segmentDellItems({ items: itemsTwo });
  applyStableSegmentIds(payloadOne, { itemsPath: "dl1.xlsx" });
  applyStableSegmentIds(payloadTwo, { itemsPath: "dl2.xlsx" });

  assert.notEqual(payloadOne.segments[0].segment_id, payloadTwo.segments[0].segment_id);
});

test("dell segmentation: segment_id stability across repeated runs", () => {
  const items = [
    { line_type: "anchor", source: buildSource(1, "dl5.xlsx") },
    { line_type: "item", source: buildSource(2, "dl5.xlsx") },
  ];

  const first = segmentDellItems({ items });
  const second = segmentDellItems({ items });
  applyStableSegmentIds(first, { itemsPath: "DL5.xlsx" });
  applyStableSegmentIds(second, { itemsPath: "DL5.xlsx" });

  assert.equal(first.segments[0].segment_id, "dell_dl5_s001");
  assert.equal(second.segments[0].segment_id, "dell_dl5_s001");
});
