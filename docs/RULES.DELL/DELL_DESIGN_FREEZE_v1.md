DOC_TYPE: NORMATIVE
DOC_SCOPE: DELL
DOC_STATUS: FROZEN
DOC_ROLE: Consultant-window, Project-window, Codex-context

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
- **No heuristic or free-text device-type inference.**
- **No changes to Stage 1 behavior.**

Design Freeze v1 locks **architecture, contracts, segmentation rules, and deterministic behavior**; however, **documentation-only semantic clarification** (including Stage 4 semantic explanations) is permitted **only** when it introduces **no behavioral or architectural change**, and such clarification does **not** weaken, bypass, or reinterpret the freeze.

## 7.1) Design Update — Semantic Model v2.1 (Locked, Documentation-Only)
This section **explicitly permits** the **semantic model v2.1** for Dell documentation while preserving the v1 constraints.

### 7.1.0 Design Freeze compatibility note (Normative)
- Design Freeze v1 remains in force for structure, determinism, and pipeline constraints.
- Documentation may evolve semantically without changing Stage 1–4 behavior.
- Semantic Model v2 (as defined in Dell docs) is **compatible** with Design Freeze v1.

### 7.1.1 Scope and non-impact
- This section is **documentation-only** and does **not** change Stage 1–4 behavior.
- All rules remain **deterministic**; no ML, probabilistic logic, or free-text heuristics are allowed.
- Module Name remains **non-authoritative** and **MUST NOT** be used for inference.

### 7.1.2 Line type vs. device type (v2.1)
- **line_type** is a **high-level class** and MUST be one of:
  - SYSTEM / PHYSICAL_COMPONENT / CONFIGURATION / SOFTWARE_LICENSE / SERVICE / META.
- **device_type** is the **semantic type of a cleaned spec row** and is defined by the Dell Device_Type Gatekeeper.
- device_type applies to normal/repeatable rows of
  SYSTEM / PHYSICAL_COMPONENT / CONFIGURATION / SOFTWARE_LICENSE / SERVICE.
- The two fields serve different purposes and **MUST NOT** be conflated.

### 7.1.3 Canonical device_type enums (v2.1, minimal set)
- **SYSTEM** rows: device_type MUST be **SERVER** (canonical value; SYSTEM MAY be used only if explicitly documented elsewhere).
- **PHYSICAL_COMPONENT** rows: device_type MUST be one of
  CPU, RAM, SSD, HDD, PSU, RAID_CONTROLLER, NIC, GPU, HEATSINK, FAN, BACKPLANE, CHASSIS_PART.
- **CONFIGURATION** rows: device_type MUST be **CONFIGURATION**.
- **SOFTWARE_LICENSE** rows: device_type MUST be **SOFTWARE_LICENSE**.
- **SERVICE** rows: device_type MUST be **SERVICE**.
- **Fallback:** if a deterministic mapping cannot be established, device_type MAY be **Unclear** only as a temporary fallback.

## 8) Module Name Policy (Dell-Only, Frozen)
This section defines the **normative policy** for the Dell input column labeled **“Module Name.”**

### 8.1 Definition (Observed)
- **Module Name** is a **free-text** column value present in some Dell input rows.
- It reflects **vendor/user wording** and may vary across files, bundles, or quoting tools.
- It is relevant **only to downstream consumers** of the cleaned spec as an informational label; it is **not** a structural anchor.

### 8.2 Outcome B — Disallowed for Semantic Use (Authoritative)
Because Module Name is **free-text**, the requested use of Module Name as a **deterministic semantic hint** is **rejected** in Dell cleaned spec. It **MUST NOT** be used for classification, grouping, or device-type inference.

**Allowed (Deterministic, Non-Semantic):**
- **Pass-through only:** Module Name MAY be surfaced as an **informational field** in the cleaned spec **without** affecting identifiers, grouping, or line typing.
- **Missing/empty:** If Module Name is missing or empty, behavior is **unchanged**; existing identification and line-type rules remain the sole basis.
- **Normalization layer:** The **existing identification system remains the only normalizing layer**; Module Name cannot override, refine, or replace it.
- **No implicit mapping:** Module Name is **not** a required or expected 1:1 mapping to any device type, and it **cannot** be treated as one.

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

## 9) Stage 4 Exception: System Metadata Signals (Design Update v2)

### Compatibility & Design Update [2026-02-21]
- This section is a **formal design update** to the frozen v1 document and explicitly addresses the previously identified gap in system anchor and configuration metadata identification.
- For the limited allowlist below, this update **supersedes prior Module Name prohibitions** in this document only for **Stage 4 device_type classification**.
- This update is **Dell-only**, **deterministic**, and introduces **no regex, heuristics, fuzzy matching, or ML behavior**.

### 9.1 Closed allowlist (authoritative)
Stage 4 MAY use `module_name_raw` as a deterministic signal **only** when the value is an **exact-match** to one of the following strings:
- `Base`
- `Thermal Configuration`
- `BIOS and Advanced System Configuration Settings`
- `DPU Cables`

### 9.2 Hard boundaries (non-negotiable)
- The allowlist is **closed**; no additional values are implied.
- Matching is **exact string equality** on `module_name_raw`; no regex, contains, tokenization, synonym expansion, or fuzzy logic is permitted.
- The exception applies **only to system anchors and configuration metadata semantics** in Stage 4 classification.
- **Physical component classification remains part-number-based only** (e.g., CPU, RAM, SSD, HDD, PSU, RAID_CONTROLLER, NIC, GPU, HEATSINK, FAN, BACKPLANE, CHASSIS_PART). Module Name MUST NOT classify physical hardware.

### 9.3 Consistency with freeze constraints
- Stage 1 extraction/adapter behavior is unchanged.
- Stage 2–3 deterministic contracts are unchanged.
- This is a constrained Stage 4 semantic exception and does not authorize broader Module Name inference.

