# Submission text (paste into the platform)

**Project:** Air Briefing Studio, a civic air quality briefing tool

**Live app:** <DEPLOYED_URL>
**Repo:** <GITHUB_URL>
**Access code:** airbrief2026 (type it into the Access code field)

## What I built
A web app that takes a raw air quality table, pasted or uploaded and as messy as it comes (mixed delimiters, units in headers or cells, missing, negative, duplicate or stuck-sensor readings, Indian day-first dates). It produces a brief for a ward officer, a housing society or a school: plain-language trends and hotspots, prioritised actions that role can take, data caveats, what changed since the last brief, an internal briefing note, and citizen advisories in up to 4 Indian languages at a simple or standard reading level, with separate advice for children, older adults and people sensitive to poor air.

## Idea
AI should explain the data, not make it up. So the numbers are computed in code first: cleaning, unit conversion, quality flags with row numbers, averages, CPCB bands, NAAQS exceedances, trends and hotspot ranking. Each result becomes a numbered fact tied to its source rows. Gemini sees only those facts and has to cite fact ids for every finding. The app checks every citation and marks anything uncited as Unverified, so every claim on screen can be clicked back to the rows behind it.

## Expectations
A ward team or RWA can paste whatever export they have and get, in under a minute, a brief they can act on and an advisory they can forward, without anyone cleaning the spreadsheet first. Re-running it each week shows whether things got better or worse.

## GenAI capabilities and where
- Gemini 3.5 Flash (falls back to gemini-flash-latest when busy) with structured JSON output (response schema): lib/ai.js callGemini
- Plain-language summary, trends and hotspot explanations from computed facts: lib/ai.js buildPrompt
- Role-specific prioritised actions (ward officer / housing society / school): role profiles in lib/ai.js
- Narrative of what changed vs the previous brief (diff computed in lib/diff.js)
- Internal briefing note with inline fact citations
- Multilingual citizen advisories (10 Indian languages) at 2 reading levels with sections for children, older adults and sensitive groups
- Hallucination guard: the model gets facts only, citations are verified in lib/ai.js verifyEvidence, uncited items are flagged in the UI

## Quality
- node:test unit and handler tests (npm test), no network needed
- Security: server-side key, constant-time access code, per-IP rate limit, input whitelists, size limits, strict CSP, textContent-only rendering, structured logs without table contents
- Accessibility: skip link, labelled fields, aria-live status, keyboard tabs for advisories, lang attribute per advisory, dark mode, reduced motion
