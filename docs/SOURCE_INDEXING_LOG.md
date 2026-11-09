# Source Indexing Log

Every source that goes through the [Source Indexing Policy](../CONTRIBUTING.md#source-indexing-policy) gets an entry here: what was proposed, who proposed it, which rules were checked, and how they were verified. The point is that a stranger can reconstruct any decision from the outside without asking anyone.

Two things this log deliberately is not: a ranking, and a promise. Rule 4 says it plainly — indexing is not endorsement, and distribution is not owed.

**How to read an entry.** "Verified" means someone ran a command and reported the output, not that a claim was accepted. Where a check could only be done against a live endpoint, the entry says what was sampled and when, because live checks expire: a source that passed in August can drift in November, and re-verification is normal rather than an accusation.

**Adding an entry.** A source is logged when its provider merges. Anyone can open a [source proposal](https://github.com/career-ops-hq/career-ops/issues/new?template=source-proposal.yml); the discussion happens in the issue and the PR, and this file is the durable summary with links back to both.

---

## Rule 6 changed (2026-11-08)

Until 2026-11-08, rule 6 made a source's `robots.txt` a gate: a `Disallow` covering the listing paths a provider reads was a stop. It no longer is. `robots.txt` is written for crawlers that index or copy a site; a provider reads a posting on one person's machine so that person can understand it and, if it fits, apply on the employer's page. What stays a stop: a login or a user account, a CAPTCHA, and an operator who asks career-ops not to read their source ([open an issue](https://github.com/career-ops-hq/career-ops/issues/new) to ask).

The rule 6 notes in the entries below stay as the record of the old rule. The sources it kept out or narrowed (Lagou, TopDev, CareerLink and TurboHire in [Evaluated, not supported](SUPPORTED_JOB_BOARDS.md#evaluated-not-supported); jobspresso's feed path; Google's first results page) can come back, or be widened, through a source proposal or a PR. Thanks to @benbalter for the rule 6 checks in #5774 and #5776: they are why each of those cases is easy to find.

---

## remotli.ch

| | |
|---|---|
| **Proposed by** | @eliador90, **who operates the source** (declared in the proposal) |
| **Provider** | `providers/remotli.mjs` |
| **PR** | [#2465](https://github.com/santifer/career-ops/pull/2465) · issue [#2464](https://github.com/santifer/career-ops/issues/2464) |
| **Merged** | 2026-08-07 |
| **Status** | Listed |

First source reviewed under the written policy. The operator proposing their own board is exactly the case the rules exist for: the disclosure came first, and the rules decided rather than a conversation.

**Rule 1 (real listings, identifiable employer, free for candidates).** Verified: listings resolve to named employers, no candidate-side paywall or registration on the source.

**Rule 2 (canonical URL is the employer's).** The provider prefers each listing's upstream `applyUrl` and falls back to the board page only when that is missing or not `https:`. Verified by sampling 121 rows across pages 1, 9 and 19 of the live feed: zero rows without an employer URL, zero non-https, zero pointing back at remotli.ch. The host distribution was ordinary employer infrastructure (Greenhouse, Workday, Ashby, Lever, Recruitee, company career pages), with no tracking hop in between.

**Rule 3 (complete inventory, no paid placement).** The operator disclosed a coverage gap in his own proposal: without the `remote=all` parameter the feed serves 392 of 921 roles, 42.6% of the board. The merged provider walks all 19 pages. No promoted or sponsored field exists in the payload.

**Rule 4 (operator declared).** The [supported boards table](SUPPORTED_JOB_BOARDS.md) row carries `operator: eliador90` with a link to this policy.

**Rule 5 (aggregation stays in core).** The provider reads its own source only. Ranking and cross-source work stay where they always were.

**Also checked, outside the policy:** zero-auth (a plain `curl` with no key, cookie or session returns the feed), and two HIGH CodeQL alerts raised in review were resolved before merge.

---

## a16z speedrun talent network

| | |
|---|---|
| **Proposed by** | @justma16ze (community contributor, not affiliated with the source) |
| **Provider** | `providers/a16z-speedrun-talent.mjs` |
| **PR** | [#2231](https://github.com/santifer/career-ops/pull/2231) |
| **Merged** | 2026-07-29 |
| **Status** | Listed |

Merged before the policy was written, and logged here because it is the case that prompted writing it: a large, well-connected talent network is exactly where "does indexing imply endorsement?" stops being theoretical.

**Rule 3, retroactively.** Two coverage defects were found and fixed after listing, both by contributors reading the live feed rather than the code: the page size was set to 100 while the feed serves 50, so the fetch stopped silently after one page ([#2419](https://github.com/santifer/career-ops/pull/2419)), and a single transient upstream failure aborted the whole board fetch ([#2506](https://github.com/santifer/career-ops/issues/2506)). Both are the failure mode rule 3 targets: partial coverage that reads as complete.

**Rule 4.** Listed with its operator declared. Rule 4's 40% ceiling exists so no single source, however large, dominates the registry.

## theirstack.com (retired from the plugin registry)

| | |
|---|---|
| **Proposed by** | @d-ulker (registration issue [#1697](https://github.com/career-ops-hq/career-ops/issues/1697)); plugin published by @uelkerd |
| **Plugin** | `career-ops-plugin-theirstack` (community plugin, `provider` hook, `THEIRSTACK_API_KEY`) |
| **Listed** | 2026-07-07, before this policy existed (2026-08-04) |
| **Retired** | 2026-09-05 |
| **Status** | Not listed. The plugin remains published in its own repository; the registry is only what the project lists. |

Re-read against the written policy after a second source of the same shape asked to be listed (JobsPipe, [#3841](https://github.com/career-ops-hq/career-ops/pull/3841)), so that the two answers match.

**Rule 1 (real listings, identifiable employer, free for candidates).** Not met as a listed source: access to the listings goes through a metered, paid API on the job seeker's side, and a free tier does not change that. Manifesto right 4 (*"You never pay"*) applied to sources is the whole of this rule; it has no free-tier exception.

**Rule 5 (aggregation belongs to the project).** The value of the source is a cross-source feed ("50k+ sources"), which is the layer the policy keeps in core.

**Rules 2, 3 and 4.** Not re-verified: rule 1 decides on its own. Rule 4 is worth restating for the record: indexing is not endorsement, and retiring a listing is not a judgement on the product.

---

## Public Telegram channels (t.me/s/ preview)

| | |
|---|---|
| **Proposed by** | @nikitacometa, who operates none of the channels measured |
| **Provider** | `providers/telegram-channel.mjs` |
| **PR** | [#3668](https://github.com/career-ops-hq/career-ops/pull/3668) · issue [#3701](https://github.com/career-ops-hq/career-ops/issues/3701) |
| **Merged** | 2026-09-05 |
| **Status** | Provider listed; no channel is listed. The shipped `job_boards:` entry is a disabled template, and a channel added to the registry gets its operator declared per channel. |

First source of a new kind: not a board with a feed, but a transport (Telegram) carrying channels whose posts are written by hand. A board guarantees rules 1 and 2 by construction; a channel only satisfies them post by post, so the provider was asked to measure before it was read, and the measurement became its contract.

**What was measured.** 17 channels with a public preview (10 RU/CIS, 7 EN), 809 posts, up to 3 pages each, on 2026-09-03, with every surviving link opened by hand (137 links).

| | RU/CIS (461 job posts, 77 CV posts) | EN (271 posts) |
|---|---|---|
| post names an employer (`Компания:` / `Company:` line, `Title @ Employer`, `Title \| Employer`, a second line `в Employer —`) | 45% | 4% |
| post links outside Telegram and the vk/max footers | 70% | 74% |
| both, after dropping homepages, forms, shorteners, LinkedIn posts, pages with no vacancy evidence, hidden employers and multi-vacancy digests | **25% (137 posts)** | **0** |

The pass rate is each channel's editorial shape, not noise: @data_science_job 77% (every post is `Title [Remote] @ Employer` plus a getmatch page), @ai_rabota 42%, @jobforjunior 42%, @job_python 35%, @backend_job_geeklink 32%; @devjobs 2%, @datasciencejobs, @theyseeku and @itjobs_ru 0% (a recruiter named instead of an employer, or an employer named with nothing linked). The EN channels in the sample mirror boards the project already scans (remoteok, weworkremotely, arbeitnow) or link only through shorteners, so they pass 0 and lose nothing.

**Rule 1 (real listings, identifiable employer, free for candidates).** The provider enforces employer-name and qualifying vacancy-link checks. `company` is that employer, never the channel and never the link's hostname; the 77 CV posts and every post naming a recruiter, an agency client or "название скрыто" are dropped. Manual review found no candidate-side paywall on the 137 sampled links. Free candidate access is an observation from that sample, not a runtime check or a guarantee for later posts.

**Rule 2 (canonical URL is the employer's).** `url` is the vacancy link the post carries: a vacancy page on the employer's own https host first, then a known board's per-vacancy page (getmatch.ru, finder.work, geekjob.ru, geeklink.io, hh.ru, linkedin.com/jobs/view). Rejected: t.me, social and footer hosts, shorteners, forms, homepages and listing roots, employer pages with no vacancy evidence, plain http. Of the 137 emitted links, 53 are employer vacancy pages and 84 board per-vacancy pages. The t.me permalink is secondary attribution only, carried as a trailing `Source:` line; a post with no external vacancy link is not emitted at all.

**Rule 3 (complete inventory, no paid placement).** The provider pages the public `t.me/s/` preview newest first through the `since_days` window; `max_pages` is a safety cap that warns when it cuts the window short. Accepted posts retain their HTML order within each preview page; pages are fetched from newest to older, without globally sorting the emitted jobs. Whether an operator sells posts to employers is not visible in provider data and remains unverified. A paid post can pass the same employer-and-vacancy-link checks as any other post, so those checks do not establish the absence of paid promotion.

**Rule 4 (operator declared).** Per channel, not per transport: the registry names the channel, and the shipped example is disabled. Indexing a channel is not endorsement of its operator.

**Rule 5 (aggregation stays in core).** The provider reads one channel per entry and does no cross-source work. The one change outside the provider, `aggregator: true` in `scan.mjs`, only switches off cross-employer title dedup for a feed that names itself as the company; dedup, ranking and matching stay where they were.

**The bar for the next channel proposal**, so it is written down: measure the channel (share of posts naming an employer, share linking a vacancy page, what survives both), name its operator, and expect the provider to drop the rest. A channel below roughly a quarter passing is the channel's editorial choice, and the provider will read it correctly and emit little.

**Re-measured 2026-10-31: positional employer shapes and the Habr Career fix.** 51 public RU/CIS channels, 3 preview pages each, 2,973 posts, saved once and replayed before and after the change. Two things kept posts that already met rules 1 and 2 from being emitted:

- Every `career.habr.com` vacancy link was refused. `habr.com` is on the non-apply list as a long-read host, and the subdomain matched it before the board list was checked. All the Proglib channels link there. The board list is now checked first: 98 of the newly emitted posts link to Habr Career.
- Many channel templates name the employer by position, not by label: `Employer ищет …` (Proglib, POSTER), `Title в Employer` on the title line (offerclaw, Remocate and Sparkles mirrors), a second line `Employer is a …` (the EN template of @geekjobs and its siblings), and a finder.work mirror's employer on the line after the salary. These four shapes run only after the five marked shapes find nothing. Because a position is weaker evidence than a label, each capture is also refused when it reads as a role, a sector or unit ("в FinTech", "в команду CDP"), a department, a work format ("Удаленно (Москва)", "Relocation available"), a contract term, a person (a Russian patronymic), a year, a destination ("с переездом в Дубай"), a declined place name ("в Лиссабоне"), a city or region standing alone ("в Алматы", "Москва" after the salary line), a phrase ("в Чехии или Испании"), or a `в` inside a quoted title. `Title / Employer` and `Title — Employer` were measured too and left out: they carried 27 posts and most of the review findings, and wait for a shared candidate filter of their own.

A post is also dropped when it says, anywhere in the text, that the employer's name is withheld ("название компании-заказчика не раскрыто", "неназванной финтех-организации"). On Proglib that sentence follows a first line naming the agency. A post that withholds something else ("Зарплата не раскрыта") is kept.

| | before | after |
|---|---|---|
| posts emitted | 284 | 621 |
| previously emitted posts with the same company, url and title | — | 271 of 284 |
| previously emitted posts now refused | — | 13: 12 that name no employer (`Worldwide 🌏` ×10 and `NDA` read from the hashtag template and a `Компания:` label, `Custom Software Development`, a line of business), and 1 that linked a Remocate page, read until now as the employer's own site |

The 350 new posts name 227 distinct employers. Each employer name was reviewed by hand against its post, and the false attributions found were turned into the refusals above, each with a test. The links were not opened one by one: they pass the current `classifyLink()` rules, including the Habr Career path rule and the mirror-host changes, with ingamejob.com added to the board list (2 of the new posts). Habr Career, on the board list since the provider was merged, was checked on 2026-11-04 on a random 15 of the 107 Habr Career links emitted at the time: 11 were live vacancy pages naming the same employer as the post, with an "Откликнуться" button; 4 had closed since the corpus was saved (2 answer 404, 2 are archived), which is what `check-liveness.mjs` is for. Two of the 13 readable pages name a recruiting agency, Top Selection, as the company and say nothing about a client; the source cannot tell those apart from the agency hiring for itself. Applying needs neither an account nor a payment: on two of the sampled vacancies, checked by hand, "Откликнуться" opens a plain application form behind a captcha.

**Hosts refused instead (`UNDECLARED_HOSTS`).** A host that is on no list is read as the employer's own site whenever its path looks like a vacancy, so a mirror left off the board list still passes, as the employer. Four hosts the measured channels link are refused outright: remocate.app (a relocation job board; its "Apply Now" redirects to the employer's own ATS, but its operator is not named on the site and has been asked), offerclaw.app (unreachable while measured, so neither its operator nor candidate access could be checked), vseti.app (a vacancy aggregator whose page the posts carry in place of the employer's link, which source rules 2 and 5 keep out), and hellowehire.com (a shared ATS for freelance recruiters, run by Plus8Soft; a vacancy page there is a recruiter's intake form, and its employer field is often blank). In the corpus they carry 173 otherwise attributable posts (112, 54, 6 and 1). A mirror moves to the board list in its own PR once its operator is declared here.

**Board mirror added to the board list (rule 4).** A post that links a mirror's vacancy page rather than the employer's own is emitted with the mirror page as `url`, so the mirror host is declared here with its operator.

- **ingamejob.com** (InGame Job, a games-industry job board). Operator: InGameJob OÜ, Tallinn, Estonia, named with its address in the site's [privacy policy](https://ingamejob.com/privacy); Estonian registry code 14769069, active; the same policy gives a contact address at the site's own domain. Rule 1: a vacancy page is free to read without an account, and the apply form on it (name, e-mail, message, PDF CV) needs no sign-in and no payment. What the site sells is on the employer side (job credits, candidate-database access, boosters). Rule 2: the post links the InGame Job vacancy page, whose apply form is the application path; it is the `url`. Rule 3: paid boosters ("Top", "Hot", "Premium") put a job at the top of the site's search and in its newsletters and social channels, and the site lists jobs posted on it ahead of the vacancies it aggregates. None of that reaches career-ops, which reads each Telegram post the same way and ranks on the user's machine. Rule 6: `User-agent: *` disallows only `/away/` and `/email/`, with `Crawl-delay: 5`; the provider never fetches the vacancy page. Checked 2026-11-03; no out-of-band confirmation from the operator yet.

Still out of reach by design: posts whose only application path is a Telegram contact or an e-mail address, digests carrying several vacancy links, and channels that link only through teletype or telegra.ph.

---

## Computrabajo

| | |
|---|---|
| **Proposed by** | @configurowebmax (community contributor; no affiliation with the source declared) |
| **Provider** | `providers/computrabajo.mjs` |
| **PR** | [#2650](https://github.com/career-ops-hq/career-ops/pull/2650) |
| **Merged** | 2026-10-23 |
| **Status** | Provider listed; the shipped `job_boards:` entry is `enabled: false`. |

A general job board with one host per Latin American country. Only the Colombian host was measured: one GET of `https://co.computrabajo.com/trabajo-de-sistemas` on 2026-10-23, no key, cookie or session, career-ops' default User-Agent: HTTP 200, 20 posting cards.

**Rule 1 (real listings, identifiable employer, free for candidates).** Employer attribution, measured: 17 of the 20 cards name an employer; 3 show "Importante empresa del sector" (hidden employer), which the provider emits as `?`. Several named employers are staffing agencies rather than the hiring company. Free for candidates: met. Creating an account and applying cost nothing ("Registro gratuito" on `co.computrabajo.com`, read 2026-10-23); applying goes through a free candidate sign-in. Computrabajo also sells candidates an optional "Cuenta Premium" (`co.computrabajo.com/cuenta-premium/`, about COP 12,000 a month on 2026-10-23) that, among other things, puts the profile in the first positions employers see and allows applying more than once to the same vacancy. Applying does not require it. career-ops does not use, link to or recommend that plan: the provider only reads public listings and links each posting page.

**Rule 2 (canonical URL is the employer's).** The listing card carries no employer or ATS URL, only the board's own posting page, so `url` is that page (fragment dropped). Whether the posting page links on to the employer: unverified.

**Rule 3 (complete inventory, no paid placement).** Partly met, flagged for the maintainer. Employers can pay Computrabajo (not career-ops) to feature a posting as "Empleo destacado", and the board interleaves those cards in every sort order: 9 of 20 in the default "Relevancia" order and 11 of 20 in the "Fecha" order (`?by=publicationtime`), measured on 2026-10-23. There is no order without them, and they are real postings by real employers, so the provider keeps them. It requests the "Fecha" order so the newest postings come first, keeps every card it reads, does no ranking of its own, and stops at 3 pages / 15 postings by design. career-ops receives nothing from Computrabajo or from any employer. Pagination (`?p=N`) is unverified.

**Rule 4 (operator declared).** Operator not declared in the PR; unverified.

**Rule 5 (aggregation stays in core).** Verified in code: the provider reads one search URL per entry, on a `<country>.computrabajo.com` host only.

**Rule 6 (`robots.txt`).** Checked on 2026-10-23: one GET of `https://co.computrabajo.com/robots.txt` with career-ops' default User-Agent, HTTP 200, a single `User-agent: *` group. Its `Disallow` lines cover `/ofertas-de-trabajo/` with filter parameters (`*by=`, `*pubdate=`, ...), `/hojas-de-vida/`, `/curriculums/`, `/empresas/` filters, `/Ajax/`, `/_services/` and `/go/`; none covers the search page the provider fetches (`/trabajo-de-sistemas?by=publicationtime&p=N`). A configured search URL under `/ofertas-de-trabajo/` would fall under the `*by=` rule once the provider adds `by=publicationtime`; the shipped entry's path is not under it. Other country hosts: unverified.

---

## ElEmpleo (not listed)

Proposed in [#2650](https://github.com/career-ops-hq/career-ops/pull/2650) together with Computrabajo and Magneto365, and taken out of it on 2026-10-23. The comments in `https://www.elempleo.com/robots.txt` (read 2026-10-23) say that extracting or scraping its content by automated means is prohibited without ELEMPLEO's prior written permission. A provider reads the board by automated means, so it is not listed. The provider code stays in the history of #2650 (`providers/elempleo.mjs` at e40e148) in case ELEMPLEO gives that permission.

## Magneto365

| | |
|---|---|
| **Proposed by** | @configurowebmax (community contributor; no affiliation with the source declared) |
| **Provider** | `providers/magneto.mjs` |
| **PR** | [#2650](https://github.com/career-ops-hq/career-ops/pull/2650) |
| **Merged** | 2026-10-23 |
| **Status** | Provider listed; the shipped `job_boards:` entry is `enabled: false`. |

A general job board for Colombia. Measured: one GET of `https://www.magneto365.com/co/trabajos/buscar/tecnologia` on 2026-10-23, no key, cookie or session, career-ops' default User-Agent: HTTP 200, 20 job cards, pager links up to page 20.

**Rule 1 (real listings, identifiable employer, free for candidates).** Employer attribution, measured: 11 of the 20 cards name an employer; 5 read "Confidencial" and 4 carry the board's own name ("Magneto empleos"), and the provider emits all 9 as `?`. Free for candidates: met according to the press, not to a Magneto page: candidates register, upload a CV and apply at no cost, and employers pay for credits to see candidate contacts ([El Colombiano](https://www.elcolombiano.com/empleos/contenidos/como-acceder-ofertas-empleo-magneto-mas-de-100-mil-vacantes-NJ27958140), read 2026-10-23). Applying requires a free account.

**Rule 2 (canonical URL is the employer's).** The card carries no employer or ATS URL, only the board's own posting page, so `url` is that page. Whether the posting page links on to the employer: unverified.

**Rule 3 (complete inventory, no paid placement).** The default sort order and whether any card is promoted: unverified. The provider reads up to `max_pages` (default 5), not the whole board. The pagination shape (`?paginator[page]=N`) is the one in the page's own pager links; a page past the first was not fetched.

**Rule 4 (operator declared).** Operator not declared in the PR; unverified.

**Rule 5 (aggregation stays in core).** Verified in code: the provider reads one search URL per entry, on `www.magneto365.com` / `magneto365.com` only.

**Rule 6 (`robots.txt`).** Checked on 2026-10-23: one GET of `https://www.magneto365.com/robots.txt` with career-ops' default User-Agent, HTTP 200. Under `User-agent: *` it allows `/`, disallows `/*?` and `/manager/*`, and allows `/*paginator[page]`. Every URL the provider fetches carries `paginator[page]=N`, which the longer `Allow` covers; a configured search URL with other query parameters still carries it. No group names career-ops.

---

## jobs.cz and prace.cz

| | |
|---|---|
| **Proposed by** | @kosinal (not the operator) |
| **Provider** | `providers/jobscz.mjs`, `providers/pracecz.mjs` |
| **PR** | [#5631](https://github.com/career-ops-hq/career-ops/pull/5631) · issue [#5627](https://github.com/career-ops-hq/career-ops/issues/5627) |
| **Merged** | 2026-10-25 |
| **Status** | Provider listed; the shipped `job_boards:` entries are `enabled: false`. |

**Rule 1 (real listings, identifiable employer, free for candidates).** Listings are individual offers, and each names its employer: a company line on every jobs.cz card, `company.publicName` on every prace.cz item. Listings are readable without an account, and the prace.cz footer links an advertising price list for employers ("Ceník inzerce"). Each offer page has an "Odpovědět" (reply) button leading to the portal's application form. It was opened by hand in a browser, as a candidate, on one offer of each portal (the providers never request it; prace.cz's `robots.txt` disallows `/odpovedni-formular/`): on both portals, sending an application requires no account and is free.

**Rule 2 (canonical URL is the employer's).** jobs.cz cards link `https://www.jobs.cz/rpd/{id}/`, which redirects to the offer page, often on the employer's branded career site (`{employer}.jobs.cz/pd/{id}`). The listing exposes no direct ATS link, so `/rpd/{id}/` (without tracking params) is the canonical URL. On prace.cz, an item's `extended.careerPage.url`, the employer's branded page, is used when present; otherwise `https://www.prace.cz/nabidka/{advertId}/`.

**Rule 3 (complete inventory, no paid placement).** Both portals mark promoted placement: "Příležitost dne" cards (`data-test-ad-status="jobsTip"`) on jobs.cz, `searchInfo.isPromoted` on prace.cz. Neither portal has a sort control. Walking every page of a search returns exactly the total the site shows: for "python", jobs.cz returned 281 unique offers over 10 pages, and prace.cz 63 over 2 pages. The providers walk all pages up to a cap, warn when the cap is hit, dedup by offer id, and leave ranking local. The id is the one in the offer URL on jobs.cz (`/rpd/{id}/`) and `advertId` on prace.cz, so an offer seen under both its branded career-page URL and `/nabidka/{advertId}/` is kept once.

**Rule 4 (operator declared).** Alma Career Czechia s.r.o. runs both portals, according to their page footers. The proposer is not the operator, but a candidate using them.

**Rule 5 (aggregation stays in core).** Each portal has its own provider. jobs.cz and prace.cz are separate portals, but many employers publish the same offer on both: for "python", 56 of the 63 prace.cz offers also appeared on jobs.cz with identical company and title. The scanner's existing company+role dedup merges these.

**Rule 6 (the source's own `robots.txt`).** Under `User-agent: *`, jobs.cz does not disallow the listing path `/prace/`, and its disallowed `/api/` and `/iapi/` are never requested. prace.cz does not disallow `/nabidky/`, the only path the providers read; its disallowed `/hledat/` (the old search path, which now redirects to `/nabidky/`) and application-form paths are never requested. Neither file names an AI or agent crawler.

---

## jobspresso.co

| | |
|---|---|
| **Proposed by** | issue [#1310](https://github.com/career-ops-hq/career-ops/issues/1310); provider by @aakash811 |
| **Provider** | `providers/jobspresso.mjs` |
| **PR** | [#1320](https://github.com/career-ops-hq/career-ops/pull/1320) · rule 6 re-check in issue [#5774](https://github.com/career-ops-hq/career-ops/issues/5774) |
| **Merged** | 2026-06-29, before this policy existed (2026-08-04) |
| **Status** | Listed; feed URL moved to the query-free path on 2026-11-05 |

Re-read against rule 6 after a contributor checked the live `robots.txt` in [#5774](https://github.com/career-ops-hq/career-ops/issues/5774).

**Rule 6 (the source's own `robots.txt`).** Checked on 2026-10-23 and again on 2026-11-05: one GET of `https://jobspresso.co/robots.txt`, HTTP 200. Under `User-agent: *` it disallows `/*?` and sets `Crawl-delay: 3`; its only `Allow` lines are `/*.css` and `/*.js`. No group names career-ops. `/*?` covered the URL the provider originally fetched, `/?feed=job_feed`, the same shape as Lagou in the [Evaluated, not supported](SUPPORTED_JOB_BOARDS.md#evaluated-not-supported) table. Unlike Lagou, a usable request without a query string exists: WordPress serves the same feed at `https://jobspresso.co/feed/job_feed/`, which is the URL the feed's own `<atom:link rel="self">` names. On 2026-11-05 it answered HTTP 200 `application/rss+xml` with no redirect, and returned the same 10 items as the query-string URL. `/*?` does not cover it, so the provider now reads that path, once per scan.

**Rules 1 to 5.** Not re-verified here.

---

## jobicy.com

| | |
|---|---|
| **Proposed by** | provider by [#1260](https://github.com/career-ops-hq/career-ops/pull/1260); rule 3 re-check in this PR |
| **Provider** | `providers/jobicy.mjs` |
| **PR** | [#1260](https://github.com/career-ops-hq/career-ops/pull/1260) · rule 3 re-check: this PR |
| **Merged** | 2026-06-29, before this policy existed (2026-08-04) |
| **Status** | Listed; walks the whole 7-day feed since this PR |

Re-read against rule 3 after the feed's documentation ([jobi.cy/apidocs](https://jobi.cy/apidocs), updated 2026-10-19) turned out to describe cursor pagination the provider never used.

**Rule 3 (complete inventory, no paid placement).** The provider read one page, `?count=50`. Measured on 2026-11-05 with career-ops' default User-Agent, no key, cookie or session: the feed is a 7-day window served newest first, 100 postings a page, and one full walk of its `nextCursor` returned 1,358 postings over 14 pages (largest page 0.9 MB), zero duplicates, published 2026-10-30 to 2026-11-05. The 50 the provider read were 3.7% of the board and had all been published the same day. The provider now follows `nextCursor` until the feed reports `hasMore: false`, up to `max_pages` (default 25, max 100), and warns when that cap cuts the walk short. The public payload has no promoted or sponsored field, and the documentation states the order: publication time, newest first, listing id as tie-breaker. The optional `geo` / `industry` / `tag` keys are the feed's own documented filters, chosen by the user per entry; with `geo=argentina` the same walk returned 124 postings over 2 pages.

**Rule 2 (canonical URL).** For a public request the payload carries one URL per posting, the Jobicy listing page; the employer's ATS link is a field of the paid Commercial API only. Jobicy's fair-use terms also ask that apply links from the free API keep pointing at the Jobicy page, so `url` stays that page.

**Rule 6 (the source's own `robots.txt`).** Checked on 2026-11-05: one GET of `https://jobicy.com/robots.txt`, HTTP 200. Its `User-agent: *` group disallows query shapes such as `/*?s=`, `/*?p=`, `/*?q=`, `/*?offset=0` and `/*api_access_key=`, and paths such as `/search/` and `/job-listings/`; none covers `/api/v2/remote-jobs` with `count`, `cursor`, `geo`, `industry` or `tag`. It also carries `Content-Signal: ai-train=yes, search=yes, ai-input=yes`. No group names career-ops.

**Fair use.** The documentation asks integrations to start an automated pass no more than once an hour and to follow its cursor pages in order. One scan is one pass per `provider: jobicy` entry, with 250 ms between pages.

**Rules 1, 4 and 5.** Not re-verified here.

---

## themuse.com (retired 2026-11-08)

| | |
|---|---|
| **Proposed by** | issue [#1283](https://github.com/santifer/career-ops/issues/1283) |
| **Provider** | `providers/themuse.mjs` |
| **Merged** | before this policy existed (2026-08-04) |
| **Retired** | 2026-11-08 (this fork; upstream still ships the live provider) |
| **Status** | Not listed. `fetch()` throws a retirement message; the catalog row reads **Retired (2026-11-08)** |

Found by a live probe of every provider on 2026-11-08: the scanner read The Muse as a board with no jobs.

**What was checked.** On 2026-11-08 the providers assessment fetched the feed from two networks under the scanner's User-Agent and a desktop browser User-Agent, and the same day `curl -sI` re-checked these paths. `https://www.themuse.com/api/public/jobs` (bare, with `page=0`, with an `api_key` parameter, and under a browser User-Agent), `https://www.themuse.com/` and `https://www.themuse.com/jobs` each answered HTTP 403 with `cf-mitigated: challenge`, a Cloudflare managed challenge. `https://www.themuse.com/robots.txt` answered HTTP 200; under `User-agent: *` it disallows only `/apply/`. The feed is not closed by `robots.txt`; it is closed by bot protection, which career-ops does not work around.

**Alternative.** With an Apify token, an Apify actor such as `bibian/themuse-jobs-scraper` may read the board through the keyed `provider: apify` plugin (its page `https://apify.com/bibian/themuse-jobs-scraper` answered HTTP 200 on 2026-11-08; the actor itself was not run here). That route is outside the zero-key core and is the user's own choice.

**Rules 1 to 6.** Not re-verified: the source is unreachable, which decides on its own.

---

## Loxo (evaluated, not built)

Evaluated on 2026-11-08 in the providers program, with no proposal issue; not listed, recorded in the [Evaluated, not supported](SUPPORTED_JOB_BOARDS.md#evaluated-not-supported) table. `GET https://app.loxo.co/{agency}` serves server-rendered job cards (`app.loxo.co/loxo`: HTTP 200, 7 cards) and `robots.txt` is `Allow: /` under `User-agent: *`. Detail pages carry no JSON-LD and no posting date, `/{agency}.rss` answers 404, and pagination on a large board was not observed. Tenants are recruiting agencies, which rule 2 accepts with the agency as the company, but the date gap and the unconfirmed pagination kept it out of this round.

## Harri (evaluated, not built)

Evaluated on 2026-11-08 in the providers program; not listed. `POST https://gateway.harri.com/core/api/v1/harri_search/search_jobs` needs no auth (the site bundle marks it `noAuth`) and reported 57,089 hits, 10 per page. `start=10000` answers HTTP 400 `CLOUDSEARCH_MAX_WINDOW_SIZE_EXCEEDED`, and no filter body that partitions the index was found, so rule 3 (the complete inventory) is unconfirmed. The sample mixed many UK listings with US ones. `harri.com/robots.txt` disallows only unrelated paths; `gateway.harri.com/robots.txt` answers 403.

## Jobgether (evaluated, not built)

Evaluated on 2026-11-08 in the providers program; not listed and needs a [source proposal](https://github.com/career-ops-hq/career-ops/issues/new?template=source-proposal.yml). `GET https://jobgether.com/astroapi/ai/jobs.json?limit=25&page=N` is a documented public API with no key, rate-limited at 60 requests a minute, and `robots.txt` allows that path by name. Any `page` past 10 comes back as page 10, so one query reaches 250 rows (rule 3); each `url` is a jobgether.com page, not the employer's (rule 2); and the board may republish other sources (rule 5).

## idealist.org (evaluated, not built)

Evaluated on 2026-11-08 in the providers program; not listed. `https://www.idealist.org/sitemap-jobs-en-1.xml` listed 2,252 `/en/nonprofit-job/{id}-{slug}` URLs, newest `lastmod` that day, and `robots.txt` blocks only a third-party-login path for `User-agent: *`. The sitemap route costs one detail fetch per posting per scan, and a JSON-LD parse of the detail page was not confirmed. The search page reads an Algolia index through a public search key; such a key counts as zero-auth when it is read from the page at runtime and never stored, so that route stays open for a later round.

## Dribbble Jobs (evaluated, not built)

Evaluated on 2026-11-08 in the providers program; not listed. `https://dribbble.com/jobs.rss` answered `application/rss+xml` with 46 items and `robots.txt` disallows only `/jobs/*/apply_now`. Some items were posted in 2022 to 2024, the HTML listing returns no jobs past page 1 without client-side code, and the board is design-only, so the yield did not justify a provider.

## USAJOBS front-end search (not used)

Evaluated on 2026-11-08 in the providers program. `POST https://www.usajobs.gov/Search/ExecuteSearch` with a JSON body answered 200 with no key, 25 jobs a page and a `Pager.HasNextPage` flag, and `www.usajobs.gov/robots.txt` allows `/Search/`. It is the site's own front-end call and is undocumented. Core does not use an undocumented endpoint when a documented one exists, and the documented `data.usajobs.gov/api/search` needs a free key (401 without it; that host's `robots.txt` is `Disallow: /`), so USAJOBS is planned for the plugin layer on the keyed API.

---

## Madgex boards (Chronicle, Inside Higher Ed, Science Careers)

| | |
|---|---|
| **Proposed by** | the fork's providers program (plan `docs/superpowers/plans/2026-11-08-providers.md`, Task E1); not affiliated with any of the three boards |
| **Provider** | `providers/madgex.mjs` |
| **PR** | [#43](https://github.com/jrmatherly/career-ops/pull/43) |
| **Merged** | lands with PR #43 |
| **Status** | Listed in the fork |

Three employer job boards, one per host, on the same vendor (Madgex) and the same feed: `jobs.chronicle.com` (The Chronicle of Higher Education), `careers.insidehighered.com` (Inside Higher Ed) and `jobs.sciencecareers.org` (Science Careers). Each host is its own source; one provider reads whichever host the entry names, and never mixes them.

**Rule 1 (real listings, identifiable employer, free for candidates).** Verified on 2026-11-08 with a plain `curl` of `/jobsrss/?page=1` on each host: every `<title>` is "Employer: Job title" naming a college, university or research employer, and a posting page (`/job/{id}/{slug}/`) answers 200 with no login. Applying needs no payment.

**Rule 2 (canonical URL is the employer's).** The feed carries one link per posting, the board's own posting page; no upstream employer URL is in the payload, so that page is the canonical URL. The provider strips the `TrackID` and `utm_*` click-tracking params from it.

**Rule 3 (complete inventory, no paid placement).** `<opensearch:totalResults>` read 28,734 (Chronicle), 23,398 (Inside Higher Ed) and 531 (Science Careers) on 2026-11-08, at 20 items a page, and a page past the end (`page=99999`) answers a well-formed feed with zero items. Each keyword pass asks for `sort=Date` (without it a keyword search comes back ranked by relevance, measured on all three hosts) and stops on a short page (under 20 items) or once it has read `totalResults`, so it never requests that empty page; `max_pages` (default 25, cap 1500) bounds it, and the cap covers Chronicle's 1,437 unfiltered pages, so raising `max_pages` on the entry reaches the full result set. The feed carries no featured, sponsored or premium field.

**Rule 4 (operator declared).** Not an operator proposal.

**Rule 5 (aggregation stays in core).** The provider reads one host per entry, the employers' own postings on that board.

**Rule 6 (the source's own `robots.txt`).** Read like a visitor: one GET of each host's `/robots.txt` on 2026-11-08. Under `User-agent: *` all three disallow only `/invalid-request/`, `/analytics/`, `*/emailjob/*` and `*/previewjob/*` (Science Careers adds `/apply-profile/`). None covers `/jobsrss/`, the only path the provider requests. No group names career-ops, and no `Crawl-delay` is set; the provider paces pages at 250 ms.

---

## 80,000 Hours (jobs.80000hours.org)

| | |
|---|---|
| **Proposed by** | the fork's providers program (plan `docs/superpowers/plans/2026-11-08-providers.md`, Task E3); not affiliated with 80,000 Hours |
| **Provider** | `providers/eightythousandhours.mjs` |
| **PR** | [#43](https://github.com/jrmatherly/career-ops/pull/43) |
| **Merged** | lands with PR #43 |
| **Status** | Listed in the fork |

A curated board of roles at named employers, run by the 80,000 Hours nonprofit. The board's UI reads a public Algolia index; the provider reads the same index.

**Embedded search key.** The Algolia app id, the search-only key and the index name sit in the board page's public `window.__NUXT__.config` block, which every visitor's browser receives. The provider reads them from that page on every run and never stores them, the precedent `providers/techinasia.mjs` set. The key is referer-gated, so each query sends the board's own Referer.

**Rule 1 (real listings, identifiable employer, free for candidates).** Verified on 2026-11-08: all 1,019 hits carry a `company_name`, and the board and its postings need no login or payment.

**Rule 2 (canonical URL is the employer's).** A hit carries the employer's application link in `url_external`. The provider uses it when it is https and no other posting shares it; otherwise the board's own `?jobPk={post_pk}` page (the URL the board's UI sets for a posting). Measured: one hit had a non-https link, and nine links were shared by 23 postings, which as a shared dedup key would have merged 23 real postings into nine. 24 of the 1,019 rows take the board page.

**Rule 3 (complete inventory, no paid placement).** The index held 1,019 hits on 2026-11-08 and serves at most 1,000 for one query: `page=1` answers HTTP 200 with zero hits and the message "you can only fetch the 1000 hits for this query". The provider then partitions on the `tags_location_type` facet, `tags_location_type:Remote` (263) and `NOT tags_location_type:Remote` (756), which together returned all 1,019 distinct postings in a live run. A partition still over 1,000 is reported as a warning, never as a complete board. The payload's ranking fields (`highlighted`, `super_ranked_score`, `daily_ranking`) are not used as filters, so no ranking decides what is read.

**Rule 4 (operator declared).** Not an operator proposal.

**Rule 5 (aggregation stays in core).** One source, the board's own index.

**Rule 6 (the source's own `robots.txt`).** Read like a visitor: one GET of `https://jobs.80000hours.org/robots.txt` on 2026-11-08 returned `User-agent: *` with an empty `Disallow:`, which allows every path. The Algolia host is the board's search backend, not a page a crawler reads. No `Crawl-delay`; queries are paced at 250 ms.

---

## Crypto Jobs List

| | |
|---|---|
| **Proposed by** | the fork's providers program (plan `docs/superpowers/plans/2026-11-08-providers.md`, Task E5); not affiliated with the board |
| **Provider** | `providers/cryptojobslist.mjs` |
| **PR** | [#43](https://github.com/jrmatherly/career-ops/pull/43) |
| **Merged** | lands with PR #43 |
| **Status** | Listed in the fork, newest-feed coverage only (see rule 3) |

A Web3 and crypto job board. The provider reads its public RSS feed at `https://api.cryptojobslist.com/jobs.rss`, the URL the feed's own `<atom:link rel="self">` names; the older `/rss` path answered 403 on 2026-11-08 and is not used.

**Rule 1 (real listings, identifiable employer, free for candidates).** Verified on 2026-11-08: every one of the 100 items names its employer in `<dc:creator>`, and each `<link>` is a public posting page on `cryptojobslist.com` that needs no login.

**Rule 2 (canonical URL is the employer's).** The feed carries one link per posting, the board's own page; no employer application URL is in the payload, so that page is the canonical URL.

**Rule 3 (complete inventory, no paid placement).** Not met in full, and said so in the catalog row: one request returns 100 postings, while the board's `sitemap-jobs.xml` listed 658 posting URLs the same day. The provider does not walk the sitemap, so it covers the feed's 100 only. The items carry no date, so whether those are the newest 100 could not be confirmed from the feed. The feed has no featured, sponsored or premium field (the only "Featured" text is an image class name on every item), so nothing reads as paid placement.

**Rule 4 (operator declared).** Not an operator proposal.

**Rule 5 (aggregation stays in core).** One source, the board's own feed.

**Rule 6 (the source's own `robots.txt`).** Read like a visitor: one GET of `https://api.cryptojobslist.com/robots.txt` and of `https://cryptojobslist.com/robots.txt` on 2026-11-08; both hosts serve the same file. Under `User-agent: *` it allows `/` and `/jobs/` and disallows `/api/`, the apply paths, dashboards and forms; none covers `/jobs.rss` on the API host, the only path the provider requests. A separate group reads `User-agent: ClaudeBot` with `Allow: /`. A trailing `Crawl-delay: 1` sits after the SEO-scraper group; the provider makes one feed request per scan, retried only on a transient failure.

---

## Health eCareers

| | |
|---|---|
| **Proposed by** | the fork's providers program (`docs/superpowers/plans/2026-11-08-providers.md`, Task F1); no affiliation with the source |
| **Provider** | `providers/healthecareers.mjs` |
| **PR** | [#43](https://github.com/jrmatherly/career-ops/pull/43) |
| **Merged** | lands with PR #43 |
| **Status** | Provider listed; no live `job_boards:` entry ships, only the commented example stanza. |

A US healthcare board: physicians, nurses, advanced practice and allied health. Measured with curl on 2026-11-08, no key, cookie or session: `https://www.healthecareers.com/search-jobs` answered HTTP 200 with 25 server-rendered cards, `?pg=2` the next 25, and `?pg=1` a 301 to `/search-jobs/?` (so the provider requests page one at the bare path). Page 883 was the last page with cards and page 1000 a well-formed empty results page, so the board held about 22,000 postings. No bot challenge on any page sampled.

**Rule 1 (real listings, identifiable employer, free for candidates).** Employer attribution, measured: all 125 cards on pages 1, 2, 100, 400 and 401 name an employer (hospital systems, medical groups, the Department of Veterans Affairs, and some staffing firms such as AMN Healthcare and CompHealth), each with a `data-clientid`. Free for candidates: listings and detail pages read without an account. Applying was not walked through. **Backfill:** none observed. Every sampled card carries an employer contract type (`VALUE_BASED`, `NURSING_ALLIED`, `PPA`, `SLOTPlus`, `PROMO`), an apply type of `Resume` (apply on the board) or `ATS` (apply at the employer), and no card links off the board or through the robots-disallowed `/JobDetailsRedirect/` route. Whether a deeper page carries feed backfill: unverified beyond those five pages.

**Rule 2 (canonical URL is the employer's).** The card carries only the board's own `/job/{slug}/{id}` page, so `url` is that page. The detail page's JSON-LD names the employer but not an ATS link.

**Rule 3 (complete inventory, no paid placement).** Partly met. `PROMO` and `SLOTPlus` are paid placements interleaved in the default order; the provider keeps every card it reads and ranks nothing. It reads up to `max_pages` (default 10, so the newest 250), not the whole board, and the catalog row says so. Card order changed between two requests a minute apart on 2026-11-08, so a walk over many pages can skip or repeat a posting at a page boundary.

**Rule 4 (operator declared).** Operator not declared; unverified.

**Rule 5 (aggregation stays in core).** Verified in code: the provider reads `/search-jobs` (and, under `fetchDetails`, `/job/{slug}/{id}`) on `www.healthecareers.com` only.

**Rule 6 (the source's own `robots.txt`).** Read like a visitor: one GET of `https://www.healthecareers.com/robots.txt` on 2026-11-08. Under `User-agent: *` it has `Disallow: /searchjobs/`, `Disallow: /new-search-jobs/` and `Disallow: /JobDetailsRedirect/` among others, none covering `/search-jobs` or `/job/`. A second group naming AI crawlers (`ClaudeBot`, `GPTBot`, `PerplexityBot` and others) carries `Allow: /`, `Allow: /career-resources/` and `Allow: /search-jobs/`. The provider never requests a disallowed path, and its test pins the `/search-jobs` path literal.

## Tech Jobs for Good (not listed)

Planned in the fork's providers program (`docs/superpowers/plans/2026-11-08-providers.md`, Task F2) and stopped at the endpoint check on 2026-11-08, before any code. Checked with curl, no key, cookie or session: `https://techjobsforgood.com/jobs/?page=N` served 30, 30 and 24 server-rendered cards on pages 1 to 3 and HTTP 404 on page 4, and `robots.txt` is `User-agent: *` / `Allow: /`. The same page reads "84 jobs found" next to "Upgrade to see 890 additional jobs", and `https://techjobsforgood.com/upgrade-to-premium/` sells candidates a Premium Membership at $19 a month to "see 11.6x more jobs" (a second read the same day, during the PR #43 review, showed 83 and 886). Rule 1 bars a source that paywalls listings for candidates, and the free rows are not the complete inventory rule 3 asks for, so the board is not listed. It is in the [Evaluated, not supported](SUPPORTED_JOB_BOARDS.md#evaluated-not-supported) table.

---

## Dynamite Jobs

| | |
|---|---|
| **Proposed by** | the fork's providers program (`docs/superpowers/plans/2026-11-08-providers.md`, Task F3); no affiliation with the source |
| **Provider** | `providers/dynamitejobs.mjs` |
| **PR** | [#43](https://github.com/jrmatherly/career-ops/pull/43) |
| **Merged** | lands with PR #43 |
| **Status** | Provider listed; no live `job_boards:` entry ships, only the commented example stanza. |

A remote-only board, many small employers. Measured with curl and the provider's own fetch on 2026-11-08, no key, cookie or session: `https://dynamitejobs.com/sitemap/jobs-of-company.xml` answered HTTP 200 (`application/xml`, about 480 KB) with 3,441 `<loc>` entries, 500 of them posting URLs of the form `/company/{company}/remote-job/{slug}`. Each posting page carries a JSON-LD `JobPosting` with `title`, `hiringOrganization`, `datePosted`, `validThrough`, `jobLocationType: TELECOMMUTE` and `applicantLocationRequirements`. No bot challenge on any page read. A `HEAD` of the sitemap answers 404 while `GET` answers 200; the provider only sends `GET`.

**Rule 1 (real listings, identifiable employer, free for candidates).** Employer attribution: every posting URL carries an employer segment, and the three posting pages read in the smoke test named their employer in `hiringOrganization` (with a `sameAs` website). Free for candidates: no paywall, membership or upgrade text on `/remote-jobs` or on a posting page; the "Apply Now" flow was not walked through.

**Rule 2 (canonical URL is the employer's).** `directApply` is `false` on the posting sampled and the page exposes no employer ATS link, so `url` is the board's own posting page.

**Rule 3 (complete inventory, no paid placement).** Partly met. Posting pages label some roles "Featured Job" and "Promoted Job"; the sitemap does not mark them, and the provider keeps every sitemap row in sitemap order and ranks nothing. The board also publishes `jobs-of-companies-index.xml`, 475 per-company sitemaps; whether the flat sitemap's 500 posting URLs are the whole live inventory or a cap of 500 is unverified. The provider reads the flat sitemap only.

**Rule 4 (operator declared).** Operator not declared; unverified.

**Rule 5 (aggregation stays in core).** Verified in code: the provider reads the one sitemap and posting pages on `dynamitejobs.com` only.

**Rule 6 (the source's own `robots.txt`).** One GET of `https://dynamitejobs.com/robots.txt` on 2026-11-08 (served gzip-encoded). Under `User-agent: *` it has `Disallow: /api/`, `/form/`, `/webhook/`, `/job-edit/`, `/company-dashboard/`, `/my-jobs/`, `/admin/` and `/app/`, and lists `/sitemap/index.xml`, `/sitemap/jobs-of-companies-index.xml` and three other sitemaps. Neither `/sitemap/jobs-of-company.xml` nor `/company/{company}/remote-job/{slug}` is disallowed. No group names career-ops or an AI crawler.

---

## Backfill waiver (2026-11-08)

These board providers merged without an entry in this log: most before the log existed on 2026-08-07, the rest after it without one. Each line names the provider and the author date of the commit that added its file (`git log --diff-filter=A --format=%as -- providers/{id}.mjs`). A line here records the gap; it is not a verification. A full entry for a provider replaces its line. `tests/providers/indexing-log-coverage.test.mjs` fails when a board provider has neither.

- `providers/4dayweek.mjs`, merged 2026-06-29
- `providers/agentic-jobs.mjs`, merged 2026-07-20
- `providers/arbeitnow.mjs`, merged 2026-06-29
- `providers/arbeitsagentur.mjs`, merged 2026-06-18
- `providers/bulldogjob.mjs`, merged 2026-10-30
- `providers/careerviet.mjs`, merged 2026-08-27
- `providers/consider.mjs`, merged 2026-08-08
- `providers/flowxtra.mjs`, merged 2026-07-27
- `providers/generalist-world.mjs`, merged 2026-09-11
- `providers/germantechjobs.mjs`, merged 2026-11-03
- `providers/getonbrd.mjs`, merged 2026-07-03
- `providers/getro.mjs`, merged 2026-08-08
- `providers/gupy.mjs`, merged 2026-10-03
- `providers/hackernews.mjs`, merged 2026-06-29
- `providers/higheredjobs.mjs`, merged 2026-07-01
- `providers/himalayas.mjs`, merged 2026-06-29
- `providers/itviec.mjs`, merged 2026-08-26
- `providers/jobbankca.mjs`, merged 2026-08-21
- `providers/landingjobs.mjs`, merged 2026-06-29
- `providers/larajobs.mjs`, merged 2026-07-08
- `providers/manfred.mjs`, merged 2026-08-04
- `providers/mycareersfuture.mjs`, merged 2026-08-21
- `providers/nodesk.mjs`, merged 2026-06-30
- `providers/occ.mjs`, merged 2026-09-29
- `providers/platsbanken.mjs`, merged 2026-10-12
- `providers/pythonorg.mjs`, merged 2026-09-14
- `providers/remoteok.mjs`, merged 2026-06-17
- `providers/remotive.mjs`, merged 2026-06-17
- `providers/senjob.mjs`, merged 2026-08-17
- `providers/thehub.mjs`, merged 2026-06-29
- `providers/vdab.mjs`, merged 2026-07-27
- `providers/weworkremotely.mjs`, merged 2026-06-27
- `providers/workingnomads.mjs`, merged 2026-06-17
- `providers/wp-job-manager.mjs`, merged 2026-10-26
- `providers/yourator.mjs`, merged 2026-08-19
