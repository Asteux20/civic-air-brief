// @ts-check
/**
 * Shared JSDoc typedefs for the data that moves between lib/ modules and api/brief.js.
 * There is no runtime code here; `export {};` only makes this file a valid ES module so
 * other files can write `import('./types.js').Reading`.
 */

/**
 * @typedef {object} Reading one valid pollutant value from one table row (lib/parse.js parseRow)
 * @property {number} row 1-based source line number
 * @property {string} location station name, or 'Unspecified location'
 * @property {string|null} time ISO timestamp, null when the table has no usable date
 * @property {string} pollutant key of POLLUTANTS, for example 'pm25'
 * @property {number} value raw value in the canonical unit, never rounded
 * @property {string} rawValue the cell text as written
 * @property {boolean} [suspect] set when the value is flagged (PM2.5 above PM10, flatline) and left out of stats
 */

/**
 * @typedef {object} Issue one data-quality problem found while parsing (lib/parse.js)
 * @property {number} row 1-based source line number
 * @property {string} column header text the issue belongs to, '*' for a whole row
 * @property {string} type 'missing', 'non_numeric', 'negative', 'implausible', 'converted', 'inconsistent', 'bad_time', 'duplicate' or 'flatline'
 * @property {string} message plain-words description
 * @property {string} rawValue the offending cell text, '' when there is none
 * @property {string} [location] station name, absent on duplicate-row and bad-time issues
 */

/**
 * @typedef {object} ParseResult output of parseTable
 * @property {{index: number, raw: string, key: string|null, unit: string|null}[]} columns every header cell, classified
 * @property {Reading[]} readings
 * @property {Issue[]} issues
 * @property {number} rowCount data rows read, header excluded
 * @property {string} delimiter ',', tab, ';', '|' or 'spaces'
 */

/**
 * @typedef {object} Fact one numbered statement the AI may cite (lib/analyze.js createFacts)
 * @property {string} id 'F1', 'F2', ... in creation order
 * @property {'stat'|'trend'|'quality'} kind
 * @property {string} text sentence with rounded numbers
 * @property {number[]} rows up to 30 sorted source rows the fact rests on
 */

/**
 * @typedef {object} Trend change over time for one location and pollutant (lib/analyze.js trendOf)
 * @property {'rising'|'falling'|'stable'} direction rising or falling means more than 10% change
 * @property {number} pct percentage change from the first third to the last third
 * @property {number} from mean of the first third
 * @property {number} to mean of the last third
 * @property {number[]} rows source rows of the points compared
 */

/**
 * @typedef {object} Stat statistics for one location and pollutant (lib/analyze.js buildStat)
 * @property {string} location
 * @property {string} pollutant key of POLLUTANTS
 * @property {number} n valid readings used
 * @property {number} mean raw mean
 * @property {number} max highest raw value
 * @property {number} maxRow source row of the highest value
 * @property {string|null} maxTime time of the highest value
 * @property {string} band CPCB band of the mean
 * @property {number} ratio mean divided by the India limit
 * @property {number} exceedances readings above the limit
 * @property {Trend|null} trend null under 3 dated points
 * @property {number[]} series last 60 dated values, oldest first
 * @property {string} factId id of the stat fact
 * @property {string} [trendFactId] id of the trend fact, present when trend is not null
 */

/**
 * @typedef {object} LocationSummary one location with its worst pollutant and data confidence (lib/analyze.js summariseLocation)
 * @property {string} name
 * @property {string} worstPollutant pollutant with the highest ratio to its limit
 * @property {number} worstRatio
 * @property {boolean} exceeds true when worstRatio is above 1
 * @property {string} worstBand
 * @property {string} worstFactId
 * @property {string[]} factIds every stat and trend fact of this location
 * @property {number} validReadings
 * @property {number} flaggedReadings
 * @property {'low'|'medium'|'high'} confidence low above 30% flagged, medium above 10%
 * @property {Record<string, number>} means raw mean per pollutant
 * @property {number[]} series dated values of the worst pollutant
 */

/**
 * @typedef {object} Period first and last reading time
 * @property {string} from ISO timestamp
 * @property {string} to ISO timestamp
 */

/**
 * @typedef {object} Analysis output of analyze()
 * @property {number} rowCount data rows in the table
 * @property {number} validReadings readings not flagged as suspect
 * @property {Record<string, number>} issueSummary issue count per issue type
 * @property {Period|null} period null when no reading has a time
 * @property {Stat[]} stats
 * @property {LocationSummary[]} locations worst first
 * @property {string[]} hotspots names of locations above a limit
 * @property {Fact[]} facts
 */

