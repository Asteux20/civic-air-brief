/**
 * Orchestrates one brief: parse -> analyse -> compare -> Gemini -> verify.
 */
import { parseTable } from './parse.js';
import { analyze, snapshot } from './analyze.js';
import { compareSnapshots } from './diff.js';
import { buildPrompt, callGemini, verifyEvidence } from './ai.js';

/**
 * @param {{table: string, role: string, languages: string[], readingLevel: string, previous: object|null}} input
 * @param {{generate?: Function}} deps injectable AI call for tests
 */
export async function createBrief(input, { generate = callGemini } = {}) {
  let parsed;
  try {
    parsed = parseTable(input.table);
  } catch (err) {
    throw Object.assign(err, { status: 422 });
  }
  const analysis = analyze(parsed);
  if (!analysis.stats.length) {
    throw Object.assign(new Error('No usable readings were found after cleaning. Check the flagged issues in your table.'), { status: 422 });
  }
  const current = snapshot(analysis);
  const comparison = compareSnapshots(current, input.previous);
  const prompt = buildPrompt({ analysis, comparison, role: input.role, languages: input.languages, readingLevel: input.readingLevel });
  const { brief, model } = await generate(prompt);
  const { brief: verified, unverifiedCount } = verifyEvidence(brief, analysis.facts);

  return {
    generatedAt: new Date().toISOString(),
    role: input.role,
    model,
    brief: verified,
    unverifiedCount,
    analysis: {
      rowCount: analysis.rowCount,
      validReadings: analysis.validReadings,
      period: analysis.period,
      issueSummary: analysis.issueSummary,
      locations: analysis.locations,
      hotspots: analysis.hotspots,
      facts: analysis.facts,
    },
    issues: parsed.issues.slice(0, 500),
    comparison,
    snapshot: current,
  };
}
