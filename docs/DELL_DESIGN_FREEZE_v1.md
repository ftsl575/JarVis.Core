# Dell Design Freeze v1 — Segmentation & Line Semantics

## 1) Purpose & Status
- This document is the **Design Freeze v1** for Dell document segmentation and line semantics.
- **All Dell-related code changes MUST comply** with the rules defined here.
- **Any deviation requires an explicit design-update PR** that revises this document.

## 2) Dell Document Structure (Observed, Locked)
- Dell configurator XLSX files follow a structure where **Group Summary / Bundle rows** serve as structural anchors for configurations.
- A single file **may contain multiple Group Summary / Bundle rows**, each representing a distinct configuration.
- A file **may be components-only**, containing **no Group Summary / Bundle rows**; this is a valid input shape.

## 3) Line Types (Normative)
The following line roles are **locked** and MUST be used consistently:

- **Anchor (Group Summary / Bundle)**
  - A structural row that represents a configuration boundary.
  - Serves as the start of a segment.

- **Item Line**
  - A line that represents a selectable or selected **hardware**, **service**, or **option** item.
  - Represents a concrete item in a configuration.

- **Attribute Line**
  - A line that represents **configuration attributes** or **settings** associated with a configuration.
  - Examples include configuration options, “No-*” lines, BIOS/memory configuration lines, and similar attribute-only rows.

- **Meta / Footer Line**
  - A non-item, non-attribute line used for metadata, totals, or document footer content.

## 4) Anchor Definition (Deterministic)
- **Anchors are determined by structural row properties, not by text meaning.**
- **Multiple anchors in one file imply multiple configurations.**
- **The order of anchors defines the order of segments.**

## 5) Segmentation Rules (Locked)
- **One anchor → one segment.**
- **Segments are independent.**
- **Components-only files (no anchor) are valid and yield zero segments.**

## 6) Attribute Line Policy
- **Attribute lines are NOT items.**
- **Attribute lines are NOT physical components.**
- **Attribute lines MUST be preserved in data.**
- **Attribute lines MAY be hidden or shown separately by consumers.**

## 7) Explicit Non-Goals (v1)
- **No HPE/Dell unification.**
- **No automatic device-type inference.**
- **No text-based heuristics.**
- **No changes to Stage 1 behavior.**
