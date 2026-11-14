# Recruiter-Side Application Heuristics

Use these rules for candidate-facing documents and answers: PDF summaries,
bullets, cover letters, form answers, LinkedIn messages, recruiter scripts, and
interview prep. They do not apply to internal evaluation reports unless a mode
explicitly asks for analysis.

## Recruiter-Side Risk Map

Before generating a CV, cover letter, form answer, recruiter script, or
interview prep, create a small internal risk map:

| Potential doubt | Evidence from CV/report | Candidate-facing fix |
|-----------------|-------------------------|----------------------|
| Can they do this stack? | Matching tools, systems, projects | Put the exact stack in truthful context |
| Are they senior enough? | Ownership, scope, tradeoffs, mentoring | Lead with senior behaviors, not tenure alone |
| Is the domain relevant? | Similar users, workflows, scale, constraints | Translate adjacent proof into the JD's language |
| Is there a logistics blocker? | Location, comp, work-auth, availability | Answer only where the form/recruiter asks |
| Is the application generic? | Weak or broad bullets | Rewrite around this role's concrete problems |

Use the map to reduce review risk. Do not print it unless the mode output
explicitly asks for analysis. Never invent evidence to close a doubt.

## Six-Second Clarity Gate

For every CV/PDF and cover letter, the top third must make the target fit
impossible to miss:

- target role/archetype
- strongest matching stack or domain
- one production or business outcome
- location/remote fit only when appropriate for that document
- portfolio/case-study link when available and relevant

If a recruiter must infer fit from scattered bullets, rewrite the summary and
first experience bullets.

## Business-Value Bullets

Prefer:

`Action + system/scope + tool/approach + outcome + proof`

Good patterns:

- `Resolved [problem] in [system], improving [business/system effect].`
- `Built [capability] with [tools], enabling [user/team outcome].`
- `Migrated [old] to [new], reducing [risk/cost/latency/debt].`
- `Improved [metric] from [before] to [after] by [technical action].`

Avoid weak starts when stronger ownership is true: "helped", "assisted",
"responsible for", "worked on", "participated in".

When there is no reliable number, say what changed in plain words. Never add a
percentage to have one.

A true number still has to be clear:

- a recurring volume states the period it covers ("120,000 units a month", not
  "120,000 units"); a one-time total ("migrated 120,000 records") needs none
- a percentage states what it measures, and percent is not percentage points
- a figure for the whole site or company is not written as the candidate's own team's
- a shared result names the candidate's part in it

Scope is not a result. Team size, volume, budget and locations show the level of
the work, and they belong in a bullet even when no outcome was measured.

Spell out an acronym the reader's company would not know. Where an abbreviation
and its full term are both accurate, give both once.

If a bullet in `cv.md` lacks the period, the measure, the candidate's part or
what an acronym stands for, ask the user. Never fill it in. In an unattended run, leave the detail out and
report the gap.

## ATS Reality Check

Optimize for parseability and human review, not "ATS hacks":

- exact JD keywords only in truthful context
- no hidden text
- no keyword stuffing
- no white-font tricks
- no decorative layouts that break parsing
- no skills or metrics not present in the user's sources of truth
