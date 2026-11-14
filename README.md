# Air Briefing Studio

Civic Air Quality Briefing Studio for the PromptWars warm-up challenge. It turns a raw, messy air quality table into a brief that a ward officer, a housing society or a school can act on. Every finding links back to the rows it came from.

## Access for evaluators

- Live app: see the deployed link on the submission
- Access code: `airbrief2026` (type it in the Access code field)
- Click **Load sample messy table**, then **Generate brief**. Generate a second time, or change rows, to see **What changed**.

## What it does

1. **Reads messy tables.** CSV, TSV, semicolon, pipe or space-aligned text, pasted or uploaded. Headers like `Station Name`, `Ward`, `PM2.5 (ug/m3)`, `NO2 ppb` are recognised. Units in headers or cells (Âµg/mÂ³, mg/mÂ³, ppb, ppm) are converted to standard units.
2. **Flags bad data in code**, with row numbers: missing values, non-numeric cells, negative readings, implausible spikes, duplicate rows, PM2.5 above PM10, stuck sensors (4+ identical readings) and unreadable dates. Flagged readings are kept out of the statistics.
3. **Computes facts in code**: per-site averages, peaks, CPCB AQI bands, exceedances of the India NAAQS limits, trends (first third vs last third of readings) and a hotspot ranking with a data-confidence level. Each fact gets an id (F1, F2, ...) and its source rows.
4. **Gemini writes the guidance** from those facts only: summary, trends, hotspots, prioritised actions for the chosen role, data caveats, a "what changed" narrative, an internal briefing note, and citizen advisories.
5. **Checks the AI's citations.** Every trend, hotspot, action and caveat must cite fact ids. Unknown ids are removed, and items with no valid citation are shown as **Unverified**.
6. **Compares with the previous brief.** A snapshot of each brief is stored in the browser, and the next brief is diffed against it in code: sites up or down by 10% or more, new and resolved hotspots, change in flagged issues.
7. **Multilingual citizen advisories.** Up to 4 of 10 Indian languages, at a simple (age 10) or standard reading level, each with separate advice for children, older adults and sensitive groups.

## GenAI capabilities and where they are used

| Capability | Where |
| --- | --- |
| Gemini 2.5 Flash, structured JSON output with a response schema | `lib/ai.js` `callGemini` |
| Plain-language summary of trends and hotspots | `summary`, `trends`, `hotspots` |
| Role-aware prioritised actions (ward officer, housing society, school) | `buildPrompt` role profiles in `lib/ai.js` |
| Narrative of what changed since the previous brief | `changeNarrative`, using the code diff from `lib/diff.js` |
| Internal briefing note with inline fact citations | `internalNote` |
| Multilingual advisories at chosen reading levels, with vulnerable-group sections | `advisories` |
| Anti-hallucination: model sees only computed facts, citations are verified | `verifyEvidence` in `lib/ai.js` |

## Architecture

```
public/        static UI (vanilla JS, no innerHTML with data, accessible tabs and live status)
api/brief.js   Vercel function: access code, rate limit, validation, structured logs
lib/parse.js   messy table parser and unit conversion
lib/analyze.js facts, bands, trends, hotspots
lib/diff.js    brief-to-brief comparison
lib/ai.js      prompt, Gemini call, citation verification
lib/validate.js input validation, constant-time access check, rate limiter
test/          node:test unit and handler tests (no network)
```

## Security

- Gemini key stays on the server (`GEMINI_API_KEY`), sent in a header, never to the browser.
- Access code (`ACCESS_CODE`) checked in constant time; per-IP rate limit of 8 briefs per minute.
- Input whitelists for role, language and reading level; 300 KB table limit; 5,000 row limit.
- Strict Content-Security-Policy, `nosniff`, `DENY` framing; UI renders with `textContent` only.
- Structured logs record outcomes and timings, never table contents.

## Run locally

```bash
GEMINI_API_KEY=your_key ACCESS_CODE=airbrief2026 node dev-server.js
npm test
```

No dependencies to install. Node 20 or newer.

## Limits

- Standards are India NAAQS; trends need at least 3 dated readings per site and pollutant.
- History is stored in this browser only.
