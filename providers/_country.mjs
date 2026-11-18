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
// England and Mexico are not read after "new" where this pattern is used: New England is a US region and New Mexico a state.
const countryPattern = (name) => `${name === 'england' || name === 'mexico' ? '(?<!new )' : ''}${escape(name)}`;
// Spellings boards use that the CLDR names lack ("Türkiye", "Czechia", "Hong Kong SAR China").
const COUNTRY_ALIASES = [
  ['US', 'usa'], ['US', 'u.s.'], ['US', 'u.s.a.'], ['US', 'united states of america'],
  ['GB', 'uk'], ['GB', 'u.k.'], ['GB', 'great britain'], ['GB', 'england'],
  ['ES', 'espana'], ['ES', 'esp'],
  ['TR', 'turkey'], ['CZ', 'czech republic'], ['HK', 'hong kong'], ['MO', 'macau'], ['MO', 'macao'], ['CI', 'ivory coast'],
  ['MM', 'burma'], ['MM', 'myanmar'], ['SZ', 'swaziland'], ['TL', 'east timor'], ['CD', 'democratic republic of the congo'],
].map(([code, name]) => ({ code, name, match: new RegExp(`(?<![\\p{L}\\p{N}])${countryPattern(name)}(?![\\p{L}\\p{N}])`, 'u') }));
const PROSE_WORD_CODES = new Set(['in', 'as', 'at', 'be', 'is', 'it', 'no', 'so', 'to', 'do', 'me', 'my', 'am']);
// Read only where codes are: in prose "DRC" is a design-rule check and "UAE Pass" a sign-in service.
const COUNTRY_ACRONYMS = new Map([['uae', 'AE'], ['drc', 'CD']]);
const countries = (text, codes = false) => {
  const found = new Set([...COUNTRY_NAMES, ...COUNTRY_ALIASES].filter(c => c.match.test(text)).map(c => c.code));
  if (codes) for (const token of text.split(/[,;/|()\s-]+/)) {
    if (/^[a-z]{2,3}$/.test(token) && !PROSE_WORD_CODES.has(token)) {
      const name = fold(countryNameFromIso(token));
      const code = COUNTRY_ACRONYMS.get(token) ?? COUNTRY_NAMES.find(c => c.name === name)?.code;
      if (code) found.add(code);
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
const HOME_WORDS = 'virtual|telework\\w*|telecommut\\w*|anywhere|wfh|work(?:ing)? (?:at|from) home|home[ -]?(?:based|office|workers?|teleworkers?)';
const HOME_WORKING = new RegExp(`\\b(?:${HOME_WORDS})\\b|(?:^|[·;] ?)home ?[-,]`);
// Built from the same words, so a HOME_WORDS marker that reads as remote is one that can be negated.
const NOT_REMOTE = new RegExp(`\\b(?:non|not|no)[^a-z]*(?:remote|${HOME_WORDS})\\b|\\b(?:remote|${HOME_WORDS})\\b[^a-z]*(?:(?:is|are) )?not available\\b`);
const OFFICE = /\b(?:hybrid|on[ -]?site|in[ -]?office|office[ -]?based)\b/;
const plain = (v) => fold(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
// A location lists its places between middle dots and semicolons.
const places = (location) => location.split(/[·;]/);
// The country reader splits on parentheses, not square brackets, so "[IE]" is written as "(IE)".
const brackets = (text) => text.replace(/\[/g, '(').replace(/\]/g, ')');
const CURRENCY = 'usd|cad|gbp|eur|aud|mxn';
const AMOUNT = `(?:[$£€]\\s?\\d|\\d[\\d,.]*k?\\s?(?:${CURRENCY})\\b|\\b(?:${CURRENCY})\\s?\\d)`;
const NOTICE = 'privacy\\s+(?:notice|policy|statement)';
// A block tag becomes a newline, which ends a sentence here: a label in one list item must not reach the next.
const BLOCK_TAG = /<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section)\b[^<>]*>/gi;
const LABEL_PLACE = `(?:${[...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat('us').sort((a, b) => b.length - a.length).map(escape).join('|')})`;
// "Canada-based roles only:" before pay or a privacy notice scopes that line, not who can be hired. The pay or the
// notice must start within 80 characters, about one line: further on it is another statement's.
const SCOPE_LABEL = new RegExp(`(^|[.!?\\n])(\\s*(?:<[^<>]*>\\s*)*)(?:${LABEL_PLACE}(?:[ -]based)? (?:roles|positions|candidates|applicants|employees|hires)|pay ranges? for ${LABEL_PLACE}) only(?:\\s*<[^<>]*>)*\\s*:(?![^.!?\\n]*\\b(?:no|not|cannot|can['’]t|unable|(?:limited|restricted) to)\\b)(?=[^.!?\\n]{0,80}?(?:${AMOUNT}|${NOTICE}))`, 'gi');
const withoutScopeLabels = (text) => typeof text === 'string' ? text.replace(BLOCK_TAG, '\n').replace(SCOPE_LABEL, '$1$2') : text;
// "US" in capitals is the country in a sentence whose own text has a lower-case letter. Tags and entities
// are not its text. Folded, "US" would be the pronoun.
const US_CAPITAL = /(?<![\p{L}\p{N}.])(?<!\b(?:ABOUT|JOIN|WHY|CONTACT|WITH) )US(?![\p{L}\p{N}])/gu;
// A tag is part of its sentence whole: the dot in an attribute does not end one.
const HTML_SENTENCE = /(?:<[^<>]*>|[^.!?\n])+/g;
// "U.S." and "U.S.A." with their dots would end a sentence at each one. The last dot stays a full stop before a capital or a tag.
const US_DOTTED_CAPITAL = /(?<![\p{L}\p{N}.])U\.S\.(?:A\.)?(?![\p{L}\p{N}])(\s*(?![Oo][Nn][Ll][Yy]\b)(?:\p{Lu}|<))?/gu;
const withCapitalUs = (text) => typeof text === 'string' ? text.replace(US_DOTTED_CAPITAL, (_, end = '') => `USA${end && '.'}${end}`).replace(HTML_SENTENCE, s => s.split(/<[^<>]*>|&#?\w+;/).some(t => /\p{Ll}/u.test(t)) ? s.replace(US_CAPITAL, 'USA') : s) : text;

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

/** The workplace gate for one policy.
 * @param {object} [policy] `location_filter.workplace_policy`; a malformed one throws
 * @returns {Function & { homeStates?: readonly string[], homePlaces?: readonly string[], homeCountryNames?: readonly string[], geographyText?: (part: string) => string }}
 *   `gate(location, title, offer)`, which answers `{ eligible, reason }`. It carries four properties for
 *   locationVerdict; a gate built with no policy carries none of them
 */
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
  const homeStateCodes = Object.freeze([...new Set((policy.home_states ?? []).map(entry => {
    const state = STATES_AND_DC.find(pair => pair.includes(fold(entry)));
    if (!state) throw new Error(`workplace_policy.home_states: ${JSON.stringify(entry)} is not a US state name or code`);
    return state[1];
  }))]);
  const usHome = homeCodes.has('US');
  if (homeStateCodes.length && !usHome) throw new Error('workplace_policy.home_states names US states, and remote_countries does not include the United States, so it would do nothing');
  const supportsHome = (text) => [...countries(text, true)].some(c => homeCodes.has(c));
  // Description prose uses names/aliases only: ordinary "us", "by" or "id"
  // must not become eligibility evidence. Structured fields still accept ISO.
  const supportsHomeProse = (text) => [...countries(text)].some(c => homeCodes.has(c));
  const timezoneCodes = ['et', 'pt', 'mt', 'ct', 'est', 'pst', 'cst', 'mst', 'edt', 'pdt', 'cdt', 'mdt', 'cet', 'cest', 'gmt', 'utc'];
  const timezoneNames = [...new Set([...regions, ...COUNTRY_NAMES.flatMap(c => [c.name, c.code.toLowerCase()]), ...COUNTRY_ALIASES.map(c => c.name), ...timezoneCodes])].sort((a, b) => b.length - a.length);
  const timezonePhrase = new RegExp(`(?<![\\p{L}\\p{N}])(?:${timezoneNames.map(escape).join('|')})(?:[- ]compatible)? (?:working hours|time[ -]?zones?|hours|overlap)\\b`, 'giu');
  const overlapPhrase = new RegExp(`\\b(?:overlap(?: (?:until|with))?|hours(?: (?:in|until))?) +(?:\\d{1,2}(?::\\d{2})? *(?:am|pm)? *)?(?:${timezoneCodes.join('|')})\\b`, 'giu');
  const withoutTimezonePhrases = text => text.replace(timezonePhrase, ' ').replace(overlapPhrase, ' ');
  // Strips a US zone abbreviation whether or not the part names a state. A state is read from the result, where
  // "(EST)" or a closing "- PST" is its timezone, not Estonia.
  const placeText = part => withoutTimezonePhrases(part).replace(US_ZONE, ' ');
  const geographyNames = [...new Set([...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat(regions, onsite))].sort((a, b) => b.length - a.length);
  const geographyAtom = new RegExp(`^(?:the +)?(${geographyNames.map(escape).join('|')}|[a-z]{2,3})(?![\\p{L}\\p{N}])`, 'u');
  // Read the geography immediately attached to a worker-location phrase, plus
  // genuine country alternatives. Stop before unrelated duties/office mentions.
  const geographyTarget = (text, { allowAmbiguousCodes = true } = {}) => {
    // "the contiguous United States" and "the lower 48 states" are the United States.
    let rest = withoutTimezonePhrases(text).trim().replace(/^(?:(?:a|an|any) (?:eligible )?country (?:in|within) |(?:a|an|any) )/, '')
      .replace(/^(the +)?(?:contiguous|continental) +(?=united states|usa?\b)/, '$1').replace(/^(?:the +)?lower 48(?: +states)?/, 'united states'), region = false, local = false;
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
  const explicitHomeGeography = text => [...withoutTimezonePhrases(text).matchAll(/\b(based|located|reside|live|work remotely|work remote|remote work|remote role|work from home|work)\s+(?:in|from|within)\s+([^.!?;\n]+)/g)]
    .some(match => [...geographyTarget(match[2], { allowAmbiguousCodes: /^(?:based|located|reside|live)$/.test(match[1]) }).codes].some(c => homeCodes.has(c)));
  const supportsHomeGeography = text => supportsHomeProse(withoutTimezonePhrases(text)) || explicitHomeGeography(text);
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
  const afterHome = `(?<!(?<![\\p{L}\\p{N}])(?:${homeAliases.map(escape).join('|')})\\s*(?:and|or|[&/,])\\s*)`;
  const listSeparator = '\\s*(?:,\\s*(?:and|or)\\b|and\\b|or\\b|[&/,])\\s*';
  const listCountry = `(?:the\\s+)?(?:${[...new Set([...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat(homeAliases, 'us'))].map(escape).sort((a, b) => b.length - a.length).join('|')})(?![\\p{L}\\p{N}])`;
  const foreignOnly = [...COUNTRY_NAMES, ...COUNTRY_ALIASES].filter(c => !homeCodes.has(c.code)).map(country => {
    const name = countryPattern(country.name);
    return new RegExp(`(?<![\\p{L}\\p{N}])(?:${name}(?:[ -]based)?(?:\\s+(?:candidates|applicants|residents))?|${afterHome}${name}(?:[ -]based)?\\s+(?:roles|positions|employees|hires))\\s*[- ]?only\\b`, 'u');
  });
  // A description's country list before one of the four nouns that names a home country stands for the home country
  // ("USA, Canada and Mexico roles only"), as the two-country form does through afterHome.
  const listBeforeNoun = new RegExp(`(?<![\\p{L}\\p{N}])${listCountry}(?:${listSeparator}${listCountry})+(?=(?:[ -]based)?\\s+(?:roles|positions|employees|hires)\\s*[- ]?only\\b)`, 'gu');
  const withHomeList = text => text.replace(listBeforeNoun, list => has(list, homeAliases) ? homeAliases[0] : list);
  const gate = (location, title = '', offer = {}) => {
    if (offer.geographyEvidence && typeof offer.geographyEvidence === 'object' && !Array.isArray(offer.geographyEvidence)) offer = { ...offer, ...offer.geographyEvidence };
    const raw = typeof location === 'string' ? location : '';
    // prose has no capital US read as the country, so "US" never confirms a remote role. written has it, for exclusions.
    // restrictions also reads Georgia and a country list as home, for the clause checks.
    const unlabelled = withoutScopeLabels(offer.description);
    const capital = withCapitalUs(unlabelled);
    const loc = fold(location), heading = fold(title), prose = plain(unlabelled), written = capital === unlabelled ? prose : plain(capital);
    const context = usHome && (loc.includes('georgia') || written.includes('georgia')) ? georgiaContext(heading, written) : null;
    const parts = usHome ? stateParts(raw, homeAliases, onsite, context, placeText) : [];
    // A home state Georgia stands for the home country only in a sentence with no other country and no exclusion,
    // in a posting that names no Georgian place.
    const georgiaIsHome = usHome && homeStateCodes.includes('ga') && context !== 'country' && !parts.some(one => one.georgia === 'country') && !GEORGIAN_PLACE.test(loc);
    const otherCountry = sentence => [...countries(sentence.replace(US_STATE_NAME, ' '))].some(code => code !== 'GE' && !homeCodes.has(code));
    const withHomeGeorgia = text => georgiaIsHome && text.includes('georgia') ? text.replace(/[^.!?\n]+/g, sentence => sentence.search(GEORGIA_WORD) < 0 || otherCountry(sentence) || GEORGIA_EXCLUSION.test(sentence)
      || GEORGIA_ABROAD.test(sentence) ? sentence : sentence.replace(GEORGIA_WORD, 'united states')) : text;
    // A capital US is a country in every clause only where the United States is home. Under another home country it is one before "only" alone.
    const restrictions = withHomeGeorgia(withHomeList(written)), description = usHome ? restrictions : withHomeList(prose);
    const meta = fold(requirementText(offer));
    const workplace = fold(offer.workplaceType || offer.workplace_type || offer.workArrangement);
    const fail = reason => ({ eligible: false, reason });
    // Read before Georgia is written as the home country: "not available in Georgia" must not become "not available in the United States".
    if (excludedHome(`${loc}. ${heading}. ${meta}. ${written}`, homeAliases)) return fail('candidate_country_excluded');
    // An explicitly exclusive foreign country cannot be rescued by a mention
    // of Spain elsewhere in the same field ("Spain / UK only").
    const exclusive = `${withHomeGeorgia(loc)}. ${heading}. ${meta}. ${restrictions}`;
    if (foreignOnly.some(pattern => pattern.test(exclusive))) return fail('exclusive_foreign_country');
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
      for (const match of withoutTimezonePhrases(clause).matchAll(/\bmust (?:be |currently )?(?:based|located|reside|live) (?:in|within)\s+(.+)/g)) {
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
    // A negation covers its own place: "Remote - United States · Remote not available - London, UK" is still remote.
    const marked = (place) => !NOT_REMOTE.test(place) && (REMOTE.test(place) || (usHome && HOME_WORKING.test(place.trim())));
    const remote = !structuredOffice && !NOT_REMOTE.test(heading)
      && (loc.split(/[·;|]/).some(marked) || (!NOT_REMOTE.test(loc) && (workplace === 'remote' || offer.isRemote === true || (!workplace && REMOTE_TITLE.test(heading)))));
    // Under a US policy a posting marked remote that names a home place is judged as that place first ("Atlanta or Remote").
    if (!remote || (usLocal && has(loc, onsite))) {
      if (!has(loc, onsite)) return fail(loc ? 'onsite_outside_allowed_locations' : 'location_unknown');
      const abroad = (text) => { const found = countries(text, true); return found.size > 0 && ![...found].some(c => localCodes.has(c)); };
      // A home place with its US state written beside it is judged alone, so "Atlanta, GA · London, UK" passes through
      // Atlanta and its "GA" is not Gabon. Without one, the whole location decides.
      const stated = usLocal ? places(loc).flatMap(place => homeStates.map(read => read(place)).filter(text => text !== null)).map(text => withoutAddressWords(placeText(text))) : [];
      if (stated.some(text => !abroad(text)) || !abroad(usLocal ? withoutAddressWords(withoutStateCodes(raw)) : loc)) return { eligible: true, reason: 'onsite_location_allowed' };
      if (!remote) return fail('onsite_country_restricted');
    }
    // Explicit structured countries narrow a covering region. Europe + UK-only
    // never implies Spain. Multiple genuine eligible countries including Spain
    // are allowed. No timezone token is an eligibility signal.
    // Under a US policy a place that names a US state and no foreign country stands for the United States. There a
    // bar or a spaced slash separates places too, and "US:" and "U.S.A" are written as the country reader knows them.
    const geoLoc = withoutTimezonePhrases(usHome ? parts.map(({ part, place, codes, georgia }) => {
      // A part whose Georgia is the country names no US state, whatever code stands beside it ("Tbilisi, Georgia (GA)").
      // Brackets are read as the country reader writes them, so "Texas [IE]" keeps its country.
      const rest = georgia === 'country' ? null : withoutUsStates(place, codes, homeStateCodes.includes('ga') && georgia === 'state');
      return rest !== null && [...countries(brackets(rest), true)].every(c => homeCodes.has(c)) ? `${rest} united states` : brackets(fold(part));
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
  // Carried for locationVerdict, so both read a place the same way.
  const carried = { geographyText: placeText, homePlaces: Object.freeze(onsite), homeStates: homeStateCodes, homeCountryNames: Object.freeze([...new Set(homeAliases)].sort((a, b) => b.length - a.length)) };
  return Object.defineProperties(gate, Object.fromEntries(Object.entries(carried).map(([key, value]) => [key, { value, enumerable: true }])));
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
// "West Virginia" does not name Virginia, and "Washington, DC" does not name the state Washington.
const STATE_NAME_MATCH = new Map(STATES_AND_DC.map(([name]) => [name, new RegExp(`${name === 'virginia' ? '(?<!west )' : ''}${word(name).source}${name === 'washington' ? '(?!,? *d\\.? ?c\\b)' : ''}`, 'u')]));
const US_STATE_PATTERN = USPS_STATES.flat().map(escape).join('|');
const US_STATE_CODE_PATTERN = USPS_STATES.map(([, abbr]) => abbr).join('|');
// A street address ends at a slash, bar, bracket or spaced dash; what follows may name the country.
const ADDRESS_HEAD = /^.*?(?=\s-\s|[/|([]|$)/;
const TWO_LETTER_WORD = /(?<![\p{L}\p{N}])\p{L}{2}(?![\p{L}\p{N}])/gu;

/** A reader for one onsite location name: given a folded place, the place with
 * its US state taken out, or null when no state is written directly beside
 * the name. Two forms count: the state right after the name ("Chicago, IL",
 * "Atlanta GA", "Albuquerque, New Mexico") and a code right before it, with a
 * hyphen, or with a space unless the code is CA, CO, DE, IL or IN, when a
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
// Before a home place these five need the hyphen: "CA Richmond" is Canada's.
const AMBIGUOUS_STATE_CODES = ['ca', 'co', 'de', 'il', 'in'];
const US_SPACED_STATE_CODE_PATTERN = USPS_STATES.map(([, abbr]) => abbr).filter(abbr => !AMBIGUOUS_STATE_CODES.includes(abbr)).join('|');
// HI, ME, OH, OK and OR are also words in capitals ("Remote (OK to work anywhere)"), so a lower-case word after one makes it a word.
// The District of Columbia counts here as a state does.
const US_STATE_CODE = new RegExp(`(?<![\\p{L}\\p{N}])(?:(?:HI|ME|OH|OK|OR)(?!\\s+\\p{Ll})|DC|${USPS_STATES.map(([, abbr]) => abbr).filter(abbr => ![...AMBIGUOUS_STATE_CODES, 'hi', 'me', 'oh', 'ok', 'or'].includes(abbr)).join('|').toUpperCase()})(?![\\p{L}\\p{N}])`, 'gu');
// Georgia is left out: alone it is the country.
const US_STATE_NAME = new RegExp(`(?<![\\p{L}\\p{N}])(?:district of columbia|${USPS_STATES.map(([name]) => name).filter(name => name !== 'georgia').join('|')})(?![\\p{L}\\p{N}])`, 'giu');
const GEORGIA_CODE = /(?<![\p{L}\p{N}])GA(?!\p{L})/u;
const GEORGIA_WORD = /(?<![\p{L}\p{N}])georgia(?![\p{L}\p{N}])/giu;
// CT and MT are left out: they are state codes.
const ZONE = '(?:E[SD]?T|C[SD]T|M[SD]T|P[SD]?T)', ZONES = `${ZONE}(?:\\s*/\\s*${ZONE})*`;
const US_ZONE = new RegExp(`\\(\\s*${ZONES}\\s*\\)|[-,]\\s*${ZONES}\\s*$`, 'gi');
const AMBIGUOUS_STATE_CODE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${AMBIGUOUS_STATE_CODES.join('|').toUpperCase()})(?![\\p{L}\\p{N}])`, 'gu');
// A capital two-letter code on either side that is not a state, as in "Delaware, ON, CA". A state beside it
// is a list of states ("CA, NY, TX", "CA, DC"). DC is a state beside every code but CO, where it is Bogota's
// district ("Bogota, DC, CO", Workday's "CO-DC-Bogota").
const CODE_BEFORE = /(?<![\p{L}\p{N}])([A-Z]{2})\s*[,-]\s*$/u;
const CODE_AFTER = /^\s*[,-]\s*([A-Z]{2})(?![\p{L}\p{N}])/u;
const STATE_ABBRS = new Set(USPS_STATES.map(([, abbr]) => abbr.toUpperCase()));
const ANY_STATE_CODE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${STATES_AND_DC.map(([, code]) => code.toUpperCase()).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
const foreignCode = (pattern, text, code) => { const beside = pattern.exec(text)?.[1]; return beside !== undefined && !STATE_ABBRS.has(beside) && (beside !== 'DC' || code === 'CO'); };
// "U.S" and "U.S.A" without the last dot, which the aliases "u.s." and "u.s.a." do not match.
const US_DOTTED = /(?<![\p{L}\p{N}.])u\.s(?:\.a)?(?![\p{L}\p{N}.])/giu;
// A street number, then the words up to the next comma, slash, bar, bracket or spaced dash.
const ADDRESS_RUN = /(?<![\p{L}\p{N}])\d[\p{L}\p{N}]*\s.*?(?=\s-\s|[,/|()[\]·;]|$)/gu;

// Turkey with a state after it in the same place is a US town or a creek ("Turkey, TX"). After the state it is the
// country ("Atlanta, GA or Istanbul, Turkey").
const withoutTurkeyTowns = (place, hasState) => place.replace(/\bturkey\b/gi, (name, at) => (hasState(place.slice(at + name.length)) ? ' ' : name));

/** A raw location with its capital US state codes other than CA, CO, DE, IL and IN taken out, folded. A place written all in capitals keeps
 * them, because nothing there tells "OR" the state from "or" the word.
 * @param {string} location
 * @returns {string} the places, folded and joined by a middle dot
 */
function withoutStateCodes(location) {
  return places(location).map(place => fold(/\p{Ll}/u.test(place) ? withoutTurkeyTowns(place, rest => rest.search(US_STATE_CODE) >= 0).replace(US_STATE_CODE, ' ') : place)).join(' · ');
}

const withoutAmbiguousCodes = (text) => text.replace(AMBIGUOUS_STATE_CODE, (code, at) => (foreignCode(CODE_BEFORE, text.slice(0, at), code) || foreignCode(CODE_AFTER, text.slice(at + 2), code) ? code : ' '));

/** A raw place with its US states taken out, folded, or null when it names none. Georgia counts where its
 * code GA stands in the same place ("GEORGIA - VIRTUAL - GA01"). CA, CO, DE, IL and IN count only in a place
 * that also names a state by its full name or by another code ("Colorado Springs, CO", "CA, NY, TX"), and not
 * next to a capital code that is no state, where they are the country ("Delaware, ON, CA", "Bogota, DC, CO").
 * @param {string} place
 * @param {boolean} codes whether capital state codes are read; false where the place is written all in capitals
 * @param {boolean} georgia whether Georgia is a home state and not the country here, so its name is the state
 * @returns {string | null}
 */
function withoutUsStates(place, codes, georgia = false) {
  // Georgia's name is no state for Turkey: beside it alone Turkey is the country next door.
  const towns = withoutTurkeyTowns(place, rest => rest.search(US_STATE_NAME) >= 0 || (codes && rest.search(US_STATE_CODE) >= 0));
  const named = (georgia || GEORGIA_CODE.test(place) ? towns.replace(GEORGIA_WORD, ' ') : towns).replace(US_STATE_NAME, ' ');
  if ((codes ? named.replace(US_STATE_CODE, ' ') : named) === towns) return null;
  // Judged before the other codes go, so the code next to an ambiguous one is still there to see.
  const sure = withoutAmbiguousCodes(named);
  // Beside a state "and" is the word, not Andorra's three-letter code.
  return fold((codes ? sure.replace(US_STATE_CODE, ' ') : sure).replace(/\band\b/gi, ' '));
}

const GEORGIAN_PLACE = /\b(?:t['’]?bilisi|tiflis|batumi|kutaisi|rustavi|zugdidi|poti|gori|(?:republic|the country) of georgia)\b|\bgeorgia [([](?:the )?country[)\]]/;
const GEORGIA_EXCLUSION = /\b(?:not|no|cannot|can't|unable|except|excluding|exclude|excluded|ineligible|outside)\b/i;
// A region outside the United States, a timezone no US state keeps, or an offset east of Greenwich.
const GEORGIA_ABROAD = new RegExp(`${GEORGIAN_PLACE.source}|\\b(?:emea|europe|eu|eea|cee|mena|middle east|caucasus|cis|asia|eurasia|balkans|cet|cest|eet|eest|msk)\\b|\\b(?:utc|gmt) ?\\+ ?\\d`);
const HOME_WORKING_WORDS = new RegExp(`\\b(?:remote|distributed|${HOME_WORDS})\\b`, 'g');
// No letters but Georgia and the home-working words: "100% Remote - Georgia" names only Georgia, "Remote" nothing.
const namesNoOtherPlace = (text) => !/\p{L}/u.test(text.replace(GEORGIA_WORD, '').replace(HOME_WORKING_WORDS, ''));
const US_TERRITORY = /\b(?:puerto rico|guam|american samoa|northern mariana islands)\b/;

/** Which side of the US border one part of a location is on: 'us', 'foreign', 'maybe' where it may be foreign, or
 * null where nothing tells (a city the policy does not list and no country: "Remote - Austin", "Remote - Warsaw").
 * A country's name makes it foreign, or 'maybe' beside a US state ("Panama City, FL").
 * CA, CO, DE, IL and IN are US beside a city ("Denver, CO") and 'maybe' alone, where the gate reads Canada or
 * Germany. A country code that is no state code is foreign, and so is a region or timezone outside the United States. The US territories are US. The US Virgin Islands read
 * as US through the home country's name in them, and the British Virgin Islands as foreign.
 * @param {{ place: string, codes: boolean }} one a part from stateParts, read from its `place`
 * @param {readonly string[]} countryNames the home country's names, folded
 * @param {readonly string[]} homePlaces the policy's on-site places, folded
 * @returns {'us' | 'foreign' | 'maybe' | null}
 */
function placeSide({ place: part, codes }, countryNames, homePlaces) {
  const text = fold(part);
  if (has(text, countryNames) || has(text, homePlaces) || US_TERRITORY.test(text)) return 'us';
  const rest = withoutUsStates(part, codes);
  // A state beside a country's name may be either: "Panama City, FL".
  if (rest !== null) return countries(brackets(rest), true).size ? 'maybe' : 'us';
  if (countries(text).size) return 'foreign';
  const sure = withoutAmbiguousCodes(part);
  if (sure !== part) return namesNoOtherPlace(fold(sure.replace(ANY_STATE_CODE, ' '))) ? 'maybe' : 'us';
  if (GEORGIA_ABROAD.test(text)) return 'foreign';
  if (!countries(text, true).size) return null;
  return text.split(/[^a-z]+/).some(token => STATE_ABBRS.has(token.toUpperCase())) ? 'maybe' : 'foreign';
}

/** How the Georgia in one part of a location reads. It is the country beside a Georgian place (a town such as
 * Tbilisi, "Republic of Georgia", "the country of Georgia", "Georgia (country)") or an abroad word (a region such
 * as EMEA, a timezone no US state keeps, a UTC offset east of Greenwich). Otherwise it is the state where its own
 * part has a home place or another US state. A Georgia with nothing else in its part is the country where another
 * part, the title or the description names a Georgian place ("Remote - Georgia · Remote - Texas · Remote -
 * Tbilisi"). Otherwise it is the state where any other part is in the United States ("Florida; Georgia;
 * Nashville, TN"). Where no other part is or may be foreign ("Remote - Austin") it is the state, or unsure when
 * the title or the description places Georgia abroad. The home country in its own part needs no rule: the gate
 * reads that as the United States whatever this says. It is the country where its part names nothing else and
 * every other place is foreign ("Poland · Georgia · Bulgaria"). Anything else is unsure ("Remote - Savannah,
 * Georgia · Remote - Poland", "Remote - Georgia · Remote - Austin · Remote - Canada", "Remote - Georgia · Remote -
 * CA"). A part with no Georgia reads as 'state'.
 * @param {{ part: string, place: string, codes: boolean }} one
 * @param {{ part: string, place: string, codes: boolean }[]} others the other parts of the same location
 * @param {readonly string[]} countryNames the home country's names, folded
 * @param {readonly string[]} homePlaces the policy's on-site places, folded
 * @param {'country' | 'unsure' | null} context what the title and the description say, from georgiaContext
 * @returns {'state' | 'country' | 'unsure'}
 */
function georgiaReading({ part, place, codes }, others, countryNames, homePlaces, context) {
  const text = fold(part), alone = namesNoOtherPlace(text);
  if (text.search(GEORGIA_WORD) < 0) return 'state';
  if (GEORGIA_ABROAD.test(text)) return 'country';
  if (has(text, homePlaces) || withoutUsStates(place, codes) !== null) return 'state';
  if (alone && (context === 'country' || others.some(other => GEORGIAN_PLACE.test(fold(other.part))))) return 'country';
  const sides = others.filter(other => !namesNoOtherPlace(fold(other.place))).map(other => placeSide(other, countryNames, homePlaces));
  if (sides.includes('us')) return 'state';
  if (!sides.some(side => side === 'foreign' || side === 'maybe')) return context ? 'unsure' : 'state';
  return alone && sides.every(side => side === 'foreign') ? 'country' : 'unsure';
}

/** How a posting's title and description place its Georgia: 'country' where either names a Georgian place, 'unsure'
 * where the title has a region word or a description sentence has one beside Georgia, null where neither tells.
 * @param {string} heading the title, folded
 * @param {string} text the description as plain text, folded
 * @returns {'country' | 'unsure' | null}
 */
function georgiaContext(heading, text) {
  if (GEORGIAN_PLACE.test(heading) || GEORGIAN_PLACE.test(text)) return 'country';
  const abroad = GEORGIA_ABROAD.test(heading)
    || (text.includes('georgia') && text.split(/[.!?\n]+/).some(sentence => sentence.search(GEORGIA_WORD) >= 0 && GEORGIA_ABROAD.test(sentence)));
  return abroad ? 'unsure' : null;
}

/** A raw US location as the gate and the verdict both read it: one entry per place, and per side of a bar or a
 * spaced slash outside brackets. "US:" and "U.S.A" are written as the country reader knows them.
 * @param {string} raw
 * @param {readonly string[]} countryNames the home country's names, folded
 * @param {readonly string[]} homePlaces the policy's on-site places, folded
 * @param {'country' | 'unsure' | null} [context] what the title and the description say, from georgiaContext
 * @param {(part: string) => string} [geographyText] the gate's place reader
 * @returns {{ part: string, place: string, codes: boolean, georgia: 'state' | 'country' | 'unsure' }[]} `place` is the
 *   part without its timezones, which states and the side of the border are read from; `codes` is whether capital
 *   state codes are read, false where the part is in capitals; `georgia` is how the part's Georgia reads
 */
function stateParts(raw, countryNames, homePlaces, context = null, geographyText = text => text) {
  const parts = places(raw.replace(/:/g, ' ').replace(US_DOTTED, 'usa')).flatMap(place => {
    // A spaced slash inside brackets joins timezones ("(EST / EDT)"), not places.
    const sides = place.split(/\||\s\/\s(?![^()[\]]*[)\]])/);
    // A side in capitals has its codes read only beside a side that is a remote word alone ("Remote | GA").
    const marker = sides.some(side => /\p{Ll}/u.test(side) && namesNoOtherPlace(fold(side)));
    return sides.map(part => ({ part, place: geographyText(part), codes: marker || /\p{Ll}/u.test(part) }));
  });
  return parts.map(one => ({ ...one, georgia: georgiaReading(one, parts.filter(other => other !== one), countryNames, homePlaces, context) }));
}

/** A folded place without the two-letter words of its street addresses: the "St" of "999 18th St" and the
 * "SE" of "200 Main Parkway SE" are not countries. A number with one word after it is left alone ("30339 IE").
 * @param {string} text
 */
function withoutAddressWords(text) {
  return brackets(text).replace(ADDRESS_RUN, run => run.trim().split(/\s+/).length > 2 ? run.replace(TWO_LETTER_WORD, ' ') : run);
}

// Best to worst for the owner.
export const LOCATION_TIERS = Object.freeze(['fit', 'review', 'elsewhere']);
// Words a location uses without naming a place: "Multiple Locations", "Hybrid in the United States", "N/A".
const NO_PLACE_WORDS = /\bn\/a\b|\b(?:na|not specified|unspecified|flexible|see (?:job )?description|to be determined|locations?|multiple|various|cities|any|nationwide|tbd|hybrid|on[ -]?site|in[ -]?office|in|the|and|or)\b/g;

// A capital code with the home country beside it is a state in any letter case: "Remote, CA, USA", "Remote - US, CA",
// "UNITED STATES (CT)". A slash keeps them two countries ("Remote - US/CA").
function codeBesideCountry(part, countryNames) {
  if (!countryNames.length) return false;
  const names = countryNames.map(escape).join('|');
  const after = new RegExp(`^, ?(?:${names})(?![\\p{L}\\p{N}])`, 'u'), before = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names})(?:,| \\()$`, 'u');
  return [...part.matchAll(ANY_STATE_CODE)].some(({ index }) => after.test(fold(part.slice(index + 2))) || before.test(fold(part.slice(0, index))));
}

/** Whether a remote location the gate passed is scoped to states and none of them is home: it names a US state,
 * names no home state, and no part stands for the whole country ("Remote - United States; Remote, TN" is not scoped).
 * @param {{ part: string, codes: boolean }[]} parts from stateParts, the country Georgia already taken out
 * @param {readonly string[]} homeStates the policy's home state codes
 * @param {readonly string[]} countryNames the home country's names, folded
 * @param {(part: string) => string} geographyText the gate's place reader
 * @returns {boolean}
 */
function scopedToOtherState(parts, homeStates, countryNames, geographyText) {
  let named = false, countryWide = false, home = false;
  for (const { part: raw, codes } of parts) {
    const part = geographyText(raw), folded = fold(part), beside = codeBesideCountry(part, countryNames);
    if (withoutUsStates(part, codes, homeStates.includes('ga')) === null && !beside) {
      countryWide ||= has(folded, countryNames);
      continue;
    }
    named = true;
    home ||= STATES_AND_DC.some(([name, code]) => homeStates.includes(code) && (STATE_NAME_MATCH.get(name).test(folded) || ((codes || beside) && word(code.toUpperCase()).test(part))));
  }
  return named && !countryWide && !home;
}

// Beside the home country's name these name no place either: "US Only", "US - East", "Flexible - US".
const BESIDE_COUNTRY_WORDS = /\b(?:only|flexible|east|west|north|south|central)\b/g;
const ANY_COUNTRY_NAME = new RegExp(`(?<![\\p{L}\\p{N}])${LABEL_PLACE}(?![\\p{L}\\p{N}])`, 'gu');

function namesNoPlace(location, homeStates, countryNames, usHome) {
  // Under a US policy a state alone names no town either: a home state, or any state where the policy lists none ("Georgia, USA").
  const single = new Set(STATES_AND_DC.filter(([, code]) => usHome && (!homeStates.length || homeStates.includes(code))).flatMap(([name, code]) => [name.replace(/ /g, ''), code]));
  const text = fold(location), letters = (part) => part.replace(/\s+/g, ' ').replace(NO_PLACE_WORDS, '').replace(/[^a-z]/g, '');
  const homeNamed = has(text, countryNames);
  return text.split(/[·;|]/).every(part => {
    for (const name of countryNames) part = part.replace(new RegExp(word(name).source, 'gu'), ' ');
    // "Remote/Hybrid" names no place: the gate reads it as an office role, and the remote word is no town.
    part = part.replace(HOME_WORKING_WORDS, ' ');
    const left = letters(part);
    // Another country beside the home country is a list of countries, not a town ("United States; Canada").
    return !left || single.has(left) || (homeNamed && !letters(part.replace(ANY_COUNTRY_NAME, ' ').replace(BESIDE_COUNTRY_WORDS, ' ')));
  });
}

// An on-site place in a home state outside the listed towns is the owner's to judge ("Kennesaw, GA").
// The code counts in capitals anywhere, and in any letter case where it closes the place after a comma ("Kennesaw, Ga").
const namesHomeState = (parts, homeStates) => parts.some(({ part }) => STATES_AND_DC.some(([name, code]) => homeStates.includes(code)
  && (word(code.toUpperCase()).test(part) || fold(part).endsWith(`, ${code}`) || STATE_NAME_MATCH.get(name).test(fold(part)))));

/** Where a posting's location sits for the owner, read from the workplace gate.
 * `fit` is a place the policy allows. `elsewhere` is a place the policy rules out. `review` is a place the owner
 * may still want, which the gate cannot settle. It is one of these: no location; a remote role whose country
 * nothing confirms; no place named ("United States", "Remote/Hybrid", "United States; Canada"); an on-site role
 * in a home state outside the listed towns; a remote role scoped to a state that is not home; a Georgia that
 * may be the state or the country; a state code in a place written in capitals ("REMOTE, TN"); a remote role the
 * gate refuses as another country in which one place reads as a US one ("Remote - Denver, CO"); a home town
 * the gate rejects for what stands beside it ("Atlanta, GA or London, UK"); a placeholder ("N/A"); a remote role whose
 * only place is a bare CA, CO, DE, IL or IN or a bare US timezone ("Remote, CA", "Remote - EST"); a remote option
 * beside an office word in a location that names the home country.
 * @param {Function & { homeStates?: readonly string[], homeCountryNames?: readonly string[], geographyText?: (part: string) => string, homePlaces?: readonly string[] }} gate from buildWorkplacePolicy
 * @param {unknown} location the posting's location as the board wrote it; anything but a string is no location
 * @param {string} [title] the posting's title, which the gate reads for "Remote"
 * @param {object} [offer] the posting's other fields the gate reads: description, workplace type, country lists
 * @returns {{ tier: 'fit' | 'review' | 'elsewhere', reason: string }} `reason` is the gate's reason, or one of the
 *   three the verdict adds: `location_names_no_place`, `onsite_in_home_state`, `remote_scoped_to_other_state`
 */
export function locationVerdict(gate, location, title = '', offer = {}) {
  const raw = typeof location === 'string' ? location : '';
  const countryNames = gate.homeCountryNames ?? [], usHome = countryNames.includes('united states');
  // US states are home, and scope a remote role, only where the United States is a home country.
  const homeStates = usHome ? gate.homeStates ?? [] : [];
  const ask = (text) => gate(text, title, offer ?? {});
  const { eligible, reason } = ask(raw);
  const verdict = (tier, why = reason) => ({ tier, reason: why });
  const homePlaces = gate.homePlaces ?? [], context = /georgia/i.test(raw) ? georgiaContext(fold(title), plain(offer?.description)) : null;
  const parts = stateParts(raw, countryNames, homePlaces, context, gate.geographyText);
  // A Georgia that reads as the country is taken out, so the checks below do not count it as a state.
  const states = parts.map(one => (one.georgia === 'country' ? { ...one, part: one.part.replace(GEORGIA_WORD, ' ') } : one));
  if (eligible) return usHome && reason === 'remote_region_allowed' && scopedToOtherState(states, homeStates, countryNames, gate.geographyText ?? (text => text)) ? verdict('review', 'remote_scoped_to_other_state') : verdict('fit');
  // The gate gives onsite_country_restricted only after it found a home place in the location.
  if (['location_unknown', 'remote_eligibility_unconfirmed', 'onsite_country_restricted'].includes(reason)) return verdict('review');
  if (reason === 'onsite_outside_allowed_locations' && namesNoPlace(raw, homeStates, countryNames, usHome)) return verdict('review', 'location_names_no_place');
  if (reason === 'onsite_outside_allowed_locations' && namesHomeState(states, homeStates)) return verdict('review', 'onsite_in_home_state');
  // Asked again as states: would this pass if a Georgia that may be the state were one, and if a part in capitals
  // were not? The gate reads a capital state code only in a place with a lower-case letter ("REMOTE, TN" is Tunisia
  // to it), so a part with none is given "remote " in front, and its words that are no state code are lower-cased.
  const asStates = parts.map(({ part, georgia }) => {
    // Tennessee stands in for Georgia: a state name the gate reads as a state whatever the policy's home states.
    // Turkey goes in as its code, so the stand-in state does not make it a town.
    const text = georgia === 'country' || part.search(GEORGIA_WORD) < 0 ? part : part.replace(GEORGIA_WORD, 'Tennessee').replace(/\bturkey\b/gi, 'TUR');
    return /\p{Ll}/u.test(text) ? text : `remote ${text.replace(/\p{L}+/gu, run => (STATE_ABBRS.has(run) || run === 'DC' ? run : run.toLowerCase()))}`;
  });
  if (reason === 'remote_country_restricted' && asStates.some((text, i) => text !== parts[i].part) && ask(asStates.join(' · ')).eligible) return verdict('review', 'remote_scoped_to_other_state');
  // placeSide tells US from foreign, so it is asked only where the United States is home. A US city beside a code the
  // gate read as a country is the owner's to judge, whatever foreign office stands beside it ("Remote - Denver, CO").
  if (reason === 'remote_country_restricted' && usHome
    && parts.some(one => one.georgia !== 'country' && !namesNoOtherPlace(fold(one.part)) && placeSide(one, countryNames, homePlaces) === 'us')) return verdict('review', 'remote_scoped_to_other_state');
  if (reason === 'remote_country_restricted' && usHome) {
    // What each part names once its timezone and its remote words are gone. A part whose Georgia is the country names a foreign place.
    const named = parts.filter(one => one.georgia !== 'country').map(one => fold(one.place).replace(HOME_WORKING_WORDS, ' ').replace(/[^a-z]+/g, ' ').trim()).filter(Boolean);
    // A bare CA, CO, DE, IL or IN is a state or a country, and a bare EST or PT a US timezone or one: the part's own
    // letters decide, since placeSide's 'maybe' also covers "Remote - Toronto, ON, CA".
    if (named.length && named.every(text => AMBIGUOUS_STATE_CODES.includes(text))) return verdict('review', 'remote_scoped_to_other_state');
    if (!named.length && parts.some(one => one.place !== one.part)) return verdict('review', 'remote_eligibility_unconfirmed');
  }
  // The gate reads an office word anywhere in a location as an office role, so a remote option in a place of its own is lost.
  if (reason === 'onsite_outside_allowed_locations' && usHome && has(fold(raw), countryNames)
    && places(fold(raw)).some(place => REMOTE.test(place) && !NOT_REMOTE.test(place))) return verdict('review', 'remote_eligibility_unconfirmed');
  return verdict('elsewhere');
}
