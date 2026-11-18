// usage: node prototype-patch.mjs <providers/_country.mjs> <out.mjs>. Writes the module with the six sketched changes, for measuring only.
import { readFileSync, writeFileSync } from 'node:fs';
let s = readFileSync(process.argv[2], 'utf8');
const sub = (from, to) => { if (!s.includes(from)) throw new Error('missing: ' + from.slice(0, 70)); s = s.replace(from, to); };
// A. sibling label rule: labels are section headings only when one of them names a home country.
const oldLabel = s.slice(s.indexOf('const CURRENCY ='), s.indexOf('// "US" in capitals is the country'));
sub(oldLabel, `// A block tag becomes a newline, which ends a sentence here.
const BLOCK_TAG = /<\\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|section)\\b[^<>]*>/gi;
const LABEL_PLACE = \`(?:\${[...COUNTRY_NAMES, ...COUNTRY_ALIASES].map(c => c.name).concat('us').sort((a, b) => b.length - a.length).map(escape).join('|')})\`;
// "Canada-based roles only:" heads one country's section of a posting written for several.
const SCOPE_LABEL = new RegExp(\`(^|[.!?\\\\n])(\\\\s*(?:<[^<>]*>\\\\s*)*)(?:(?:for )?(\${LABEL_PLACE})(?:[ -]based)? (?:roles|positions|candidates|applicants|employees|hires)|pay ranges? for (\${LABEL_PLACE})) only(?:\\\\s*<[^<>]*>)*\\\\s*:\`, 'gi');
// The labels are headings, not restrictions, only where one of them names a home country: a posting whose one label is foreign is a foreign role.
const withoutScopeLabels = (text, isHome) => {
  if (typeof text !== 'string') return text;
  const lines = text.replace(BLOCK_TAG, '\\n');
  return [...lines.matchAll(SCOPE_LABEL)].some(m => isHome(fold(m[3] ?? m[4]))) ? lines.replace(SCOPE_LABEL, '$1$2') : lines;
};
`);
sub('const unlabelled = withoutScopeLabels(offer.description);', "const unlabelled = withoutScopeLabels(offer.description, place => has(place, homeAliases) || (usHome && place === 'us'));");
// B. a description that shuts a home state out of hiring. Not excludedHome: for a state name that pattern also catches "Our headquarters is not in Georgia".
sub("    if (excludedHome(`${loc}. ${heading}. ${meta}. ${written}`, homeAliases)) return fail('candidate_country_excluded');",
"    if (excludedHome(`${loc}. ${heading}. ${meta}. ${written}`, homeAliases)) return fail('candidate_country_excluded');\n    if (shutsOutHomeState && written.split(/[.!?\\n]+/).some(sentence => shutsOutHomeState.test(sentence) && !(sentence.includes('georgia') && (!georgiaIsHome || otherCountry(sentence) || GEORGIA_ABROAD.test(sentence))))) return fail('home_state_excluded');");
sub("  const usHome = homeCodes.has('US');", `  const usHome = homeCodes.has('US');
  const homeStateName = \`(?:\${STATES_AND_DC.filter(([, code]) => homeStateCodes.includes(code)).map(([name]) => escape(name)).join('|')})\`;
  const otherStates = \`(?:(?:\${USPS_STATES.map(([name]) => name).join('|')})(?:\\\\s*,\\\\s*(?:and |or )?|\\\\s+(?:and|or)\\\\s+))*\`;
  const shutsOutHomeState = homeStateCodes.length ? new RegExp(\`(?:(?:not (?:available|eligible|open|supported|hiring)|unable to hire|cannot hire|can't hire|do(?:es)? not hire)(?: [a-z]+){0,3}? (?:in|of|from)(?: the following(?: us)? states)?|excluding|except(?: for)?)[\\\\s:]+(?:the state of\\\\s+)?\${otherStates}\${homeStateName}(?=\\\\s*(?:$|[,;:)]|and\\\\b|or\\\\b))|(?<![\\\\p{L}\\\\p{N}])\${homeStateName}(?:[ -]based)? (?:residents|applicants|candidates) (?:are|is) (?:not eligible|ineligible|excluded)(?=\\\\s*(?:$|[,;)]|to apply|for (?:this|the) (?:role|position|job)))\`, 'u') : null;`);
// C. any country list that names home, before "only", with or without a noun.
sub("(?=(?:[ -]based)?\\\\s+(?:roles|positions|employees|hires)\\\\s*[- ]?only\\\\b)`, 'gu');", "(?=(?:[ -]based)?(?:\\\\s+(?:roles|positions|employees|hires|candidates|applicants|residents))?\\\\s*[- ]?only\\\\b)`, 'gu');");
// D. verdict: placeholders, a code or zone that reads two ways, a remote option beside an office word.
sub("const NO_PLACE_WORDS = /\\b(?:locations?|multiple|various|cities|any|nationwide|tbd|hybrid|", "const NO_PLACE_WORDS = /\\bn\\/a\\b|\\b(?:na|not specified|unspecified|flexible|see (?:job )?description|to be determined|locations?|multiple|various|cities|any|nationwide|tbd|hybrid|");
sub("placeSide(one, countryNames, homePlaces) === 'us')) return verdict('review', 'remote_scoped_to_other_state');\n  return verdict('elsewhere');",
"placeSide(one, countryNames, homePlaces) === 'us')) return verdict('review', 'remote_scoped_to_other_state');\n  if (reason === 'remote_country_restricted' && usHome) {\n    const bare = parts.filter(one => one.georgia !== 'country').map(one => fold(one.place).replace(HOME_WORKING_WORDS, ' ').replace(/[^a-z]+/g, ' ').trim());\n    const named = bare.filter(Boolean);\n    if (named.length && named.every(text => AMBIGUOUS_STATE_CODES.includes(text))) return verdict('review', 'remote_scoped_to_other_state');\n    if (!named.length && parts.some(one => one.place !== one.part)) return verdict('review', 'remote_eligibility_unconfirmed');\n  }\n  if (reason === 'onsite_outside_allowed_locations' && usHome && has(fold(raw), countryNames) && places(fold(raw)).some(place => REMOTE.test(place) && !NOT_REMOTE.test(place))) return verdict('review', 'remote_eligibility_unconfirmed');\n  return verdict('elsewhere');");
writeFileSync(process.argv[3], s);