/**
 * @typedef {object} Snapshot compact copy of an analysis kept by the browser for the next brief (lib/analyze.js snapshot)
 * @property {string[]} hotspots
 * @property {number} issueTotal flagged issues, unit conversions excluded
 * @property {Record<string, Record<string, number>>} locations raw mean per pollutant for each location
 * @property {Period|null} [period] null or absent when the data had no usable dates
 */

/**
 * @typedef {object} Change one difference between two snapshots (lib/diff.js)
 * @property {string} location
 * @property {string|null} pollutant null for a new or missing location
 * @property {'worse'|'better'|'new_location'|'missing_location'} type
 * @property {number} [before] previous raw mean
 * @property {number} [after] current raw mean
 * @property {number} [pct] percentage change, rounded to one decimal
 * @property {string} text one sentence for the brief
 */

/**
 * @typedef {object} Comparison output of compareSnapshots()
 * @property {boolean} hasPrevious false when there was no usable previous snapshot
 * @property {Change[]} changes largest change first
 * @property {string[]} newHotspots
 * @property {string[]} resolvedHotspots hotspots that still report data and are no longer above the limit
 * @property {number} issueDelta change in flagged issues
 * @property {{before: Period|null, after: Period|null}} [periods] present when hasPrevious is true
 */

/**
 * @typedef {object} Alert one proactive alert computed in code (lib/alerts.js)
 * @property {string} id deterministic id, stable for the same data
 * @property {'severe'|'rising'|'new_hotspot'|'worsened'|'low_confidence'} kind
 * @property {'urgent'|'warning'|'notice'} severity
 * @property {string} location
 * @property {string} text what was found, numbers from the facts
 * @property {string} nextStep what the asking role can do
 * @property {string[]} factIds facts the alert cites
 * @property {{before: number, after: number, pct: number, periods: object}} [change] diff record for change alerts
 */

/**
 * @typedef {object} Advisory citizen advisory in one language
 * @property {string} language
 * @property {string} headline
 * @property {string} general
 * @property {string} children
 * @property {string} olderAdults
 * @property {string} sensitiveGroups
 * @property {string} outdoorWorkers
 */

/**
 * @typedef {object} Brief validated Gemini brief (lib/schema.js validateBrief). After verifyEvidence each cited item also carries verified and unverifiedReason.
 * @property {string} summary
 * @property {string} internalNote
 * @property {string} changeNarrative
 * @property {{text: string, evidence: string[]}[]} trends
 * @property {{location: string, why: string, evidence: string[]}[]} hotspots
 * @property {{action: string, why: string, timeframe: string, priority: number, evidence: string[]}[]} actions priority 1 to 9, 9 when missing
 * @property {{text: string, evidence: string[]}[]} dataCaveats
 * @property {Advisory[]} advisories one per requested language that the model completed
 */

/**
 * @typedef {object} AiResult output of generateBrief (lib/brief.js)
 * @property {Brief} brief
 * @property {string} model model that produced the answer
 * @property {'complete'|'partial'} aiStatus partial when required output was still missing after the retry
 * @property {string[]} missing required fields or 'advisory:<language>' entries that are absent
 */

/**
 * @typedef {object} BriefRequest validated request body (lib/validate.js validateRequest)
 * @property {string} table pasted or uploaded table text
 * @property {string} role key of ROLES
 * @property {string[]} languages 1 to 4 entries of LANGUAGES
 * @property {string} readingLevel key of READING_LEVELS
 * @property {Snapshot|null} previous rebuilt previous snapshot, null when absent or malformed
 */

/**
 * @typedef {object} Prepared everything computed in code before the AI call (lib/brief.js prepareBrief)
 * @property {BriefRequest} input
 * @property {ParseResult} parsed
 * @property {Analysis} analysis
 * @property {Snapshot} current
 * @property {Comparison} comparison
 * @property {Alert[]} alerts
 * @property {string} prompt
 * @property {Fact[]} promptFacts facts the model may cite
 * @property {number} omitted facts left out of the prompt for size
 */

/**
 * @typedef {object} BriefResult the API response body before the handler adds cached, instanceId and store (lib/brief.js assembleResult)
 * @property {string} generatedAt ISO timestamp
 * @property {string} role
 * @property {string} model
 * @property {string} aiStatus
 * @property {Brief} brief brief with every cited item marked verified or not
 * @property {number} unverifiedCount
 * @property {{verified: number, total: number}} traced
 * @property {number[]} unsupportedNumbers
 * @property {string[]} missingLanguages
 * @property {Alert[]} alerts
 * @property {number} factsInPrompt
 * @property {number} factsOmitted
 * @property {{rowCount: number, validReadings: number, period: Period|null, issueSummary: Record<string, number>, locations: LocationSummary[], hotspots: string[], facts: Fact[]}} analysis
 * @property {Issue[]} issues first 500 issues
 * @property {Comparison} comparison
 * @property {Snapshot} snapshot
 */

export {};
