// @ts-check

// Shared ISO 3166-1 country-code → English-name lookup for providers whose
// payload carries a country only as a code. location_filter matches on the
// names users write ("United Kingdom", "Germany"), so a bare code never reaches
// it. Names come from Intl.DisplayNames (CLDR via Node's ICU), so a few differ
// from everyday spelling (CZ → "Czechia", TR → "Türkiye") and can shift between
// Node versions — tests should not pin those exact strings.

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/**
 * Resolve a two-letter ISO country code to an English name. Returns '' for
 * anything that isn't a resolvable two-letter code.
 * @param {unknown} code
 */
export function countryName(code) {
  if (typeof code !== 'string' || !/^[A-Za-z]{2}$/.test(code)) return '';
  try {
    const name = regionNames.of(code.toUpperCase());
    return name && name !== code.toUpperCase() ? name : '';
  } catch {
    return '';
  }
}

// ISO 3166-1 alpha-3 → alpha-2. Intl.DisplayNames only accepts alpha-2, and
// some payloads (Gem's `isoCountry`: "USA", "GBR") carry alpha-3. Generated
// from the ISO 3166-1 list (249 assigned codes).
/** @type {Readonly<Record<string, string>>} */
const ALPHA3_TO_ALPHA2 = Object.freeze({
  ABW: 'AW', AFG: 'AF', AGO: 'AO', AIA: 'AI', ALA: 'AX', ALB: 'AL', AND: 'AD', ARE: 'AE',
  ARG: 'AR', ARM: 'AM', ASM: 'AS', ATA: 'AQ', ATF: 'TF', ATG: 'AG', AUS: 'AU', AUT: 'AT',
  AZE: 'AZ', BDI: 'BI', BEL: 'BE', BEN: 'BJ', BES: 'BQ', BFA: 'BF', BGD: 'BD', BGR: 'BG',
  BHR: 'BH', BHS: 'BS', BIH: 'BA', BLM: 'BL', BLR: 'BY', BLZ: 'BZ', BMU: 'BM', BOL: 'BO',
  BRA: 'BR', BRB: 'BB', BRN: 'BN', BTN: 'BT', BVT: 'BV', BWA: 'BW', CAF: 'CF', CAN: 'CA',
  CCK: 'CC', CHE: 'CH', CHL: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COD: 'CD', COG: 'CG',
  COK: 'CK', COL: 'CO', COM: 'KM', CPV: 'CV', CRI: 'CR', CUB: 'CU', CUW: 'CW', CXR: 'CX',
  CYM: 'KY', CYP: 'CY', CZE: 'CZ', DEU: 'DE', DJI: 'DJ', DMA: 'DM', DNK: 'DK', DOM: 'DO',
  DZA: 'DZ', ECU: 'EC', EGY: 'EG', ERI: 'ER', ESH: 'EH', ESP: 'ES', EST: 'EE', ETH: 'ET',
  FIN: 'FI', FJI: 'FJ', FLK: 'FK', FRA: 'FR', FRO: 'FO', FSM: 'FM', GAB: 'GA', GBR: 'GB',
  GEO: 'GE', GGY: 'GG', GHA: 'GH', GIB: 'GI', GIN: 'GN', GLP: 'GP', GMB: 'GM', GNB: 'GW',
  GNQ: 'GQ', GRC: 'GR', GRD: 'GD', GRL: 'GL', GTM: 'GT', GUF: 'GF', GUM: 'GU', GUY: 'GY',
  HKG: 'HK', HMD: 'HM', HND: 'HN', HRV: 'HR', HTI: 'HT', HUN: 'HU', IDN: 'ID', IMN: 'IM',
  IND: 'IN', IOT: 'IO', IRL: 'IE', IRN: 'IR', IRQ: 'IQ', ISL: 'IS', ISR: 'IL', ITA: 'IT',
  JAM: 'JM', JEY: 'JE', JOR: 'JO', JPN: 'JP', KAZ: 'KZ', KEN: 'KE', KGZ: 'KG', KHM: 'KH',
  KIR: 'KI', KNA: 'KN', KOR: 'KR', KWT: 'KW', LAO: 'LA', LBN: 'LB', LBR: 'LR', LBY: 'LY',
  LCA: 'LC', LIE: 'LI', LKA: 'LK', LSO: 'LS', LTU: 'LT', LUX: 'LU', LVA: 'LV', MAC: 'MO',
  MAF: 'MF', MAR: 'MA', MCO: 'MC', MDA: 'MD', MDG: 'MG', MDV: 'MV', MEX: 'MX', MHL: 'MH',
  MKD: 'MK', MLI: 'ML', MLT: 'MT', MMR: 'MM', MNE: 'ME', MNG: 'MN', MNP: 'MP', MOZ: 'MZ',
  MRT: 'MR', MSR: 'MS', MTQ: 'MQ', MUS: 'MU', MWI: 'MW', MYS: 'MY', MYT: 'YT', NAM: 'NA',
  NCL: 'NC', NER: 'NE', NFK: 'NF', NGA: 'NG', NIC: 'NI', NIU: 'NU', NLD: 'NL', NOR: 'NO',
  NPL: 'NP', NRU: 'NR', NZL: 'NZ', OMN: 'OM', PAK: 'PK', PAN: 'PA', PCN: 'PN', PER: 'PE',
  PHL: 'PH', PLW: 'PW', PNG: 'PG', POL: 'PL', PRI: 'PR', PRK: 'KP', PRT: 'PT', PRY: 'PY',
  PSE: 'PS', PYF: 'PF', QAT: 'QA', REU: 'RE', ROU: 'RO', RUS: 'RU', RWA: 'RW', SAU: 'SA',
  SDN: 'SD', SEN: 'SN', SGP: 'SG', SGS: 'GS', SHN: 'SH', SJM: 'SJ', SLB: 'SB', SLE: 'SL',
  SLV: 'SV', SMR: 'SM', SOM: 'SO', SPM: 'PM', SRB: 'RS', SSD: 'SS', STP: 'ST', SUR: 'SR',
  SVK: 'SK', SVN: 'SI', SWE: 'SE', SWZ: 'SZ', SXM: 'SX', SYC: 'SC', SYR: 'SY', TCA: 'TC',
  TCD: 'TD', TGO: 'TG', THA: 'TH', TJK: 'TJ', TKL: 'TK', TKM: 'TM', TLS: 'TL', TON: 'TO',
  TTO: 'TT', TUN: 'TN', TUR: 'TR', TUV: 'TV', TWN: 'TW', TZA: 'TZ', UGA: 'UG', UKR: 'UA',
  UMI: 'UM', URY: 'UY', USA: 'US', UZB: 'UZ', VAT: 'VA', VCT: 'VC', VEN: 'VE', VGB: 'VG',
  VIR: 'VI', VNM: 'VN', VUT: 'VU', WLF: 'WF', WSM: 'WS', YEM: 'YE', ZAF: 'ZA', ZMB: 'ZM',
  ZWE: 'ZW',
});

