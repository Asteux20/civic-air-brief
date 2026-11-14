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
  // Numbers the model may legitimately use beyond fact text: the change list and the standards stated in the prompt.
  const extraText = [...comparison.changes.map((c) => c.text), 'NAAQS 60 100 80 2 24 hour 8 hour'].join(' ');
  const { brief: verified, unverifiedCount, unsupportedNumbers, missingLanguages } = verifyEvidence(brief, analysis.facts, {
    locations: analysis.locations.map((l) => l.name),
    languages: input.languages,
    extraText,
  });

  return {
    generatedAt: new Date().toISOString(),
    role: input.role,
    model,
    brief: verified,
    unverifiedCount,
    unsupportedNumbers,
    missingLanguages,
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
