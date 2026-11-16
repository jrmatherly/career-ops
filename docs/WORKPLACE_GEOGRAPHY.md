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
`onsite_countries` and `remote_regions`, may be omitted or null. An empty `onsite_countries` list also uses `remote_countries`
as its default; a supplied nonempty country list must name a recognized country.

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
  as `us` or `by` cannot establish remote-country eligibility.
- When the policy's onsite countries include the United States (`onsite_countries`,
  or `remote_countries` when that is not set), a US state written directly
  beside an allowed onsite location is not read as a foreign country:
  `Chicago, IL`, `Atlanta GA`, `Atlanta, Georgia`, `Albuquerque, New
  Mexico`, and a code before the name when a street address follows or nothing does
  (`GA-ATLANTA, 1 MAIN ST`, `GA-ATLANTA`). `IL` is then not Israel. Such a place is judged
  alone, so another office in the posting (`Atlanta, GA · London, UK`) does
  not make it foreign, and any country it still names decides (`Dublin, GA -
  IE` stays Ireland). A state anywhere else is not read: `Vancouver, BC, CA`
  and `CA-BC-Richmond` stay Canada. Without a state beside the name, the
  whole location decides, as before. There, a state code in capitals
  (`Detroit, 1515 Main Avenue, MS`) and the two-letter words of a street
  address (`999 18th St`, `200 Main Parkway SE Suite 900`) are not read as
  countries. A posting marked remote that names an allowed onsite location
  (`Atlanta or Remote`, or `Atlanta` under a title ending in `(Remote)`) is
  judged as that location first.
- When `remote_countries` includes the United States, a US state confirms a
  remote role. A full state name counts (`Remote - Texas`, `New Jersey -
  Remote`), and so does a state code in capitals (`Remote, TN`, `Remote; Orem,
  UT`), in a place that is not written all in capitals. Five codes never
  count, because boards write them for the country too: `CA`, `CO`, `DE`,
  `IL` and `IN` (`Remote, CA` is Canada as often as California). `Georgia`
  alone is the country; it is the state where its code stands in the same
  place (`GEORGIA - VIRTUAL - GA01`). A foreign country in the same place
  wins (`Remote - Chennai, TN, India`). The cost: a foreign place whose
  region shares a state's letters is admitted when no country is written
  (`Remote - Perth, WA`), and so is a bare code of a country that shares
  them (`Remote, AR` for Argentina).
- Under the same policy these location words mark a remote role as `Remote`
  does: `Virtual`, `Telework`, `Work at Home`, `Working at Home`, `Home
  based`, `Home Office`, `Home Worker`, `Home Teleworkers`, and a place that
  opens with `Home` (`Home-United States`). The role still has to show the
  United States or a state.
- A policy that does not allow the United States reads none of this: a state
  never confirms a remote role there (`Remote - CO`, `Perth, WA` and `Berlin,
  DE` read the same as a US place), and `Home based` is not a remote marker.
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

## Holding instead of dropping

The policy above drops an ineligible posting at scan time. A dashboard
scheduled scan can use the same check without dropping anything: its location
hold, set on the job in Auto mode, keeps an ineligible posting in the Inbox,
ranked and marked **Held: location**, and only skips its automatic evaluation.
The hold has its own two lists (home area and remote countries) and does not
read `location_filter.workplace_policy`. See "Location hold" in
[AUTOMATION.md](AUTOMATION.md).
