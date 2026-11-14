1. BLOCKERS
- lib/ai.js:111: Any existing fact ID marks fabricated claims verified; summary, notes and advisories bypass checks. Fix: validate claim support and require evidence throughout.
- lib/parse.js:198: Decimal-comma CO `1,5` becomes `15`, corrupting severity. Fix: parse locale-aware numbers or flag ambiguity.
- lib/analyze.js:97: Rounding ratios before hotspot selection hides exceedances, e.g. PM2.5 `61/60` becomes `1.0`. Fix: classify using unrounded values.
- lib/parse.js:174: Removing comments and blank lines shifts evidence references, e.g. source row 4 becomes row 2. Fix: preserve original line numbers.
- lib/validate.js:21: Unvalidated previous snapshots allow `hotspots: {}` to trigger TypeError and HTTP 500. Fix: validate the complete snapshot schema.
- lib/parse.js:108: ISO timestamps lose seconds and timezone offsets, corrupting chronology. Fix: preserve explicit offsets and validate calendar components.

2. REQUIREMENT GAPS
- MET: Local interventions for authorities, housing societies and ward teams are supported.
- PARTIAL: Generative AI summarizes computed facts but never interprets the raw messy table.
- PARTIAL: Pasted/upload-derived text is supported; inconsistent formats and units can silently produce wrong readings.
- MET: Plain-language trends and likely hotspots are requested.
- MET: Prioritized actions are tailored to ward officers, housing societies and schools.
- PARTIAL: Findings have evidence IDs, but support is unchecked and source rows can be wrong.
- PARTIAL: Missing/unreliable readings are flagged; ambiguous numbers and unsupported units can pass.
- PARTIAL: Previous-brief comparison exists; malformed snapshots crash and missing stations can appear “resolved.”
- PARTIAL: Internal notes and multilingual citizen advisories exist; only advisories receive language and reading-level instructions.
- MET: Advisory prompts explicitly cover children, older adults and sensitive groups.

3. TOP 3 cheap improvements for score
- Validate Gemini output locally, including required fields, requested languages and nonempty evidence.
- Delimit untrusted location names in prompts and explicitly prohibit treating them as instructions.
- Replace instance-local throttling with shared rate limiting to bound paid Gemini requests.

4. VERDICT: CHANGES REQUIRED.
Evidence: 6 targeted reproductions, Node exit 0 via PowerShell; test suite and live Gemini behavior not checked.