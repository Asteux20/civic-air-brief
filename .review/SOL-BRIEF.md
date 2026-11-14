You are a strict reviewer. Read-only. Budget: be brief, max 30 lines of output total. No praise, no restating code.

Repo: this folder. Review ONLY lib/*.js and api/brief.js (backend of a Vercel app). Do not read public/ or test/ except to confirm a claim.

Product requirement (hackathon problem statement, verbatim):
"Develop an AI-driven civic intelligence solution that enables local authorities, housing societies, and ward-level teams to turn raw air quality data into actionable local interventions. The solution must leverage Generative AI as a core component to interpret pasted or uploaded data tables, including messy ones with inconsistent formats, units, or missing readings, and summarize trends and likely hotspots in plain language. It should recommend prioritized local actions suited to who is asking, since a ward officer, a housing society, and a school can each do different things. Every finding should be traceable to the underlying data, with data gaps and unreliable readings clearly flagged. The assistant should compare each new brief with the previous one to show what changed, and generate both an internal briefing note and a citizen advisory in multiple languages, written for different reading levels, with extra care for children, older adults, and people sensitive to poor air."

Scoring weights: code quality + problem alignment HIGH, security + efficiency MEDIUM, testing + accessibility LOW. Disqualifiers: hardcoded/fake output, hallucinated AI responses.

Output exactly:
1. BLOCKERS (bugs that give wrong numbers, crash, leak secrets, or let AI output be untraceable): file:line, one line each, with the fix in one line. Max 6.
2. REQUIREMENT GAPS: for each clause of the requirement above, MET / PARTIAL / MISSING, one line each.
3. TOP 3 cheap improvements for score (code quality or security), one line each.
4. VERDICT: ACCEPT or CHANGES REQUIRED.
