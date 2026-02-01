# Dell cleaned spec semantic model v2.1 (documentation)

## Status and intent
- **Status:** documentation / target semantic model v2.1.
- **Intent:** define semantic classes for interpretation and future alignment.
- **Non-impact:** this document **does not change current pipeline behavior**; it documents the semantic model only.

## Authoritative compatibility
This document is additive and **must not contradict** the following Dell-only sources:
- [Dell Design Freeze v1 — Segmentation & Line Semantics](../DELL_DESIGN_FREEZE_v1.md)
- [PRINCIPLE: CLEANED SPEC — DELL](../CLEANED_SPEC_PRINCIPLE_Dell.txt)
- [DELL DEVICE_TYPE GATEKEEPER PRINCIPLE](../Dell_Device_Type_Gatekeeper_Principle.txt)

## Terminology note (semantic class vs. device_type)
- The semantic **class** in this document describes the **meaning of a cleaned spec row** (SYSTEM / PHYSICAL_COMPONENT / CONFIGURATION / SOFTWARE_LICENSE / SERVICE / META).
- **line_type** is the required high-level class for every row.
- **device_type** applicability is defined by the Dell Device_Type Gatekeeper; for Dell, it applies **only** to SYSTEM rows.
- Non-system rows **must omit** device_type; absence is the correct final state.
- This document does **not** introduce new field names; it describes the semantic model at the conceptual level.

## Canonical semantic classes
The following classes are canonical for Dell cleaned spec v2 interpretation. They are **semantic definitions**, not implementation rules.

| Class | Definition | Invariants |
| --- | --- | --- |
| **SYSTEM** | System-level base/server line that represents the configuration anchor. | device_type MUST be SERVER (canonical). |
| **PHYSICAL_COMPONENT** | Physical supply installed in or shipped with the system (parts, subassemblies, accessories). | device_type is not applicable; rows must omit device_type. |
| **CONFIGURATION** | Settings, modes, constraints, confirmations, or “No X” statements. | device_type is not applicable; rows must omit device_type. |
| **SOFTWARE_LICENSE** | Non-physical software, licenses, and entitlement features. | device_type is not applicable; rows must omit device_type. |
| **SERVICE** | Support, warranty, deployment, installation, or other service offerings. | device_type is not applicable; rows must omit device_type. |
| **META** | Regulatory, shipping, documentation, labels, and similar non-physical metadata. | device_type is not applicable; rows must omit device_type. |

## Definitions and invariants
- **SYSTEM** is the system-level anchor concept (Base / Server). device_type MUST be SERVER (canonical), per the gatekeeper principle. This does not change any existing behavior or rules.
- **PHYSICAL_COMPONENT** covers physical supply (CPU, memory, storage, PSU, RAID controller, NIC, GPU, heatsink, fan, chassis parts). These lines must be explicitly recognized as physical when known; device_type is not applicable to these rows.
- **CONFIGURATION** is for settings, modes, capability flags, and “No X” statements (e.g., BIOS or RAID modes). It is **not** physical supply and must remain separate from PHYSICAL_COMPONENT.
- **SOFTWARE_LICENSE**, **SERVICE**, and **META** are non-physical groups and are listed separately from physical supply, consistent with the cleaned spec principle.

## Canonical enums (v2.1)
### line_type (required)
SYSTEM / PHYSICAL_COMPONENT / CONFIGURATION / SOFTWARE_LICENSE / SERVICE / META

### device_type (SYSTEM-only; required, non-empty when applicable)
- SYSTEM: SERVER (canonical; SYSTEM MAY be used only if documented elsewhere).
- Fallback: UNCLEAR (deterministic, non-empty) **only** when a SYSTEM row cannot be classified deterministically.

## “Unclear” policy (semantic)
- **UNCLEAR** is a deterministic fallback for **SYSTEM rows only** when no deterministic classification exists.
- **UNCLEAR must not be used as a default bucket** and must never appear on non-system rows.

## Examples (documentation-only)
These are illustrative and do not imply implementation changes.

**SYSTEM**
- “Base / PowerEdge R760 Server”

**PHYSICAL_COMPONENT**
- CPU
- Memory DIMM
- SSD / HDD
- PSU
- RAID Controller
- NIC
- GPU

**CONFIGURATION**
- “No Operating System” (absence/decline statement)
- “No Media Required”
- “UEFI BIOS Boot Mode”
- “Performance Optimized”
- “No HBM”

**SOFTWARE / LICENSE**
- Operating system license (when it is an entitlement/license line, not a “No X” statement)
- iDRAC feature license

**SERVICE**
- Warranty / ProSupport
- Deployment / installation services

## Compatibility notes with Design Freeze v1
- **Segmentation line roles remain unchanged**: Anchor, Item, Attribute, Meta. See Design Freeze v1 for the locked rules.
- **CONFIGURATION in v2 corresponds conceptually to Attribute lines**, but this document does **not** claim a 1:1 implementation mapping unless already present in current behavior.
- **No behavior changes are implied** for Stage 1–4, module name handling, or segmentation rules.

## Non-goals
- No new heuristics, ML, or probabilistic logic.
- No changes to Dell pipeline behavior.
- No reinterpretation of Dell Design Freeze v1 or device_type gatekeeper policy.
