// Ground-truth labeller, from the location string alone. Deliberately does not import the repo's gate.
// label(location) -> { label: 'FIT'|'OFF'|'AMBIG', why }
const fold = (s) => (s || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const STATES = { alabama: 'al', alaska: 'ak', arizona: 'az', arkansas: 'ar', california: 'ca', colorado: 'co', connecticut: 'ct', delaware: 'de', florida: 'fl', georgia: 'ga', hawaii: 'hi', idaho: 'id', illinois: 'il', indiana: 'in', iowa: 'ia', kansas: 'ks', kentucky: 'ky', louisiana: 'la', maine: 'me', maryland: 'md', massachusetts: 'ma', michigan: 'mi', minnesota: 'mn', mississippi: 'ms', missouri: 'mo', montana: 'mt', nebraska: 'ne', nevada: 'nv', 'new hampshire': 'nh', 'new jersey': 'nj', 'new mexico': 'nm', 'new york': 'ny', 'north carolina': 'nc', 'north dakota': 'nd', ohio: 'oh', oklahoma: 'ok', oregon: 'or', pennsylvania: 'pa', 'rhode island': 'ri', 'south carolina': 'sc', 'south dakota': 'sd', tennessee: 'tn', texas: 'tx', utah: 'ut', vermont: 'vt', virginia: 'va', washington: 'wa', 'west virginia': 'wv', wisconsin: 'wi', wyoming: 'wy', 'district of columbia': 'dc' };
const STATE_NAME = new RegExp(`\\b(?:${Object.keys(STATES).join('|')})\\b`);
// Two-letter codes read as states only when upper-case in the raw string ("Remote, TN"), never "in"/"or"/"me" prose.
const STATE_CODE_RAW = new RegExp(`(?<![A-Za-z])(?:${Object.values(STATES).map(s => s.toUpperCase()).join('|')})(?![A-Za-z])`);

const dn = new Intl.DisplayNames(['en'], { type: 'region' });
const FOREIGN_NAMES = [];
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b);
  if (code === 'US') continue;
  try { const n = dn.of(code); if (n && n !== code && !/^Unknown/.test(n)) FOREIGN_NAMES.push(fold(n)); } catch {}
}
const FOREIGN_EXTRA = ['uk', 'england', 'scotland', 'emea', 'apac', 'europe', 'latam', 'latin america', 'asia', 'korea', 'czech republic', 'turkey', 'uae', 'russia', 'vietnam', 'taiwan', 'hong kong',
  // cities met in this history that carry no country
  'london', 'dublin', 'bengaluru', 'bangalore', 'hyderabad', 'pune', 'mumbai', 'chennai', 'gurgaon', 'gurugram', 'noida', 'delhi', 'warszawa', 'warsaw', 'krakow', 'wroclaw', 'gdansk', 'poznan', 'lodz', 'katowice', 'madrid', 'barcelona', 'tokyo', 'toronto', 'vancouver', 'montreal', 'ottawa', 'paris', 'berlin', 'munich', 'munchen', 'hamburg', 'frankfurt', 'amsterdam', 'zurich', 'stockholm', 'sydney', 'melbourne', 'tel aviv', 'sao paulo', 'mexico city', 'guadalajara', 'bogota', 'buenos aires', 'lisbon', 'porto', 'prague', 'budapest', 'bucharest', 'sofia', 'belgrade', 'vilnius', 'tallinn', 'riga', 'kyiv', 'cork', 'galway', 'manila', 'kuala lumpur', 'jakarta', 'bangkok', 'seoul', 'shanghai', 'beijing', 'shenzhen', 'dubai', 'riyadh', 'cairo', 'lagos', 'nairobi', 'cape town', 'johannesburg', 'vienna', 'brussels', 'copenhagen', 'oslo', 'helsinki', 'milan', 'rome', 'athens', 'istanbul', 'heredia', 'san jose, costa rica', 'cluj', 'bratislava', 'ljubljana', 'zagreb', 'edinburgh', 'manchester, uk', 'cambridge, uk', 'reading, uk', 'belfast', 'luxembourg', 'geneva', 'lausanne', 'basel', 'eindhoven', 'utrecht', 'rotterdam', 'gothenburg', 'malmo', 'aarhus', 'brno', 'timisoara', 'iasi', 'thessaloniki', 'limassol', 'nicosia', 'valletta', 'haifa', 'herzliya', 'ra\'anana', 'petah tikva', 'calgary', 'edmonton', 'waterloo, on', 'mississauga', 'kitchener', 'quebec', 'ontario', 'british columbia', 'alberta', 'penang', 'ho chi minh', 'hanoi', 'taipei', 'hsinchu', 'osaka', 'yokohama', 'auckland', 'wellington', 'brisbane', 'perth', 'adelaide', 'canberra', 'santiago', 'lima', 'medellin', 'monterrey', 'curitiba', 'campinas', 'rio de janeiro', 'gliwice', 'trojmiasto', 'slask', 'makati', 'cebu', 'taguig', 'karnataka', 'telangana', 'maharashtra', 'tamil nadu', 'haryana', 'uttar pradesh', 'kochi', 'ahmedabad', 'kolkata', 'coimbatore', 'trivandrum', 'thiruvananthapuram', 'indore', 'jaipur', 'chandigarh', 'mohali'];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FOREIGN = new RegExp(`(?<![a-z])(?:${[...new Set([...FOREIGN_NAMES, ...FOREIGN_EXTRA])].sort((a, b) => b.length - a.length).map(esc).join('|')})(?![a-z])`);

