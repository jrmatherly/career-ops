# Conditional workplace geography

The location filter runs its tiers in a fixed order: `workplace_policy` first,
then `block_hard`, `always_allow`, `block` and `allow`, then, when every `allow`
and `always_allow` entry is a country name and `strict` is off, a rescue for a
posting whose location is one of the worldwide labels (`worldwide`, `anywhere in
the world`, `remote (worldwide)`), and last `remote_title_fallback`. With a
non-empty `allow` list, a posting whose location is only "Remote" fails unless
`Remote` is in `allow` or the title itself says remote (with
`remote_title_fallback` at its default).
`always_allow: ["United States"]` expands to every US state name and code. The
full comment on each tier is in `templates/portals.example.yml` under
`location_filter`.

An `allow: [Remote]` location filter matches the work arrangement, not the
countries a remote employee may work from. Likewise, allowing a whole country
admits office roles in every city there. To combine a specific office/hybrid
location with remote work from a country, opt into `location_filter.workplace_policy`:

```yaml
location_filter:
  allow: [Barcelona, Spain, Remote, Europe, Worldwide]
  workplace_policy:
    onsite_locations: [Barcelona]
    onsite_countries: [Spain] # defaults to remote_countries
    remote_countries: [Spain] # country names or ISO codes
    remote_regions: [Europe, European Union, EU, EMEA, Worldwide, Anywhere, Global]
```