/**
 * Resolve a two- or three-letter ISO 3166-1 country code to an English name.
 * Returns '' for anything else, including an unassigned code.
 * @param {unknown} code
 */
export function countryNameFromIso(code) {
  if (typeof code !== 'string') return '';
  const c = code.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(c)) return Object.hasOwn(ALPHA3_TO_ALPHA2, c) ? countryName(ALPHA3_TO_ALPHA2[c]) : '';
  return countryName(c);
}

/** Opt-in conditional workplace geography. Missing evidence stays out of Inbox.
 * This is a deterministic admission gate, not a claim that employment/visa or
 * working-hours eligibility has been verified. Country restrictions in provider
 * metadata and explicit eligibility clauses narrow broad remote-region labels.
 */

const fold = (v) => typeof v === 'string' ? v.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[–—−]/g, '-').replace(/\s+/g, ' ').trim() : '';
// Blank after folding too: an entry that folds to nothing would match every posting.
const list = (v) => Array.isArray(v) ? v.filter(x => typeof x === 'string').map(fold).filter(Boolean) : [];
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const word = (s) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(s)}(?![\\p{L}\\p{N}])`, 'u');
const has = (text, values) => values.some(v => word(v).test(text));
const COUNTRY_NAMES = [];
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b), name = countryName(code);
  if (name && name !== 'Unknown Region' && !['EU', 'EZ', 'UN'].includes(code)) COUNTRY_NAMES.push({ code, name: fold(name), match: word(fold(name)) });
}
const COUNTRY_ALIASES = [
  ['US', 'usa'], ['US', 'u.s.'], ['US', 'u.s.a.'], ['US', 'united states of america'],
  ['GB', 'uk'], ['GB', 'u.k.'], ['GB', 'great britain'], ['GB', 'england'],
  ['ES', 'espana'], ['ES', 'esp'],
].map(([code, name]) => ({ code, name, match: word(name) }));
const PROSE_WORD_CODES = new Set(['in', 'as', 'at', 'be', 'is', 'it', 'no', 'so', 'to', 'do', 'me', 'my', 'am']);
const countries = (text, codes = false) => {
  const found = new Set([...COUNTRY_NAMES, ...COUNTRY_ALIASES].filter(c => c.match.test(text)).map(c => c.code));
  if (codes) for (const token of text.split(/[,;/|()\s-]+/)) {
    if (/^[a-z]{2,3}$/.test(token) && !PROSE_WORD_CODES.has(token)) {
      const name = fold(countryNameFromIso(token));
      const c = COUNTRY_NAMES.find(c => c.name === name);
      if (c) found.add(c.code);
    }
  }
  return found;
};
// Config country lists and structured applicant-country fields have an exact
// country token, unlike prose where "in", "it" or "no" are ordinary words.
// Resolve those tokens before applying the prose ambiguity guard.
const countryValue = value => fold(countryNameFromIso(value)) || value;

// CLDR also names subdivisions, aggregates and pseudo-regions. Limit this
// classifier to the existing assigned ISO countries/territories plus Kosovo
// (XK), without changing the workplace policy's shared country vocabulary.
const COUNTRY_KEYWORD_CODES = new Set([...Object.values(ALPHA3_TO_ALPHA2), 'XK']);

/** Exact country name, alias or ISO token in a config list, not a city or region.
 * @param {unknown} value
 */
export function isCountryKeyword(value) {
  const name = countryValue(fold(value));
  return COUNTRY_NAMES.some(country => COUNTRY_KEYWORD_CODES.has(country.code) && country.name === name)
    || COUNTRY_ALIASES.some(country => country.name === name);
}

const REMOTE = /\b(?:remote|work from (?:home|anywhere)|distributed)\b/;
// Mirror scan.mjs's titleSignalsRemote marker: "Remote Sensing" describes a
// discipline, not a work arrangement. The policy must not convert an office
// job outside onsite_locations into an eligible country-wide remote role.
const REMOTE_TITLE = /(?<![a-z])remote(?=$|\s*[^a-z\s]|\s+in\b)/;
// Home-working words in a location. Read only under a policy that allows the United States.
const HOME_WORDS = 'virtual|telework\\w*|telecommut\\w*|anywhere|work(?:ing)? (?:at|from) home|home[ -]?(?:based|office|workers?|teleworkers?)';
const HOME_WORKING = new RegExp(`\\b(?:${HOME_WORDS})\\b|(?:^|[·;] ?)home ?[-,]`);
// Built from the same words, so a marker that reads as remote is always one that can be negated.
const NOT_REMOTE = new RegExp(`\\b(?:non|not|no)[^a-z]*(?:remote|${HOME_WORDS})\\b|\\b(?:remote|${HOME_WORDS})\\b[^a-z]*not available\\b`);
const OFFICE = /\b(?:hybrid|on[ -]?site|in[ -]?office|office[ -]?based)\b/;
const plain = (v) => fold(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
// A location lists its places between middle dots and semicolons.
const places = (location) => location.split(/[·;]/);
// The country reader splits on parentheses, not square brackets, so "[IE]" is written as "(IE)".
const brackets = (text) => text.replace(/\[/g, '(').replace(/\]/g, ')');
const CURRENCY = 'usd|cad|gbp|eur|aud|mxn';
const AMOUNT = `(?:[$£€]\\s?\\d|\\d[\\d,.]*k?\\s?(?:${CURRENCY})\\b|\\b(?:${CURRENCY})\\s?\\d)`;
const NOTICE = 'privacy\\s+(?:notice|policy|statement)';
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section)\b[^>]*>/gi;
const LABEL_PLACE = `(?:${[...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat('us').sort((a, b) => b.length - a.length).map(escape).join('|')})`;
// "Canada-based roles only:" before pay or a privacy notice scopes that line, not who can be hired.
const SCOPE_LABEL = new RegExp(`(^|[.!?\\n])(\\s*(?:<[^>]*>\\s*)*)(?:${LABEL_PLACE}(?:[ -]based)? (?:roles|positions|candidates|applicants|employees|hires)|pay ranges? for ${LABEL_PLACE}) only:(?![^.!?\\n]*\\b(?:not|cannot|can['’]t|unable)\\b)(?=[^.!?\\n]{0,80}?(?:${AMOUNT}|${NOTICE}))`, 'gi');
const withoutScopeLabels = (text) => typeof text === 'string' ? text.replace(BLOCK_TAG, '\n').replace(SCOPE_LABEL, '$1$2') : text;
// "US" in capitals is the country in a sentence whose own text has a lower-case letter. Tags and entities
// are not its text. Folded, "US" would be the pronoun.
const US_CAPITAL = /(?<![\p{L}\p{N}.])US(?![\p{L}\p{N}])/gu;
const withCapitalUs = (text) => typeof text === 'string' ? text.replace(/[^.!?\n]+/g, s => /\p{Ll}/u.test(s.replace(/<[^>]*>|&#?\w+;/g, '')) ? s.replace(US_CAPITAL, 'USA') : s) : text;

function excludedHome(text, homes) {
  return homes.some(h => [
    `(?:excluding|except|excludes|not(?: available| eligible| supported| open)?(?: in| from)?|no candidates from)\\s+${escape(h)}(?![\\p{L}\\p{N}])`,
    `(?<![\\p{L}\\p{N}])${escape(h)}(?:[ -]based)?(?:\\s+(?:candidates|applicants|residents))?\\s+(?:(?:is|are)\\s+)?(?:excluded|not (?:eligible|supported|available|included))`,
  ].some(pattern => new RegExp(pattern, 'u').test(text)));
}

// Country-bearing structured eligibility is authoritative, unlike an office
// address mentioned somewhere in a description. Only known fields are read.
function requirementText(offer) {
  const flatten = (v) => typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(flatten) : v && typeof v === 'object' ? ['name', 'country', 'addressCountry'].flatMap(k => flatten(v[k])) : [];
  return ['applicantLocationRequirements', 'eligibleCountries', 'allowedCountries', 'remoteCountries', 'hiringCountries', 'countriesAllowed'].flatMap(k => flatten(offer?.[k])).map(countryValue).join('; ');
}

/** Only provider geography evidence needed by the same gate after discovery. */
export function captureWorkplaceEvidence(offer) {
  const evidence = {};
  for (const key of ['description', 'workplaceType', 'workplace_type', 'workArrangement', 'isRemote', 'applicantLocationRequirements', 'eligibleCountries', 'allowedCountries', 'remoteCountries', 'hiringCountries', 'countriesAllowed']) {
    if (offer?.[key] !== undefined) evidence[key] = offer[key];
  }
  return evidence;
}

/** Existing malformed user config must not silently disable an admission gate.
 * The web's synchronous config copier mirrors this shape check behind a parity
 * test; scanner/policy execution always stays in the core.
 */
export function workplacePolicyFromConfig(config) {
  const mapping = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  };
  if (!mapping(config)) throw new Error('portals.yml must contain a YAML mapping');
  if (config.location_filter === undefined) return undefined;
  if (!mapping(config.location_filter)) throw new Error('location_filter must be an object');
  const policy = config.location_filter.workplace_policy;
  if (policy !== undefined && !mapping(policy)) throw new Error('location_filter.workplace_policy must be an object');
  return policy;
}

export function buildWorkplacePolicy(policy) {
  if (policy === undefined) return () => ({ eligible: true, reason: 'policy_absent' });
  if (!policy || typeof policy !== 'object' || Array.isArray(policy)) throw new Error('location_filter.workplace_policy must be an object');
  for (const key of ['onsite_locations', 'onsite_countries', 'remote_countries', 'remote_regions', 'home_states']) {
    if (policy[key] != null && !Array.isArray(policy[key])) throw new Error(`workplace_policy.${key} must be a list`);
  }
  const onsite = list(policy.onsite_locations), home = list(policy.remote_countries), regions = list(policy.remote_regions);
  if (!onsite.length || !home.length) throw new Error('workplace_policy requires onsite_locations and remote_countries lists');
  const homeCodes = new Set(home.flatMap(v => [...countries(countryValue(v), true)]));
  if (!homeCodes.size) throw new Error('workplace_policy.remote_countries must name a country or ISO country code');
  const homeStates = onsite.map(compileHomeState);
  const homeStateCodes = Object.freeze([...new Set(list(policy.home_states).map(entry => {
    const state = STATES_AND_DC.find(pair => pair.includes(entry));
    if (!state) throw new Error(`workplace_policy.home_states: "${entry}" is not a US state name or code`);
    return state[1];
  }))]);
  const usHome = homeCodes.has('US');
  const supportsHome = (text) => [...countries(text, true)].some(c => homeCodes.has(c));
  // Description prose uses names/aliases only: ordinary "us", "by" or "id"
  // must not become eligibility evidence. Structured fields still accept ISO.
  const supportsHomeProse = (text) => [...countries(text)].some(c => homeCodes.has(c));
  const timezoneCodes = ['et', 'pt', 'mt', 'ct', 'est', 'pst', 'cst', 'mst', 'edt', 'pdt', 'cdt', 'mdt', 'cet', 'cest', 'gmt', 'utc'];
  const timezoneNames = [...new Set([...regions, ...COUNTRY_NAMES.flatMap(c => [c.name, c.code.toLowerCase()]), ...COUNTRY_ALIASES.map(c => c.name), ...timezoneCodes])].sort((a, b) => b.length - a.length);
  const timezonePhrase = new RegExp(`(?<![\\p{L}\\p{N}])(?:${timezoneNames.map(escape).join('|')})(?:[- ]compatible)? (?:working hours|time[ -]?zones?|hours|overlap)\\b`, 'giu');
  const overlapPhrase = new RegExp(`\\b(?:overlap(?: (?:until|with))?|hours(?: (?:in|until))?) +(?:\\d{1,2}(?::\\d{2})? *(?:am|pm)? *)?(?:${timezoneCodes.join('|')})\\b`, 'giu');
  const geographyText = text => text.replace(timezonePhrase, ' ').replace(overlapPhrase, ' ');
  const geographyNames = [...new Set([...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat(regions, onsite))].sort((a, b) => b.length - a.length);
  const geographyAtom = new RegExp(`^(?:the +)?(${geographyNames.map(escape).join('|')}|[a-z]{2,3})(?![\\p{L}\\p{N}])`, 'u');
  // Read the geography immediately attached to a worker-location phrase, plus
  // genuine country alternatives. Stop before unrelated duties/office mentions.
  const geographyTarget = (text, { allowAmbiguousCodes = true } = {}) => {
    let rest = geographyText(text).trim().replace(/^(?:(?:a|an|any) (?:eligible )?country (?:in|within) |(?:a|an|any) )/, ''), region = false, local = false;
    const codes = new Set();
    while (rest) {
      const match = rest.match(geographyAtom);
      if (!match) break;
      const token = match[1], tail = rest.slice(match[0].length);
      const found = countries(countryValue(token), true);
      if (!found.size && !has(token, regions) && !has(token, onsite)) break;
      // "IT systems" is not Italy. A bounded geographic token such as
      // "based in IT" can resolve the same ISO code without admitting prose.
      if (PROSE_WORD_CODES.has(token) && (!allowAmbiguousCodes || (/^\s+[a-z]/.test(tail) && !/^\s+(?:only|and|or)\b/.test(tail)))) break;
      for (const code of found) codes.add(code);
      region ||= has(token, regions);
      local ||= has(token, onsite);
      const separator = tail.match(/^\s*(?:,|\/|\band\b|\bor\b)\s*/);
      if (!separator) break;
      rest = tail.slice(separator[0].length);
    }
    return { codes, region, local };
  };
  const explicitHomeGeography = text => [...geographyText(text).matchAll(/\b(based|located|reside|live|work remotely|work remote|remote work|remote role|work from home|work)\s+(?:in|from|within)\s+([^.!?;\n]+)/g)]
    .some(match => [...geographyTarget(match[2], { allowAmbiguousCodes: /^(?:based|located|reside|live)$/.test(match[1]) }).codes].some(c => homeCodes.has(c)));
  const supportsHomeGeography = text => supportsHomeProse(geographyText(text)) || explicitHomeGeography(text);
  const restricted = (text, codes = false) => {
    const found = countries(text, codes);
    return found.size > 0 && ![...found].some(c => homeCodes.has(c));
  };
  const onsiteCountries = list(policy.onsite_countries);
  const localCountries = onsiteCountries.length ? onsiteCountries : home;
  const localCodes = new Set(localCountries.flatMap(v => [...countries(countryValue(v), true)]));
  if (!localCodes.size) throw new Error('workplace_policy.onsite_countries must name a country or ISO country code');
  const usLocal = localCodes.has('US');
  const homeAliases = [...home.map(countryValue), ...COUNTRY_NAMES.filter(c => homeCodes.has(c.code)).flatMap(c => PROSE_WORD_CODES.has(c.code.toLowerCase()) ? [c.name] : [c.name, c.code.toLowerCase()]), ...COUNTRY_ALIASES.filter(c => homeCodes.has(c.code)).map(c => c.name)];
  const afterHome = `(?<!(?:${homeAliases.map(escape).join('|')})\\s*(?:and|or|[&/,])\\s*)`;
  const foreignOnly = [...COUNTRY_NAMES, ...COUNTRY_ALIASES].filter(c => !homeCodes.has(c.code)).map(country => {
    const name = escape(country.name);
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${name}(?:[ -]based)?(?:\\s+(?:candidates|applicants|residents))?|${afterHome}${name}(?:[ -]based)?\\s+(?:roles|positions|employees|hires))\\s*[- ]?only\\b`, 'u');
  });
  const gate = (location, title = '', offer = {}) => {
    if (offer.geographyEvidence && typeof offer.geographyEvidence === 'object' && !Array.isArray(offer.geographyEvidence)) offer = { ...offer, ...offer.geographyEvidence };
    const raw = typeof location === 'string' ? location : '';
    const loc = fold(location), heading = fold(title), prose = plain(withoutScopeLabels(offer.description)),
      description = plain(withCapitalUs(withoutScopeLabels(offer.description)));
    const meta = fold(requirementText(offer));
    const workplace = fold(offer.workplaceType || offer.workplace_type || offer.workArrangement);
    const all = `${loc}. ${heading}. ${meta}. ${description}`;
    const fail = reason => ({ eligible: false, reason });
    if (excludedHome(all, homeAliases)) return fail('candidate_country_excluded');
    // An explicitly exclusive foreign country cannot be rescued by a mention
    // of Spain elsewhere in the same field ("Spain / UK only").
    if (foreignOnly.some(pattern => pattern.test(all))) return fail('exclusive_foreign_country');
    if (meta && !supportsHome(meta) && (restricted(meta, true) || !has(meta, regions))) return fail('metadata_country_restricted');
    for (const sentence of description.split(/[.!?\n]+/)) {
      if (!/\bmust (?:be |currently )?(?:based|located|reside|live)\b/.test(sentence)) continue;
      for (const match of sentence.matchAll(/[,;]\s*([^,;]{1,60}?)\s+only\b/g)) {
        const narrower = match[1];
        const explicitCode = /^[a-z]{2,3}$/.test(narrower.trim()) && supportsHome(countryValue(narrower.trim())) && supportsHomeGeography(sentence);
        if (!supportsHomeProse(narrower) && !explicitCode && !has(narrower, regions) && !has(narrower, onsite)) return fail('description_locality_restricted');
      }
    }
    // Narrow eligibility clauses, not arbitrary country mentions. A company
    // describing its London office must not erase a worldwide-remote listing.
    for (const clause of description.split(/[.!?;,\n]+|\s+(?:but|however)\s+/)) {
      if (/\b(?:hybrid|on[ -]?site|in[ -]?office|office[ -]?based) (?:role|position)(?: is)? (?:based |located )?in\b/.test(clause) && !has(clause, onsite)) return fail('description_onsite_restricted');
      if (!/\b(?:only|must (?:be |currently )?(?:based|located|reside|live)|(?:candidates?|applicants?|residents?) (?:must|need to)|restricted to|eligible (?:countries|locations)|hiring (?:only )?in|open (?:only )?to)\b/.test(clause)) continue;
      for (const match of geographyText(clause).matchAll(/\bmust (?:be |currently )?(?:based|located|reside|live) (?:in|within)\s+(.+)/g)) {
        const required = geographyTarget(match[1]);
        if (required.codes.size && ![...required.codes].some(c => homeCodes.has(c))) return fail('description_country_restricted');
        if (!required.codes.size && !required.region && !required.local) return fail('description_location_restricted');
      }
      if (restricted(clause)) return fail('description_country_restricted');
      if (/\bmust (?:be |currently )?(?:based|located|reside|live)(?: in| within)?\b/.test(clause)
        && !supportsHomeGeography(clause) && !has(clause, regions) && !has(clause, onsite)) return fail('description_location_restricted');
      // A mandatory commute elsewhere is also narrower than a remote tag.
      if (/\b(?:hybrid|on[ -]?site|in[ -]?office|office[ -]?based)\b/.test(clause) && !has(clause, onsite)) return fail('description_onsite_restricted');
    }
    const structuredOffice = OFFICE.test(loc) || OFFICE.test(workplace) || OFFICE.test(heading);
    const remote = !structuredOffice && !NOT_REMOTE.test(loc) && !NOT_REMOTE.test(heading)
      && (REMOTE.test(loc) || (usHome && HOME_WORKING.test(loc)) || workplace === 'remote' || offer.isRemote === true || (!workplace && REMOTE_TITLE.test(heading)));
    // Under a US policy a posting marked remote that names a home place is judged as that place first ("Atlanta or Remote").
    if (!remote || (usLocal && has(loc, onsite))) {
      if (!has(loc, onsite)) return fail(loc ? 'onsite_outside_allowed_locations' : 'location_unknown');
      const abroad = (text) => { const found = countries(text, true); return found.size > 0 && ![...found].some(c => localCodes.has(c)); };
      // A home place with its US state written beside it is judged alone, so "Atlanta, GA · London, UK" passes through
      // Atlanta and its "GA" is not Gabon. Without one, the whole location decides.
      const stated = usLocal ? places(loc).flatMap(place => homeStates.map(read => read(place)).filter(text => text !== null)).map(withoutAddressWords) : [];
      if (stated.some(text => !abroad(text)) || !abroad(usLocal ? withoutAddressWords(withoutStateCodes(raw)) : loc)) return { eligible: true, reason: 'onsite_location_allowed' };
      if (!remote) return fail('onsite_country_restricted');
    }
    // Explicit structured countries narrow a covering region. Europe + UK-only
    // never implies Spain. Multiple genuine eligible countries including Spain
    // are allowed. No timezone token is an eligibility signal.
    // Under a US policy a place that names a US state and no foreign country stands for the United States. There a
    // bar or a spaced slash separates places too, and "US:" and "U.S.A" are written as the country reader knows them.
    const geoLoc = geographyText(usHome ? places(raw.replace(/:/g, ' ').replace(US_DOTTED, 'usa')).flatMap(place => {
      const codes = /\p{Ll}/u.test(place);
      return place.split(/\||\s\/\s/).map(part => {
        // A timezone goes first, so the "MT" of "MT working hours" is not Montana. Brackets are read as the
        // country reader writes them, so "Texas [IE]" keeps its country.
        const rest = withoutUsStates(geographyText(part), codes, homeStateCodes.includes('ga'));
        return rest !== null && [...countries(brackets(rest), true)].every(c => homeCodes.has(c)) ? `${rest} united states` : brackets(fold(part));
      });
    }).join(' · ') : loc);
    const locationCountries = countries(geoLoc, true);
    if (locationCountries.size && ![...locationCountries].some(c => homeCodes.has(c))) return fail('remote_country_restricted');
    const remoteDescription = prose.split(/[.!?;\n]+/).some(clause => /\b(?:work remotely|work remote|remote work|remote role|work from home|work from)\b/.test(clause) && supportsHomeGeography(clause));
    const conditionalRegion = prose.split(/[.!?;\n]+/).some(clause => REMOTE.test(clause) && has(clause, regions)
      && /\bwhere (?:we|the company|the employer) (?:have|has) (?:a |an |our )?hiring presence\b/.test(clause));
    if (conditionalRegion && !supportsHome(geoLoc) && !supportsHome(meta) && !explicitHomeGeography(prose)) return fail('remote_eligibility_unconfirmed');
    if (supportsHome(geoLoc) || has(geoLoc, regions) || (meta && (supportsHome(meta) || has(meta, regions))) || remoteDescription) return { eligible: true, reason: 'remote_region_allowed' };
    return fail(loc ? 'remote_eligibility_unconfirmed' : 'location_unknown');
  };
  return Object.assign(gate, { homeStates: homeStateCodes, homeCountryNames: Object.freeze([...new Set(homeAliases)].sort((a, b) => b.length - a.length)) });
}

// USPS state names and codes. scan.mjs builds its always_allow matchers from the same table.
export const USPS_STATES = Object.freeze([
  Object.freeze(['alabama', 'al']),
  Object.freeze(['alaska', 'ak']),
  Object.freeze(['arizona', 'az']),
  Object.freeze(['arkansas', 'ar']),
  Object.freeze(['california', 'ca']),
  Object.freeze(['colorado', 'co']),
  Object.freeze(['connecticut', 'ct']),
  Object.freeze(['delaware', 'de']),
  Object.freeze(['florida', 'fl']),
  Object.freeze(['georgia', 'ga']),
  Object.freeze(['hawaii', 'hi']),
  Object.freeze(['idaho', 'id']),
  Object.freeze(['illinois', 'il']),
  Object.freeze(['indiana', 'in']),
  Object.freeze(['iowa', 'ia']),
  Object.freeze(['kansas', 'ks']),
  Object.freeze(['kentucky', 'ky']),
  Object.freeze(['louisiana', 'la']),
  Object.freeze(['maine', 'me']),
  Object.freeze(['maryland', 'md']),
  Object.freeze(['massachusetts', 'ma']),
  Object.freeze(['michigan', 'mi']),
  Object.freeze(['minnesota', 'mn']),
  Object.freeze(['mississippi', 'ms']),
  Object.freeze(['missouri', 'mo']),
  Object.freeze(['montana', 'mt']),
  Object.freeze(['nebraska', 'ne']),
  Object.freeze(['nevada', 'nv']),
  Object.freeze(['new hampshire', 'nh']),
  Object.freeze(['new jersey', 'nj']),
  Object.freeze(['new mexico', 'nm']),
  Object.freeze(['new york', 'ny']),
  Object.freeze(['north carolina', 'nc']),
  Object.freeze(['north dakota', 'nd']),
  Object.freeze(['ohio', 'oh']),
  Object.freeze(['oklahoma', 'ok']),
  Object.freeze(['oregon', 'or']),
  Object.freeze(['pennsylvania', 'pa']),
  Object.freeze(['rhode island', 'ri']),
  Object.freeze(['south carolina', 'sc']),
  Object.freeze(['south dakota', 'sd']),
  Object.freeze(['tennessee', 'tn']),
  Object.freeze(['texas', 'tx']),
  Object.freeze(['utah', 'ut']),
  Object.freeze(['vermont', 'vt']),
  Object.freeze(['virginia', 'va']),
  Object.freeze(['washington', 'wa']),
  Object.freeze(['west virginia', 'wv']),
  Object.freeze(['wisconsin', 'wi']),
  Object.freeze(['wyoming', 'wy']),
]);

const STATES_AND_DC = [...USPS_STATES, ['district of columbia', 'dc']];
const US_STATE_PATTERN = USPS_STATES.flat().map(escape).join('|');
const US_STATE_CODE_PATTERN = USPS_STATES.map(([, abbr]) => abbr).join('|');
// A street address ends at a slash, bar, bracket or spaced dash; what follows may name the country.
const ADDRESS_HEAD = /^.*?(?=\s-\s|[/|([]|$)/;
const TWO_LETTER_WORD = /(?<![\p{L}\p{N}])\p{L}{2}(?![\p{L}\p{N}])/gu;

/** A reader for one onsite location name: given a folded place, the place with
 * its US state taken out, or null when no state is written directly beside
 * the name. Two forms count: the state right after the name ("Chicago, IL",
 * "Atlanta GA", "Albuquerque, New Mexico") and a code right before it, when a
 * street address follows or nothing does ("GA-ATLANTA, 740 W PEACHTREE ST NW";
 * the address's own two-letter words are taken out too, since its "ST" is not
 * a country). A state anywhere else is left alone: "Vancouver, BC, CA" and
 * "CA-BC-Richmond" keep their country. The state is only removed, never read
 * as the United States, so whatever country the place still names decides.
 */
function compileHomeState(home) {
  const name = escape(home);
  // A state ends its place part: a word after it means it is not one ("Dublin, Co Dublin" is a county, "Dublin or London" a word).
  const after = new RegExp(`((?<![\\p{L}\\p{N}])${name})(?:\\s*,\\s*|\\s+)(?:${US_STATE_PATTERN})(?![\\p{L}\\p{N}])(?!\\.?\\s*\\p{L})`, 'u');
  const before = new RegExp(`^(\\s*)(?:(?:${US_STATE_CODE_PATTERN})-|(?:${US_SPACED_STATE_CODE_PATTERN}) )(?=${name}(?![\\p{L}\\p{N}]))`, 'u');
  return (place) => {
    if (after.test(place)) return brackets(place.replace(after, '$1'));
    const parts = place.split(',');
    if (!before.test(place) || (parts.length > 1 && !/\d/.test(parts[1]))) return null;
    return brackets(parts.map((part, i) => (i === 0 ? part.replace(before, '$1') : i === 1 ? part.replace(ADDRESS_HEAD, head => head.replace(TWO_LETTER_WORD, ' ')) : part)).join(','));
  };
}

// CA, CO, DE, IL and IN are also Canada, Colombia, Germany, Israel and India, and boards write "Remote, CA" for both.
const AMBIGUOUS_STATE_CODES = ['ca', 'co', 'de', 'il', 'in'];
// A code that is also a country needs the hyphen: "CA Richmond" is Canada's.
const US_SPACED_STATE_CODE_PATTERN = USPS_STATES.map(([, abbr]) => abbr).filter(abbr => !AMBIGUOUS_STATE_CODES.includes(abbr)).join('|');
// HI, ME, OH, OK and OR are also words in capitals ("Remote (OK to work anywhere)"), so a lower-case word after one makes it a word.
// The District of Columbia counts here as a state does.
const US_STATE_CODE = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:HI|ME|OH|OK|OR)(?!\\s+\\p{Ll})|DC|${USPS_STATES.map(([, abbr]) => abbr).filter(abbr => ![...AMBIGUOUS_STATE_CODES, 'hi', 'me', 'oh', 'ok', 'or'].includes(abbr)).join('|').toUpperCase()})(?![\\p{L}\\p{N}])`, 'gu');
// Georgia is left out: alone it is the country.
const US_STATE_NAME = new RegExp(`(?<![\\p{L}\\p{N}])(?:district of columbia|${USPS_STATES.map(([name]) => name).filter(name => name !== 'georgia').join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const GEORGIA_CODE = /(?<![\p{L}\p{N}])GA(?!\p{L})/u;
const AMBIGUOUS_STATE_CODE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${AMBIGUOUS_STATE_CODES.join('|').toUpperCase()})(?![\\p{L}\\p{N}])`, 'gu');
// A capital two-letter code on either side that is not a state, as in "Delaware, ON, CA". A state beside it
// is a list of states ("CA, NY, TX", "CA, DC"). DC is a state beside every code but CO, where it is Bogota's
// district ("Bogota, DC, CO", Workday's "CO-DC-Bogota").
const CODE_BEFORE = /(?<![\p{L}\p{N}])([A-Z]{2})\s*[,-]\s*$/u;
const CODE_AFTER = /^\s*[,-]\s*([A-Z]{2})(?![\p{L}\p{N}])/u;
const STATE_ABBRS = new Set(USPS_STATES.map(([, abbr]) => abbr.toUpperCase()));
const foreignCode = (pattern, text, code) => { const beside = pattern.exec(text)?.[1]; return beside !== undefined && !STATE_ABBRS.has(beside) && (beside !== 'DC' || code === 'CO'); };
// "U.S" and "U.S.A" without the last dot, which the aliases "u.s." and "u.s.a." do not match.
const US_DOTTED = /(?<![\p{L}\p{N}.])u\.s(?:\.a)?(?![\p{L}\p{N}.])/giu;
// A street number, then the words up to the next comma, slash, bar, bracket or spaced dash.
const ADDRESS_RUN = /(?<![\p{L}\p{N}])\d[\p{L}\p{N}]*\s.*?(?=\s-\s|[,/|()[\]·;]|$)/gu;

/** A raw location with its capital US state codes other than CA, CO, DE, IL and IN taken out, folded. A place written all in capitals keeps
 * them, because nothing there tells "OR" the state from "or" the word.
 * @param {string} location
 */
function withoutStateCodes(location) {
  return places(location).map(place => fold(/\p{Ll}/u.test(place) ? place.replace(US_STATE_CODE, ' ') : place)).join(' · ');
}

/** A raw place with its US states taken out, folded, or null when it names none. Georgia counts where its
 * code GA stands in the same place ("GEORGIA - VIRTUAL - GA01"). CA, CO, DE, IL and IN count only in a place
 * that also names a state by its full name or by another code ("Colorado Springs, CO", "CA, NY, TX"), and not
 * next to a capital code that is no state, where they are the country ("Delaware, ON, CA", "Bogota, DC, CO").
 * @param {string} place
 * @param {boolean} codes whether capital state codes are read; false where the place is written all in capitals
 * @param {boolean} georgia whether Georgia is a home state, so its name is the state wherever it stands
 */
function withoutUsStates(place, codes, georgia = false) {
  const named = (georgia || GEORGIA_CODE.test(place) ? place.replace(/georgia/gi, ' ') : place).replace(US_STATE_NAME, ' ');
  if ((codes ? named.replace(US_STATE_CODE, ' ') : named) === place) return null;
  // Judged before the other codes go, so the code next to an ambiguous one is still there to see.
  const sure = named.replace(AMBIGUOUS_STATE_CODE, (code, at) => (foreignCode(CODE_BEFORE, named.slice(0, at), code) || foreignCode(CODE_AFTER, named.slice(at + 2), code) ? code : ' '));
  // Between states "and" is the word, not Andorra's three-letter code.
  return fold((codes ? sure.replace(US_STATE_CODE, ' ') : sure).replace(/\band\b/gi, ' '));
}

/** A folded place without the two-letter words of its street addresses: the "St" of "999 18th St" and the
 * "SE" of "200 Main Parkway SE" are not countries. A number with one word after it is left alone ("30339 IE").
 * @param {string} text
 */
function withoutAddressWords(text) {
  return brackets(text).replace(ADDRESS_RUN, run => run.trim().split(/\s+/).length > 2 ? run.replace(TWO_LETTER_WORD, ' ') : run);
}
