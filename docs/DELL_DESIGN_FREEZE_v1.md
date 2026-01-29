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

## 8) Module Name Policy (Dell-Only, Frozen)
This section defines the **normative policy** for the Dell input column labeled **“Module Name.”**

### 8.1 Definition (Observed)
- **Module Name** is a **free-text** column value present in some Dell input rows.
- It reflects **vendor/user wording** and may vary across files, bundles, or quoting tools.
- It is relevant **only to downstream consumers** of the cleaned spec as an informational label; it is **not** a structural anchor.

### 8.2 Outcome B — Disallowed for Semantic Use (Authoritative)
Because Module Name is **free-text**, it **MUST NOT** be used as a semantic hint for classification, grouping, or device-type inference in Dell cleaned spec.

**Allowed (Deterministic, Non-Semantic):**
- **Pass-through only:** Module Name MAY be surfaced as an **informational field** in the cleaned spec **without** affecting identifiers, grouping, or line typing.
- **Missing/empty:** If Module Name is missing or empty, behavior is **unchanged**; existing identification and line-type rules remain the sole basis.
- **Normalization layer:** The **existing identification system remains the only normalizing layer**; Module Name cannot override, refine, or replace it.

**Disallowed (Always):**
- Any **fuzzy matching**, keyword inference, ML/probabilistic mapping, or synonym expansion based on Module Name.
- Any **non-deterministic grouping** or device-type classification derived from Module Name wording.
- Any reliance on **unstable vendor phrasing** to infer hardware vs. service vs. attribute lines.

### 8.3 Compatibility Constraints (Locked)
- **Dell-only:** This policy does **not** apply to HPE and does **not** change HPE behavior.
- **Stage 1 unchanged:** No changes to Stage 1 extraction/adapter behavior are implied.
- **Stage 2–4 unchanged:** Existing Dell Stage 2–4 behavior remains closed; Module Name does not create new segmentation rules.

### 8.4 Deterministic Guidance (What to Do Instead)
- Use **existing identifiers and line roles** (Anchor/Item/Attribute/Meta) as the **only** basis for cleaned spec classification.
- If module-level grouping is required, create a **separate design-update PR** that introduces a **controlled vocabulary** and an explicit, deterministic mapping.

### 8.5 Examples (Consistent with Observed Patterns)
1) **Pass-through only:**  
   Input row has `Module Name = "Power"`, but item classification remains based on existing identifiers; cleaned spec may include `"module_name": "Power"` as informational text.
2) **Missing Module Name:**  
   Input row lacks Module Name → classification uses existing identifiers; no change in output grouping.
3) **Conflicting wording:**  
   `Module Name = "Storage/RAID"` on a service line does **not** reclassify the line as hardware; line role remains service per existing rules.
4) **Bundle wording variance:**  
   Two rows with different Module Name values (e.g., `"Compute"` vs. `"System"`) do **not** merge or split configurations; anchors still define segments.