Europe, the EU and the EEA are different scopes. Add EU/EEA region labels only
when they cover your allowed remote country; these labels do not establish work
authorization. See the [EU Council's EEA overview](https://www.consilium.europa.eu/en/policies/eu-eea-relations/)
and [EFTA's membership FAQ](https://www.efta.int/about-efta/faqs).

The policy is an additional gate before the normal location tiers. It never
rescues a posting the existing `block_hard`, `block` or `allow` rules reject.
Without `workplace_policy`, location matching is unchanged.

Each policy field is a YAML list; bare strings are rejected. `onsite_locations`
and `remote_countries` are required and must be nonempty. The optional fields,
`onsite_countries`, `remote_regions` and `home_states`, may be omitted or null. An empty `onsite_countries` list also uses `remote_countries`
as its default; a supplied nonempty country list must name a recognized country.
`home_states` is a list of US state names or USPS codes (`Georgia`, `GA`). An
entry that names no state is an error, and so is an entry that is blank or is
not text. `buildWorkplacePolicy` throws the error itself, so a caller that
skips `validate-portals.mjs` gets it too. The message shows the entry as
written: `workplace_policy.home_states: "Ontario" is not a US state name or
code`.

- Office and hybrid roles must name an allowed onsite location. An explicit
  foreign country prevents a same-named city from matching.
- Remote roles must show an allowed country or a configured covering region.
  A bare `Remote` label or a timezone requirement is not sufficient evidence.
- Structured applicant-country restrictions and explicit English eligibility
  clauses can narrow a broad label such as `Europe` or `Worldwide`; an explicit
  excluded home country or `UK only` restriction wins.
- Location and structured country fields accept ISO country codes. Description
  prose uses country names, aliases or an ISO token after explicit geography
  such as `must be based in PT` or `work remotely from PT`. Ordinary words such
  as `us` or `by` cannot establish remote-country eligibility. A capital `US`
  in a sentence that has a lower-case letter is read as the United States
  where a clause restricts eligibility, so under a US policy `We are open to
  candidates in the US and Canada.` no longer fails. It is never evidence that
  a remote role is open to the United States: a posting located `Remote` whose
  description says `This is a US national remote role.` stays
  `remote_eligibility_unconfirmed`.
- A scope label is not a restriction. A sentence can open with a country, one
  of `roles`, `positions`, `candidates`, `applicants`, `employees` or `hires`,
  and `only:`, or with `pay ranges for <country> only:`. When an amount of pay
  or a privacy notice follows within 80 characters, the gate takes the label
  out before it looks for restrictions. `Canada-based roles only: $140,000
  CAD` passes under a US policy. `Canada-based candidates only: we cannot hire
  in the US.` still fails, because no pay follows and the sentence has a
  negation. `Canada only: relocation assistance of $10,000 provided.` still
  fails, because the label has none of the six nouns.
- A foreign country followed by `only` is exclusive and fails the posting
  (`UK only`). The country may carry `-based` and one of `candidates`,
  `applicants`, `residents`, `roles`, `positions`, `employees` or `hires`
  (`Canada hires only`). For `roles`, `positions`, `employees` and `hires`, a
  foreign country joined to a home-country name is not exclusive: `USA and
  Canada roles only` passes under a US policy. In a description this covers a
  list of any length that names a home country, so `USA, Canada and Mexico
  roles only` passes too. For the other forms it is
  still exclusive (`USA and Canada candidates only` fails).
- When the policy's onsite countries include the United States (`onsite_countries`,
  or `remote_countries` when that is not set), a US state written directly
  beside an allowed onsite location is not read as a foreign country:
  `Chicago, IL`, `Atlanta GA`, `Atlanta, Georgia`, `Albuquerque, New
  Mexico`, and a code before the name when a street address follows or nothing does
  (`GA-ATLANTA, 1 MAIN ST`, `GA-ATLANTA`). The code before the name may also
  be followed by a space (`GA ATLANTA`). `CA`, `CO`, `DE`, `IL` and `IN` need
  the hyphen, because they are country codes too: `CA-Atlanta` passes and `CA
  Atlanta` is read as Canada. `IL` is then not Israel. Such a place is judged
  alone, so another office in the posting (`Atlanta, GA · London, UK`) does
  not make it foreign, and any country it still names decides (`Dublin, GA -
  IE` stays Ireland). A state anywhere else is not read: `Vancouver, BC, CA`
  and `CA-BC-Richmond` stay Canada. Without a state beside the name, the
  whole location decides, as before. There, a state code in capitals
  other than `CA`, `CO`, `DE`, `IL` and `IN` (`Detroit, 1515 Main Avenue,
  MS`) and the two-letter words of a street
  address (`999 18th St`, `200 Main Parkway SE Suite 900`) are not read as
  countries. A posting marked remote that names an allowed onsite location
  (`Atlanta or Remote`, or `Atlanta` under a title ending in `(Remote)`) is
  judged as that location first.
- When `remote_countries` includes the United States, a US state confirms a
  remote role. A full state name counts (`Remote - Texas`, `New Jersey -
  Remote`), and so does a state code in capitals (`Remote, TN`, `Remote; Orem,
  UT`), in a place that is not written all in capitals. The District of
  Columbia counts as a state does (`Remote, District of Columbia`, `Remote,
  DC`). Five codes do not count alone, because boards write them for the
  country too: `CA`, `CO`, `DE`, `IL` and `IN` (`Remote, CA` is Canada as
  often as California). They count only in a place that also names a state another
  way, by a full state name or by one of the other codes (`Remote; Colorado
  Springs, CO`, where `Colorado` is the name, and `Remote (CA, NY, TX)`;
  `Remote - Denver, CO` is refused). Next to a capital code that is no state
  they are the country (`Remote - Delaware, ON, CA`). `DC` is a state beside
  every code but `CO`, where it is Bogota's district (`Remote - Bogota, DC,
  CO`, Workday's `CO-DC-Bogota`; `Remote (CA, DC)` is admitted). `Georgia` alone is the country; it is the
  state where its code stands in the same place (`GEORGIA - VIRTUAL - GA01`).
  A policy with Georgia in `home_states` reads the word differently (see
  "The state Georgia and the country" below).
  A foreign country in the same place wins (`Remote - Chennai, TN, India`).
  For this check a bar or a spaced slash separates places as a middle dot and
  a semicolon do, so in `Remote | San Francisco, CA | Seattle, WA` the `CA`
  does not refuse the place beside it. `US:`, `U.S` and `U.S.A` are read as the
  United States, and `and` between states, in any case, is the word, not
  Andorra's code.
  The cost is three kinds of foreign posting, admitted when no country is
  written out in the same place: a foreign city followed by a code that is
  also a state code (`Remote - Perth, WA`, `Remote - Tunis, TN`, `Remote -
  Chennai, TN`, `Remote - Bogota, DC`, and `Remote - Chennai, TN, IN`,
  because `IN` is never read as India), a bare code of a country that shares a state's
  letters (`Remote, AR` for Argentina, `Remote, AL` for Albania), and such a
  place beside a foreign one behind a bar or slash (`Remote | Perth, WA |
  Sydney, Australia`). The gate knows no city names, so it cannot tell these
  from US places.
- Under the same policy these location words mark a remote role as `Remote`
  does: `Virtual`, `Telework`, `Work at Home`, `Working at Home`, `Home
  based`, `Home Office`, `Home Worker`, `Home Teleworkers`, `Telecommute`
  (and `Telecommuter`, `Telecommuting`), `Anywhere`, and a place that
  opens with `Home` and a dash or comma (`Home-United States`). The role still has to show the
  United States or a state: `Anywhere, US` passes and `Anywhere` alone is
  `remote_eligibility_unconfirmed`. `not available` after a remote word
  negates it, so `Remote not available - Dallas, TX` is judged as an on-site
  place.
- `home_states` names the US states the owner counts as home. An entry is a
  state name or a USPS code, and `DC` and `District of Columbia` are accepted.
  At the gate the key changes how one word is read. With Georgia listed, the
  word `Georgia` in a remote location is the state, unless the location shows
  that it is the country: `Remote - Georgia` passes and `Remote - Tbilisi,
  Georgia` fails. The same holds for the word in a restriction (see "Georgia
  in a restriction" below). Every other state is read without an entry. `locationVerdict` reads
  the key for every state (see "`locationVerdict` sorts every posting into
  three tiers" below).
- Which list turns on which rule: the two bullets above read
  `remote_countries` alone. The bullet before them reads the onsite
  countries, so a policy with `onsite_countries: [United States]` and other
  `remote_countries` gets its rules (the state beside a home place, the state
  codes and address words in the whole-location check, and the home place
  judged first in a posting marked remote) and not the remote ones. A policy
  with the United States in neither list reads none of this: a state never
  confirms a remote role there (`Remote - CO`, `Perth, WA` and `Berlin, DE`
  read the same as a US place), and `Home based` is not a remote marker.
- Timezone abbreviations in hours/overlap wording do not count as countries.
  A region qualified by "where we have a hiring presence" needs separate
  evidence that the allowed remote country is eligible.

Normal scans, full ATS scans and shared admission gates use the same check.
Dayforce rechecks the policy against its detail description without repeating
legacy location matching on a changed detail location.
Discover retains the saved policy in its temporary filters and carries provider
geography evidence through its results. Add to Inbox checks the current policy
again before either canonical writer runs. A mixed incompatible selection adds
nothing and explains the rejection, so retry compatible roles separately.
Today rechecks saved history using its stored title and location; old history
rows do not retain full descriptions or applicant-country metadata.

This is a conservative deterministic filter, not universal interpretation of
job-description prose or proof of visa/work authorization. Unsupported or
ambiguous location wording may withhold an eligible role; review the original
posting before changing your policy. The policy belongs in user-owned
`portals.yml`; updates preserve it, and no existing Inbox/history rows are
rewritten automatically.

## The state Georgia and the country

Boards write the US state and the country the same way, as `Georgia`. Under a
policy with the United States in `remote_countries`, the gate gives the word
one of three readings in each place that has it. A place is one part of the
location between middle dots, semicolons, bars or spaced slashes. The examples
use this policy:

```yaml
workplace_policy:
  onsite_locations: [Atlanta, Alpharetta, Marietta, Johns Creek]
  remote_countries: [United States]
  home_states: [Georgia]
```

| Reading | What decides it | Example |
| --- | --- | --- |
| country | The place names a Georgian city (Tbilisi, Batumi, Kutaisi, Rustavi), says `Republic of Georgia` or `Georgia (country)`, or has a region word (EMEA, Europe, EU, Caucasus, CIS). Or the place names nothing but Georgia and a remote word, and every other place in the location is foreign. Or the place names nothing but Georgia and a remote word, and another place names a Georgian city, `Republic of Georgia` or `Georgia (country)`, whatever else the location lists | `Remote - Tbilisi, Georgia`, `Remote - Georgia, EMEA`, `Poland · Georgia · Bulgaria · Romania · Remote`, `Remote - Georgia · Remote - Texas · Remote - Tbilisi` |
| state | The place also names a home place, another US state or the code `GA`. Or another place in the location is in the United States and the country rule for a Georgian city does not apply. Or no other place is foreign or possibly foreign, which covers a location with no other place and one whose other places the gate cannot identify | `Remote - Georgia or Florida`, `Georgia - Remote; Tennessee - Remote`, `Remote, Georgia`, `Remote - Georgia · Remote - Austin` |
| unsure | Anything else: Georgia with a city the gate does not know beside a foreign place, or Georgia alone beside a possibly foreign place or beside a mix of unknown and foreign places | `Remote - Savannah, Georgia · Remote - Poland`, `Remote - Georgia · Remote - CA`, `Remote - Georgia · Remote - Austin · Remote - Canada` |

A place is possibly foreign when it is `CA`, `CO`, `DE`, `IL` or `IN` with no
city, or a US state beside a country's name (`Panama City, FL`).

What each reading does:

| Reading | Gate, Georgia in `home_states` | Gate, no `home_states` | Verdict tier |
| --- | --- | --- | --- |
| country | `Remote - Tbilisi, Georgia` is not eligible, `remote_country_restricted` | The same | `elsewhere` |
| state | `Remote - Georgia` is eligible, `remote_region_allowed` | The word stays the country, as it was before the key existed, unless the code `GA` stands in the same place. `Remote - Georgia` is not eligible, `remote_country_restricted` | `fit` with Georgia in `home_states`. `review`, `remote_scoped_to_other_state`, without |
| unsure | `Remote - Georgia · Remote - CA` is not eligible, `remote_country_restricted` | The same | `review`, `remote_scoped_to_other_state` |

An unsure Georgia is not eligible at the gate, and it is `review` in the
verdict. So a path that drops on the gate drops the posting. A scan with
`workplace_policy` on is such a path. A caller that reads `locationVerdict`
keeps the posting for review.

Three things hold under every reading:

- The home country decides first. `Remote - Georgia, United States` is
  eligible with or without `home_states`, and so is `Remote - Tbilisi, Georgia
  · Remote - United States`, as any list of countries that has the home
  country is.
- Beside Georgia's name alone, `Turkey` is the country: `Remote - Georgia,
  Turkey` is `elsewhere`. Beside a state code or another state's name it is
  the US town (`Remote - Turkey, GA`, `Remote - Turkey, TX`).
- The gate's on-site branch does not use the reading. The verdict does:
  `Tbilisi, Georgia` is `elsewhere`, and `Columbus, Georgia` is `review` with
  Georgia in `home_states`.

### Georgia in a restriction

With Georgia in `home_states`, the gate reads the word `Georgia` in a
restriction as the home country. A restriction is a description clause the
gate checks, or an "only" phrase in the description or the location. Under
`Remote - United States` these descriptions pass: `Georgia residents only`,
`Must be based in Georgia` and `Candidates must reside in Georgia or Florida`.
The locations `Remote (Georgia only)` and `Remote - Georgia only` are `fit`.
Without the key each one fails as a foreign country.

The word is home only in a sentence that names no other country and no
exclusion word (`not`, `no`, `cannot`, `can't`, `unable`, `except`,
`excluding`, `exclude`, `excluded`, `ineligible`, `outside`). The location and
the whole description must also name no Georgian place: a Georgian city,
`Republic of Georgia`, `the country of Georgia` or `Georgia (the country)`.
`Must be based in Georgia or Florida` passes, while `Must be based in Georgia
or Armenia`, `This role is not open to Georgia residents` and `Georgia
residents only. We are a Tbilisi startup.` fail as the country.

