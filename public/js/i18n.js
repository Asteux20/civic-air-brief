// @ts-check
/**
 * Interface strings for every UI language. Keys match data-i18n attributes and t() calls.
 * Hindi strings are AI-translated and marked as such in the interface.
 */
export const STRINGS = {
  en: {
    skip: 'Skip to content', uiLanguage: 'Interface language', tagHome: 'Air quality brief',
    hero: 'Turn an air quality table, or the air where you are, into actions and advice people can read.',
    how1: 'Load data: try our sample, use your location, or paste your own table.',
    how2: 'Say who you are and which languages people read.',
    how3: 'Get a brief where every number links to the rows it came from.',
    trySample: 'Try the sample table', trySampleD: 'Sample table with typical data problems (invented for the demo)',
    useLocation: 'Use my location', useLocationD: 'Last 24 hours of modelled air for where you are. Not stored.',
    cityLabel: 'Location blocked or unavailable. Search a city instead:', search: 'Search',
    guideTitle: 'How to read your brief', gBand: 'Band',
    gBandD: "India's CPCB scale: Good, Satisfactory, Moderate, Poor, Very Poor, Severe. Poor and worse affects most people on long exposure.",
    gTimes: '2.9× limit', gTimesD: 'The site average divided by the India 24-hour limit (PM2.5 60, PM10 100, NO2 80). Above 1× breaks the standard.',
    gConf: 'Confidence', gConfD: 'High means many clean readings. Low means few readings or many flagged ones, so treat the site with care.',
    gChip: 'F3 chips', gChipD: 'Each chip is a fact computed in code from your rows. Select it to see the exact rows.',
    gUnc: 'Uncertain', gUncD: 'The AI wrote a claim it could not tie to a fact. Read it as a lead, not a finding.',
    setup: 'Your brief', tableLabel: 'Or paste your table here (from Excel, Sheets, a PDF or WhatsApp)', tableHint: 'Copy the cells and paste. Tabs, commas or spaces all work. Messy is fine.',
    upload: 'Upload a file', role: 'I am a', roleWard: 'Ward officer', roleSociety: 'Housing society', roleSchool: 'School', roleHealth: 'Health officer or PHC doctor', roleTraffic: 'Traffic police', roleSite: 'Construction or industry site manager', roleCitizen: 'Parent or resident', roleWorker: 'Delivery rider, gig or outdoor worker',
    langs: 'Advisory languages (up to 4)', level: 'Reading level', levelStd: 'Standard', levelSimple: 'Simple, about age 10',
    code: 'Access code', compare: 'Compare with my last brief on this device', go: 'Write the brief',
    expTitle: 'Going out today', expHint: 'Indicative only, not medical advice. Uses the modelled PM2.5 for your location and US EPA breathing rates.',
    expWho: 'Who', expDoing: 'Doing', expMinutes: 'Minutes', history: 'Past briefs on this device', clear: 'Clear history',
    foot: 'Numbers come from your table, computed in code. Gemini writes the words and cites the numbers. Location data: CAMS model via Open-Meteo, not a station reading.',
    stSend: 'Sent {n} lines', stParse: 'Read {rows} rows, flagged {flagged}', stFacts: 'Computed {facts} facts and {alerts} alerts',
    stWrite: 'Gemini writing the brief', stVerify: 'Traced {v} of {t} claims to facts', stWait: 'Waiting',
    errTable: 'Paste or upload a table first, or try the sample.', errLangs: 'Choose at least one advisory language.',
    loadedSample: 'Sample loaded. Choose who you are, then write the brief.',
    locAsk: 'Asking your browser for your location. We round it to about 1 km and never store it.',
    locFetching: 'Fetching modelled air for {place}...', locLoaded: 'Loaded {n} hours of modelled air for {place}.',
    modelled: 'Modelled data (CAMS via Open-Meteo), not a station reading.', noCity: 'No place found. Check the spelling and try again.',
    alerts: 'Alerts', showAll: 'Show all {n}', worst: 'Worst site', limitTimes: '× the 24-hour limit',
    summary: 'Summary', actions: 'Actions for you', hotspots: 'Hotspots', trends: 'Trends', caveats: 'Data gaps',
    flagged: 'Flagged readings', note: 'Internal note', evidence: 'Evidence', uncertain: 'Uncertain', traced: '{v} of {t} claims traced to your rows',
    compareT: 'Since your last brief', firstBrief: 'First brief on this device. The next one is compared with this.',
    advisory: 'Advisory for residents', copyWa: 'Copy for WhatsApp', copied: 'Copied', print: 'Print',
    children: 'Children', older: 'Older adults', sensitive: 'Asthma, heart or lung conditions, pregnancy', workers: 'Outdoor workers',
    green: 'Ask for trees or a green buffer', greenD: 'A draft letter to your ward office, written from the facts above. Edit the placeholders before sending.',
    portal: 'You can also file it on the central grievance portal (CPGRAMS).', partial: 'Part of the AI output was missing, so this brief is incomplete.',
    degraded: 'Shared store unavailable: limits and cache are per server for now.', expDose: '{dose} µg of PM2.5 inhaled', expRatio: '{r}× the air an adult breathes sitting',
    expBand: 'Air now: {band} ({v} µg/m³ PM2.5)', expBest: 'Best 2 hours today: {start} to {end} ({v} µg/m³)', expNoBest: 'No clean 2-hour window left today in the data.',
    watch: 'Watch for', reduce: 'To breathe less of it', facts: 'Facts computed from your rows', rows: 'Rows',
    group_child: 'Child, 6 to 10 years', group_adult: 'Adult', group_older: 'Older adult, 71 to 80 years',
    act_sitting: 'Sitting or waiting', act_walking: 'Walking', act_play: 'Playing', act_sport: 'Sport or running',
    aiUi: '', noHistory: 'No briefs yet.',
  },
  hi: {
    skip: 'सामग्री पर जाएँ', uiLanguage: 'इंटरफ़ेस की भाषा', tagHome: 'वायु गुणवत्ता ब्रीफ़',
    hero: 'वायु गुणवत्ता की तालिका, या आपके आसपास की हवा को, ऐसे कदमों और सलाह में बदलें जिन्हें लोग पढ़ सकें।',
    how1: 'डेटा लोड करें: नमूना आज़माएँ, अपनी लोकेशन दें, या अपनी तालिका चिपकाएँ।',
    how2: 'बताएँ आप कौन हैं और लोग कौन सी भाषाएँ पढ़ते हैं।',
    how3: 'ऐसा ब्रीफ़ पाएँ जिसकी हर संख्या उन पंक्तियों से जुड़ी हो जिनसे वह आई है।',
    trySample: 'नमूना तालिका आज़माएँ', trySampleD: 'आम डेटा समस्याओं वाली नमूना तालिका (डेमो के लिए बनाई गई)',
    useLocation: 'मेरी लोकेशन इस्तेमाल करें', useLocationD: 'आपके स्थान की पिछले 24 घंटे की मॉडल की गई हवा। सहेजी नहीं जाती।',
    cityLabel: 'लोकेशन बंद या उपलब्ध नहीं। इसके बजाय शहर खोजें:', search: 'खोजें',
    guideTitle: 'अपना ब्रीफ़ कैसे पढ़ें', gBand: 'बैंड',
    gBandD: 'भारत का CPCB पैमाना: अच्छा, संतोषजनक, मध्यम, खराब, बहुत खराब, गंभीर। खराब और उससे ऊपर लंबे समय में ज़्यादातर लोगों पर असर डालता है।',
    gTimes: 'सीमा का 2.9×', gTimesD: 'स्थान का औसत, भारत की 24 घंटे की सीमा से भाग (PM2.5 60, PM10 100, NO2 80)। 1× से ऊपर मानक टूटता है।',
    gConf: 'भरोसा', gConfD: 'उच्च यानी बहुत सी साफ़ रीडिंग। कम यानी कम रीडिंग या बहुत सी संदिग्ध, इसलिए सावधानी से देखें।',
    gChip: 'F3 चिप', gChipD: 'हर चिप आपकी पंक्तियों से कोड में निकाला गया तथ्य है। सटीक पंक्तियाँ देखने के लिए चुनें।',
    gUnc: 'अनिश्चित', gUncD: 'AI ने ऐसा दावा लिखा जिसे किसी तथ्य से नहीं जोड़ा जा सका। इसे संकेत मानें, निष्कर्ष नहीं।',
    setup: 'आपका ब्रीफ़', tableLabel: 'या अपनी तालिका यहाँ चिपकाएँ (Excel, Sheets, PDF या WhatsApp से)', tableHint: 'सेल कॉपी करें और चिपकाएँ। टैब, कॉमा या स्पेस, सब चलेगा। गड़बड़ भी चलेगा।',
    upload: 'फ़ाइल अपलोड करें', role: 'मैं हूँ', roleWard: 'वार्ड अधिकारी', roleSociety: 'हाउसिंग सोसाइटी', roleSchool: 'स्कूल', roleHealth: 'स्वास्थ्य अधिकारी या PHC डॉक्टर', roleTraffic: 'ट्रैफ़िक पुलिस', roleSite: 'निर्माण या उद्योग साइट मैनेजर', roleCitizen: 'अभिभावक या निवासी', roleWorker: 'डिलीवरी राइडर, गिग या बाहर काम करने वाले',
    langs: 'सलाह की भाषाएँ (अधिकतम 4)', level: 'पढ़ने का स्तर', levelStd: 'सामान्य', levelSimple: 'सरल, लगभग 10 वर्ष',
    code: 'एक्सेस कोड', compare: 'इस डिवाइस पर मेरे पिछले ब्रीफ़ से तुलना करें', go: 'ब्रीफ़ लिखें',
    expTitle: 'आज बाहर जाना', expHint: 'केवल अनुमान, चिकित्सा सलाह नहीं। आपकी लोकेशन का मॉडल PM2.5 और US EPA की साँस दरें।',
    expWho: 'कौन', expDoing: 'क्या कर रहे', expMinutes: 'मिनट', history: 'इस डिवाइस पर पिछले ब्रीफ़', clear: 'इतिहास मिटाएँ',
    foot: 'संख्याएँ आपकी तालिका से कोड में निकाली जाती हैं। Gemini शब्द लिखता है और संख्याओं का हवाला देता है। लोकेशन डेटा: Open-Meteo से CAMS मॉडल, स्टेशन रीडिंग नहीं।',
    stSend: '{n} पंक्तियाँ भेजीं', stParse: '{rows} पंक्तियाँ पढ़ीं, {flagged} संदिग्ध', stFacts: '{facts} तथ्य और {alerts} अलर्ट निकाले',
    stWrite: 'Gemini ब्रीफ़ लिख रहा है', stVerify: '{t} में से {v} दावे तथ्यों से जुड़े', stWait: 'प्रतीक्षा',
    errTable: 'पहले तालिका चिपकाएँ या अपलोड करें, या नमूना आज़माएँ।', errLangs: 'कम से कम एक सलाह भाषा चुनें।',
    loadedSample: 'नमूना लोड हुआ। बताएँ आप कौन हैं, फिर ब्रीफ़ लिखें।',
    locAsk: 'ब्राउज़र से आपकी लोकेशन माँग रहे हैं। हम इसे लगभग 1 किमी तक गोल करते हैं और कभी नहीं सहेजते।',
    locFetching: '{place} की मॉडल हवा ला रहे हैं...', locLoaded: '{place} की {n} घंटे की मॉडल हवा लोड हुई।',
    modelled: 'मॉडल डेटा (Open-Meteo से CAMS), स्टेशन रीडिंग नहीं।', noCity: 'कोई जगह नहीं मिली। वर्तनी जाँचें और फिर कोशिश करें।',
    alerts: 'अलर्ट', showAll: 'सभी {n} देखें', worst: 'सबसे खराब स्थान', limitTimes: '× 24 घंटे की सीमा',
    summary: 'सारांश', actions: 'आपके लिए कदम', hotspots: 'हॉटस्पॉट', trends: 'रुझान', caveats: 'डेटा की कमियाँ',
    flagged: 'संदिग्ध रीडिंग', note: 'आंतरिक नोट', evidence: 'प्रमाण', uncertain: 'अनिश्चित', traced: '{t} में से {v} दावे आपकी पंक्तियों से जुड़े',
    compareT: 'पिछले ब्रीफ़ के बाद', firstBrief: 'इस डिवाइस पर पहला ब्रीफ़। अगला इससे तुलना करेगा।',
    advisory: 'निवासियों के लिए सलाह', copyWa: 'WhatsApp के लिए कॉपी करें', copied: 'कॉपी हुआ', print: 'प्रिंट',
    children: 'बच्चे', older: 'बुज़ुर्ग', sensitive: 'दमा, हृदय या फेफड़ों की बीमारी, गर्भावस्था', workers: 'बाहर काम करने वाले',
    green: 'पेड़ या हरित पट्टी की माँग करें', greenD: 'ऊपर के तथ्यों से लिखा वार्ड कार्यालय के लिए पत्र का मसौदा। भेजने से पहले खाली जगहें भरें।',
    portal: 'आप इसे केंद्रीय शिकायत पोर्टल (CPGRAMS) पर भी दर्ज कर सकते हैं।', partial: 'AI के उत्तर का कुछ हिस्सा नहीं आया, इसलिए यह ब्रीफ़ अधूरा है।',
    degraded: 'साझा स्टोर उपलब्ध नहीं: अभी सीमाएँ और कैश हर सर्वर पर अलग हैं।', expDose: '{dose} µg PM2.5 साँस में', expRatio: 'बैठे वयस्क की तुलना में {r}× हवा',
    expBand: 'अभी हवा: {band} ({v} µg/m³ PM2.5)', expBest: 'आज के सबसे अच्छे 2 घंटे: {start} से {end} ({v} µg/m³)', expNoBest: 'आज डेटा में कोई साफ़ 2 घंटे का समय नहीं बचा।',
    watch: 'इन पर ध्यान दें', reduce: 'कम साँस लेने के लिए', facts: 'आपकी पंक्तियों से निकाले तथ्य', rows: 'पंक्तियाँ',
    group_child: 'बच्चा, 6 से 10 वर्ष', group_adult: 'वयस्क', group_older: 'बुज़ुर्ग, 71 से 80 वर्ष',
    act_sitting: 'बैठे या इंतज़ार', act_walking: 'पैदल चलना', act_play: 'खेलना', act_sport: 'खेल या दौड़',
    aiUi: 'इंटरफ़ेस का हिंदी अनुवाद AI से किया गया है।', noHistory: 'अभी कोई ब्रीफ़ नहीं।',
  },
};

let current = 'en';

/**
 * Translate a key in the current language, filling {name} slots from vars.
 * @param {string} key
 * @param {Record<string, string | number>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  const text = STRINGS[current][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}

/**
 * Switch the interface language: sets html lang and rewrites every data-i18n element.
 * @param {string} lang 'en' or 'hi'
 * @param {Document} doc
 */
export function setLanguage(lang, doc = document) {
  current = STRINGS[lang] ? lang : 'en';
  doc.documentElement.lang = current;
  for (const node of doc.querySelectorAll('[data-i18n]')) node.textContent = t(node.getAttribute('data-i18n') || '');
}
