// @ts-check
/**
 * One brief, in three steps: prepareBrief (parse, analyse, compare, alert, prompt; all
 * deterministic), generateBrief (Gemini with schema validation and one retry) and
 * assembleResult (verify citations and shape the response).
 */
import { parseTable } from './parse.js';
import { analyze, snapshot } from './analyze.js';
import { compareSnapshots } from './diff.js';
import { deriveAlerts } from './alerts.js';
import { buildPrompt, callGemini, verifyEvidence, DEADLINE_MS } from './ai.js';
import { validateBrief } from './schema.js';
import { AppError } from './errors.js';

const MAX_ISSUES = 500;
// A retry is only attempted while this much of the deadline is left.
const MIN_RETRY_MS = 20000;

/**
 * Everything computed in code before the AI call.
 * @param {import('./types.js').BriefRequest} input validated request
 * @returns {import('./types.js').Prepared}
 * @throws {AppError} 422 when the table cannot be parsed or has no usable readings
 */
export function prepareBrief(input) {
  let parsed;
  try {
    parsed = parseTable(input.table);
  } catch (err) {
    throw new AppError(422, 'table_unreadable', err.message, 'table');
  }
  const analysis = analyze(parsed);
  if (!analysis.stats.length) {
    throw new AppError(422, 'no_readings', 'No usable readings were found after cleaning. Check the flagged issues in your table.', 'table');
  }
  const current = snapshot(analysis);
  const comparison = compareSnapshots(current, input.previous);
  const alerts = deriveAlerts(analysis, comparison, input.role);
  const { prompt, facts, omitted } = buildPrompt({ analysis, comparison, alerts, table: { columns: parsed.columns, rowCount: parsed.rowCount, delimiter: parsed.delimiter, issueCount: parsed.issues?.length ?? 0 }, role: input.role, languages: input.languages, readingLevel: input.readingLevel });
  return { input, parsed, analysis, current, comparison, alerts, prompt, promptFacts: facts, omitted };
}

/**
 * Ask Gemini, validate the answer, and retry once if required output is missing.
 * @param {string} prompt full prompt from buildPrompt
 * @param {string[]} languages requested advisory languages
 * @param {(prompt: string, opts: {timeoutMs: number}) => Promise<{brief: unknown, model: string}>} generate
 * @param {() => number} [now] clock in milliseconds, replaced in tests
 * @returns {Promise<import('./types.js').AiResult>}
 * @throws {Error} the generate error when the first attempt fails or no partial answer exists
 */
export async function generateBrief(prompt, languages, generate, now = Date.now) {
  const started = now();
  let partial = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const timeoutMs = DEADLINE_MS - (now() - started);
    if (partial && timeoutMs < MIN_RETRY_MS) break;
    try {
      const { brief, model } = await generate(prompt, { timeoutMs });
      const { brief: clean, missing } = validateBrief(brief, languages);
      if (!missing.length) return { brief: clean, model, aiStatus: 'complete', missing };
      partial = { brief: clean, model, aiStatus: 'partial', missing };
    } catch (err) {
      if (!partial) throw err;
    }
  }
  return /** @type {any} */ (partial);
}

/**
 * Verify the AI output against the prompt facts and shape the API response.
 * @param {import('./types.js').Prepared} prepared
 * @param {import('./types.js').AiResult} ai
 * @returns {import('./types.js').BriefResult}
 */
export function assembleResult(prepared, ai) {
  const { input, analysis, comparison, alerts, parsed, current } = prepared;
  // Numbers the model may use beyond fact text: the change list and the standards stated in the prompt.
  const extraText = [...comparison.changes.map((c) => c.text), 'NAAQS 60 100 80 2 24 hour 8 hour'].join(' ');
  const verified = verifyEvidence(ai.brief, prepared.promptFacts, { locations: analysis.locations.map((l) => l.name), languages: input.languages, extraText });
  return {
    generatedAt: new Date().toISOString(),
    role: input.role,
    model: ai.model,
    aiStatus: ai.aiStatus,
    brief: verified.brief,
    unverifiedCount: verified.unverifiedCount,
    traced: verified.traced,
    unsupportedNumbers: verified.unsupportedNumbers,
    missingLanguages: verified.missingLanguages,
    alerts,
    factsInPrompt: prepared.promptFacts.length,
    factsOmitted: prepared.omitted,
    analysis: {
      rowCount: analysis.rowCount,
      validReadings: analysis.validReadings,
      period: analysis.period,
      issueSummary: analysis.issueSummary,
      locations: analysis.locations,
      hotspots: analysis.hotspots,
      facts: analysis.facts,
    },
    issues: parsed.issues.slice(0, MAX_ISSUES),
    comparison,
    snapshot: current,
  };
}

/**
 * Convenience for callers without a cache: prepare, generate and assemble in one call.
 * @param {import('./types.js').BriefRequest} input validated request
 * @param {{generate?: (prompt: string, opts: {timeoutMs: number}) => Promise<{brief: unknown, model: string}>}} [deps] replaces the Gemini call in tests
 * @returns {Promise<import('./types.js').BriefResult>}
 * @throws {AppError} 422 from prepareBrief, or the error from the AI call
 */
export async function createBrief(input, { generate = (prompt, opts) => callGemini(prompt, opts) } = {}) {
  const prepared = prepareBrief(input);
  return assembleResult(prepared, await generateBrief(prepared.prompt, input.languages, generate));
}