const ATL_PLAIN = /\b(?:atlanta|alpharetta|johns creek|sandy springs|dunwoody|peachtree (?:city|corners)|kennesaw|norcross|buckhead|brookhaven, ga|vinings)\b|(?<![a-z])atl(?![a-z])/;
// Names shared with other states count only with Georgia beside them.
const ATL_WITH_GA = /\b(?:marietta|roswell|decatur|duluth|smyrna|lawrenceville|cumming|woodstock|canton|stockbridge|mcdonough|suwanee|tucker|austell|conyers|covington|douglasville|fayetteville|newnan|buford|chamblee|doraville|college park|east point|union city|lithia springs|braselton|gainesville|cartersville|acworth|milton|morrow|forest park)\b/;
const GEORGIA_US = /\bgeorgia\b|(?<![a-z])ga(?![a-z])/;

const REMOTE = /\b(?:remote|work(?:ing)? (?:from|at) home|home[ -]?(?:based|office|workers?|teleworkers?)|virtual|telework\w*|telecommut\w*|wfh|work from anywhere|anywhere in|distributed)\b|(?:^|[·;] ?)home ?[-,]/;
const NOT_REMOTE = /\b(?:non|not|no)[- ]?remote\b/;
const HYBRID = /\b(?:hybrid|on[ -]?site|in[ -]?office)\b/;
const US = /\b(?:united states(?: of america)?|usa|america|nationwide|north america|americas|amer)\b|(?<![a-z])u\.s\.(?:a\.?)?|(?<![a-z])us(?![a-z])/;
const GLOBAL = /\b(?:worldwide|global|anywhere|international)\b/;
const N_LOCATIONS = /^\d+ locations?$|\bmultiple (?:locations|cities)\b|^(?:multiple|various|several)(?: \w+)?$|\bmore locations\b|^\+?\d+ more$/;