The word also stays the country in two more cases:

- The location reads its own Georgia as the country. `Remote - Tbilisi,
  Georgia` with `Must be based in Georgia` fails,
  `description_country_restricted`.
- The sentence names a region word (EMEA, Europe, EU, Caucasus, CIS). `Must
  be based in Georgia (Caucasus)` fails, `description_country_restricted`.

The reading does not confirm a remote role. `Remote` with `Must be based in
Georgia` is `review`, `remote_eligibility_unconfirmed`.

## Country spellings, US territories and timezone abbreviations

The gate takes its country names from `Intl.DisplayNames`. It adds the
spellings boards use that those names lack: Turkey, Czech Republic, Hong Kong,
Macau, Macao, Ivory Coast, Burma, Myanmar, Swaziland, East Timor and
Democratic Republic of the Congo. The additions apply under every policy, in
locations and in description text. `England` is not read inside `New
England`.

`UAE` and `DRC` are read only where the gate reads country codes: in a
location, in a country-list field, and in the place after `must be based in`.
`Remote - UAE` is `remote_country_restricted`. Elsewhere in a description they
are not countries, because `DRC` is also a design-rule check and `UAE Pass` is
a sign-in service. `Run DRC only after LVS is clean` passes.

Puerto Rico, Guam, American Samoa and the Northern Mariana Islands count as
US places when the gate picks a Georgia reading, so `Remote - Georgia · Remote
- Puerto Rico` reads Georgia as the state. The US Virgin Islands count through
the `US` in the name. Alone, a territory is still foreign to the gate:
`Remote - Puerto Rico` is `remote_country_restricted`. The verdict makes it
`review`.

