# HPE Vendor Validation (MVP)

This module adds HPE-specific validation checks on top of Canonical v1 outputs. The
results are aggregated into `summary.validation.hpe` without changing the Canonical
schema.

## Output shape

```json
{
  "validation": {
    "hpe": {
      "vendor": "HPE",
      "counts": { "error": 0, "warn": 0, "info": 0 },
      "codes": {
        "HPE.RULE.001": { "severity": "warn", "count": 2 }
      },
      "findingsSample": [
        {
          "code": "HPE.RULE.001",
          "severity": "warn",
          "message": "...",
          "itemRef": "..."
        }
      ],
      "topIssues": [
        { "code": "HPE.RULE.001", "severity": "warn", "count": 2 }
      ]
    }
  }
}
```

## Rule codes (MVP)

| Code | Severity | Description |
| --- | --- | --- |
| `HPE.RULE.001` | warn | Line type sanity: HPE line items missing option/spare/factory-integrated markers and not identified as service. |
| `HPE.RULE.002` | warn | Option kit vs spare mismatch: both signals appear in the same line item. |
| `HPE.RULE.003` | warn/error | Quantity validation: missing quantity (warn) or invalid numeric value (error). |
| `HPE.RULE.004` | warn/info | Part number format anomalies (warn) or normalized tokenized part numbers (info). |
| `HPE.RULE.005` | info | Duplicate part numbers with conflicting descriptions. |

## HPE part-number normalization

HPE part numbers are normalized before evaluating format issues. The normalization trims and
collapses whitespace, removes short trailing tokens (2–4 alphanumeric characters) like
`0D1` or `B19`, preserves hyphens, and uppercases the result. If the normalized candidate
is valid, `HPE.RULE.004` emits an `info` finding indicating that trailing tokens were
ignored; otherwise, `HPE.RULE.004` remains a `warn` for suspicious values.

## Extending

Add new rule modules under `core/validation/vendor/hpe/rules` and include them in the
`RULES` list in `core/validation/vendor/hpe/index.js`.