export function label(rawLocation) {
  const raw = (rawLocation || '').trim();
  const loc = fold(raw);
  if (!loc) return { label: 'AMBIG', why: 'blank' };
  const otherState = STATE_NAME.test(loc.replace(/\bgeorgia\b/g, ' ')) || STATE_CODE_RAW.test(raw);
  const georgiaAlone = fold(raw).replace(/[^a-z]/g, '') === 'georgia';
  const hasGeorgiaUs = GEORGIA_US.test(loc) && !/\btbilisi\b/.test(loc) && (US.test(loc) || otherState || georgiaAlone);
  const atl = ATL_PLAIN.test(loc) || (ATL_WITH_GA.test(loc) && hasGeorgiaUs);
  if (atl) return { label: 'FIT', why: 'atlanta_metro' };
  if (N_LOCATIONS.test(loc)) {
    // "United States, Multiple Locations" and "5 Locations" name no place.
    const rest = loc.replace(/\bmultiple (?:locations|cities)\b/g, '').replace(HYBRID, '').replace(US, '').replace(/[\s,;·|-]/g, '');
    if (!rest || /^\d+ locations?$/.test(loc)) return { label: 'AMBIG', why: /multiple/.test(loc) ? 'multiple_locations' : 'n_locations' };
  }
  const foreign = FOREIGN.test(loc.replace(/\bnew mexico\b|\bnew jersey\b|\bjersey city\b/g, ' ').replace(/\b(?:georgia|ga)\b/g, hasGeorgiaUs ? ' ' : '$&'));
  const stateName = STATE_NAME.test(loc.replace(/\bwashington,? d\.?c\.?\b/g, 'district of columbia'));
  const stateCode = STATE_CODE_RAW.test(raw);
  const us = US.test(loc) || stateName || stateCode;
  const remote = REMOTE.test(loc) && !NOT_REMOTE.test(loc);
  if (remote) {
    // Judged place by place: "Remote, United States" is open to any US resident, "US, TX, Remote" is scoped to a state.
    const parts = raw.split(/[·;|]|\s\/\s/).map(part => ({ raw: part, loc: fold(part) })).filter(part => part.loc);
    const usCountryOnly = parts.some(part => !REMOTE.test(part.loc) && US.test(part.loc) && !part.loc.replace(US, '').replace(/[^a-z]/g, ''));
    let scoped = false, bare = false;
    for (const part of parts) {
      if (!REMOTE.test(part.loc)) continue;
      const partState = STATE_NAME.test(part.loc.replace(/\bwashington,? d\.?c\.?\b/g, 'district of columbia')) || STATE_CODE_RAW.test(part.raw);
      if (hasGeorgiaUs && GEORGIA_US.test(part.loc)) return { label: 'FIT', why: 'remote_states_incl_georgia' };
      if (US.test(part.loc) && !partState) return { label: 'FIT', why: 'remote_us' + (foreign ? '+foreign' : '') };
      if (partState) scoped = true;
      else if (!FOREIGN.test(part.loc) && !GLOBAL.test(part.loc)) bare = true;
    }
    if (bare && usCountryOnly) return { label: 'FIT', why: 'remote_us' + (foreign ? '+foreign' : '') };
    if (scoped || (bare && us)) return { label: 'AMBIG', why: 'remote_other_state' + (foreign ? '+foreign' : '') };
    if (foreign) return { label: 'OFF', why: 'remote_foreign' };
    if (GLOBAL.test(loc)) return { label: 'AMBIG', why: 'remote_global' };
    const rest = loc.replace(REMOTE, '').replace(HYBRID, '').replace(/[^a-z]/g, '');
    return rest ? { label: 'AMBIG', why: 'remote_plus_unknown_place' } : { label: 'AMBIG', why: 'remote_bare' };
  }
  if (foreign && !us) return { label: 'OFF', why: 'foreign' };
  // What is left once country, state and filler words are taken out decides country-only and state-only.
  let rest = loc.replace(US, ' ');
  const onlyGeorgia = hasGeorgiaUs && !rest.replace(/\bgeorgia\b|(?<![a-z])ga(?![a-z])/g, '').replace(/[^a-z]/g, '');
  if (onlyGeorgia) return { label: 'AMBIG', why: 'state_only_georgia' };
  if (!rest.replace(/\b(?:of|the|only|any|location|locations|multiple|based|flexible)\b/g, '').replace(/[^a-z]/g, '')) return { label: 'AMBIG', why: 'country_only' };
  if (hasGeorgiaUs && /(?:^|[·;|] ?)georgia(?:, (?:usa|us|united states))? ?(?:$|[·;|])/.test(loc)) return { label: 'AMBIG', why: 'state_only_georgia' };
  if (foreign && us) return { label: 'OFF', why: 'mixed_us_foreign_no_atl' };
  return { label: 'OFF', why: us ? 'us_elsewhere' : 'named_place_elsewhere' };
}