Under a US policy the gate strips US timezone abbreviations from a remote
place that names a US state, and from a home place with its state beside it.
It strips `ET`, `EST`, `EDT`, `CST`, `CDT`, `MST`, `MDT`, `PT`, `PST` and
`PDT`, in brackets or after a dash or comma that closes the place, alone or
joined by slashes: `Remote - Texas (EST)`, `Remote - Florida, ET`, `Remote -
Texas (EST/CST)`, `Atlanta, GA (ET)`. Without the strip `EST` is Estonia, `ET`
is Ethiopia and `PT` is Portugal. A place with no state keeps its
abbreviation, so `Remote - Lisbon (PT)` is still Portugal. `CT` and `MT` are
left alone because they are the state codes of Connecticut and Montana.

## `locationVerdict` sorts every posting into three tiers

The gate answers eligible or not. `locationVerdict(gate, location, title,
offer)`, exported from `providers/_country.mjs` beside `LOCATION_TIERS`, asks
the gate and returns `{ tier, reason }`. No shipped code calls it yet.

- `fit` is a place the policy allows.
- `review` is a place the owner may still want, which the gate cannot settle.
- `elsewhere` is a place the policy rules out.

The reason is the gate's own reason or one of three the verdict adds. All
three are `review`.

| Reason | When | Example |
| --- | --- | --- |
| `location_names_no_place` | An on-site location that names no specific place: the home country alone, a count of locations, or one state with no city | `United States`, `5 Locations`, `Georgia, USA` |
| `remote_scoped_to_other_state` | The gate admits a remote role whose location names US states, none of them a home state, and no part of it is country-wide. Also a location the gate refuses that would pass if a Georgia that may be the state were one, or if a place written in capitals were not. Also a remote location the gate refuses as another country, in which one place reads as a US place and none reads as foreign. A US place here is a city beside `CA`, `CO`, `DE`, `IL` or `IN`, a home place, or a US territory. This last rule applies only when the United States is a home country | `Remote, TN`, `Remote, CA, USA`, `REMOTE, TN`, an unsure Georgia, `Remote - Denver, CO`, `San Francisco, CA · Remote` |
| `onsite_in_home_state` | An on-site place in a home state that `onsite_locations` does not name | `Kennesaw, GA` |

The gate's `location_unknown` and `remote_eligibility_unconfirmed` are
`review` too. So is `onsite_country_restricted`. The gate gives that reason
only after it found a home place in the location, so the posting names the
owner's town beside something that reads as another country: `Atlanta, GA or
London, UK`, `San Francisco, CA / Atlanta, GA`. Every other reason the gate
gives for refusing is `elsewhere`.

`home_states` changes three answers:

- With no `home_states`, any single state counts. A state-only location
  (`Texas`) and a state-scoped remote role (`Remote, GA`) are both `review`.
- With Georgia in `home_states`, `Georgia` alone is `review` and `Texas` alone
  is `elsewhere`. `Remote, GA` is `fit` and `Remote, TN` stays `review`.
- With Georgia in `home_states`, an on-site place in Georgia outside
  `onsite_locations` is `review` (`Kennesaw, GA`, `Savannah, Georgia`).
  Without the key it is `elsewhere`.

The verdict reads a place the way the gate does. Both split a location into
places with one function, both read no state code in a place written all in
capitals, both use the same Georgia reading, and the verdict strips timezones
with the gate's own stripper (`gate.geographyText`).
`tests/location-verdict-gate-agreement.test.mjs` pins the agreement.

The two disagree on purpose. `Remote, TN` is eligible at the gate and `review`
in the verdict. These are not eligible at the gate and `review` in the
verdict: an unsure Georgia, a state code in an all-capitals place (`REMOTE,
TN`), a US city beside a code that is also a country's (`Remote - Denver,
CO`), and a home place the gate refuses for what stands beside it (`Atlanta,
GA or London, UK`).

## What the gate function carries

`buildWorkplacePolicy(policy)` returns the gate, `gate(location, title,
offer)`, which answers `{ eligible, reason }`. The function also carries four
read-only properties. `locationVerdict` is their only reader. A gate built
with no policy carries none of them, and its verdict is `fit`,
`policy_absent`.

| Property | Holds | Read for |
| --- | --- | --- |
| `gate.homeStates` | The USPS codes of `home_states`, in lower case, without duplicates. Empty when the key is absent | Which states are home |
| `gate.homeCountryNames` | The names, spellings and ISO codes of the `remote_countries`, folded to lower case, longest first | Whether a place names the home country |
| `gate.homePlaces` | The `onsite_locations`, folded to lower case | The Georgia reading |
| `gate.geographyText` | A function that takes one place and returns it without timezone phrases (`MT working hours`) and without the US timezone abbreviations above. It strips an abbreviation without checking that the place names a US state (`Remote - Estonia (EST)` loses its `(EST)`), so call it only on a place that does | Reading a place as the gate reads it |

## Known limits

Each line was run against the gate under the Georgia policy above. The first
three have one cause, which is that the gate has no list of cities.

- A city the gate does not know is not evidence of a foreign place. `Remote -
  Georgia · Remote - Warsaw` is `fit`.
- A city beside `CA`, `CO`, `DE`, `IL` or `IN` reads as a US place when the
  gate picks a Georgia reading. `Remote - Georgia · Toronto, CA` is `fit`.
- Alone in a remote location, the same city and code are not eligible at the
  gate, and the verdict makes them `review` whether the city is in the United
  States or not. `Remote - Denver, CO`, `Remote - Berlin, DE` and `Remote -
  Tel Aviv, IL` are all `review`. So is `Remote Europe - DE`, because the
  verdict takes `Europe` for the city.
- One of the five codes with no city is the country. `Remote, CA`, `Remote,
  DE` and `Remote - IL` are `elsewhere`.
- Holland, Wales, Scotland and Palestine are not read as countries, because
  each is also a US town (`Holland, MI`). `Remote - Georgia · Remote -
  Holland` is `fit`. Korea and Congo without their full names are not read
  either: `Remote - Korea` is `review`.
- A region word beside Georgia makes it the country, even after `or`. `Remote
  - Georgia or Europe` is `elsewhere`.
- `Remote - Turkey Creek, Georgia` is `elsewhere`, because Turkey beside
  Georgia's name is the country. `Remote - Turkey Creek, GA` is `fit`.
- A US town named after a country is read as the country. `Remote - Russia,
  OH` is `elsewhere`. Turkey is the one exception, and only beside a state
  code that counts alone: `Remote - Turkey, TX` is eligible and `Remote -
  Turkey Run, IN` is `elsewhere`.
- A home place the gate refuses is `review`, never `fit`. `Atlanta (Georgia)`
  and `Atlanta - Georgia` are refused because the state in brackets or after
  a dash reads as the country. `Atlanta (ET)` is refused because a timezone
  with no state beside it reads as Ethiopia.
- A timezone abbreviation with no US place is a country code. `Remote - EST`
  and `Remote - ET` are `elsewhere`, as Estonia and Ethiopia.
- A placeholder is an on-site place outside the home area. `N/A`, `Not
  specified` and `Flexible` are `elsewhere`.
- A US territory alone is not a home place. `Remote - Puerto Rico` is not
  eligible at the gate and `review` in the verdict, and `San Juan, PR` is
  `elsewhere`.
- A region word in another place does not make a bare Georgia the country
  when a US state is listed too. `Remote - Georgia · Remote - Texas · Remote -
  Europe` is `fit`. A Georgia with a city beside it is not covered by the
  Georgian-city rule either: `Remote - Savannah, Georgia · Remote - Texas ·
  Remote - Tbilisi` is `fit`.
- With Georgia in `home_states`, a description that shuts Georgia out still
  passes. `Georgia residents are not eligible` and `Not available in Georgia`
  are `fit` under `Remote - United States`.
- A location with no Georgia of its own does not make a description's Georgia
  the country. `Remote - Europe` with `Must be based in Georgia` is `review`,
  not `elsewhere`.
- `home_states` has no effect under a policy whose home country is not the
  United States. With `remote_countries: [Spain]` and `home_states:
  [Georgia]`, `Remote - Georgia` and `Remote, GA` are `elsewhere`.
- `turkey` in lower case is the country in a restriction clause. `Candidates
  must be willing to quit legacy tooling cold turkey` fails,
  `description_country_restricted`.
- A bracket that joins `CT` or `MT` to another abbreviation is not stripped.
  `Remote - Georgia (ET/CT)` is `elsewhere`.
- A place written all in capitals is `review` at best. `REMOTE, GA` and
  `REMOTE - GEORGIA · REMOTE - TN` are `review`, not `fit`. A foreign city
  beside a code that is also a state code is `review` too (`REMOTE - VALLETTA,
  MT`).
- A US place beside a foreign office can make Georgia unsure. `Remote -
  Georgia · Jersey City, NJ · London, UK` is `review`, because Jersey is a
  country to the gate.
- A spaced code before a home place is read as a state even when it is also a
  country code other than the five above. `AR Atlanta` is eligible.
- A scope label with an accented country name is not stripped.
  `México-based roles only: $40,000 MXN` fails under a US policy.
- `Excluding US holidays` and `not US-based` in a description fail the posting
  as `candidate_country_excluded`.

## Holding instead of dropping

The policy above drops an ineligible posting at scan time. A dashboard
scheduled scan can use the same check without dropping anything: its location
hold, set on the job in Auto mode, keeps an ineligible posting in the Inbox,
ranked and marked **Held: location**, and only skips its automatic evaluation.
The hold has its own two lists (home area and remote countries) and does not
read `location_filter.workplace_policy`. See "Location hold" in
[AUTOMATION.md](AUTOMATION.md).
