comment-analyzer, A1 round 4, head b89a011c (sonnet, coordinator-written from the agent's returned text). aebb7eb0 hunks read against route.ts, claude-invocation.mjs, worker-capabilities.mjs, README, SKILL.md, PR body. No tests run, nothing edited.

ROUND-3 ITEMS
1. CLOSED. claude-invocation.mjs:187-201 emits five // rules (//proc/**, //var/run/secrets/**, three //<root>/... files) plus Read(~/.claude/**) and Read(~/.claude.json). PR body bullet 2 and the SKILL.md claudeCliArgs row say exactly that.
2. CLOSED. SKILL.md route.ts row: "...(argv cannot carry one). It also accepts { kind: "evaluate-text", ... }: 400 when ...". The clause has its subject.
3. CLOSED. web/README.md:96 names the NUL-byte 400.
4. CLOSED. README.md:97-100 names the unresolvable root and the root character limit; both match route.ts:112-127.
5. CLOSED. claude-invocation.mjs:93-98 TOOL_SCOPES JSDoc names evaluate-text and the localReadOnly/networkReadOnly split; mapping matches worker-capabilities.mjs:119-126. See NEW 2.
6. CLOSED. route.ts:64 "the evaluate kinds"; route.ts:395-397 "the evaluate kinds keep 740s for report-persist"; killMsForKind (run-cli-support.mjs:444) uses isEvaluateKind.
Also confirmed: the SKILL.md web/README.md row (:296) claims the refusal list as a hunk.

NEW DEFECTS
1. MEDIUM, conf 85. Overclaim: "every 400 the route answers before a CLI starts" in the PR body, the aebb7eb0 commit message and the SKILL.md web/README.md row. The README list omits pre-spawn 400s: invalid evaluationSections (route.ts:70-71), bad JSON body (:56), capability-disallowed CLI (:131-135), incomplete checkout (:154-161), fix-portal unsafe company name (:187-192), missing cv.md for evaluate/pdf/cover (:196-201), pdf path and cover request errors (:213-228), evaluate-text "Claude is not available" (:109-111). The README lead-in ("answers 400, before it starts any CLI, for:") reads as exhaustive too. Minimal fix: "the 400s this change adds or changes" in the PR body and SKILL.md row; README says "among others" or adds the rest.
2. LOW, conf 60. TOOL_SCOPES JSDoc lists networkReadOnly as "evaluate and research" and omits cover (worker-capabilities.mjs:125); the inline-artifact list omits research. Incomplete, not false.
3. LOW, conf 55. README.md:94-95 "missing, blank or over 16,384 characters" omits the non-string jdText 400 (route.ts:92); the SKILL.md row has it.
4. LOW, conf 50. PR body "before it resolves or starts any CLI": the NUL and data-root 400s run after resolveCliOrFallback (route.ts:99 vs :112-127, :276). README's "before it starts any CLI" is right.

CHECKED TRUE: route.ts:35-37, :38-42, :43-52 POSTING_INPUT (patterns match README, SKILL.md and PR body), :58, :60-69 (!== undefined so null refused), :75-76, :81-84 padded cliId, URL check :78 before cliId :82, :85-86, :109-111, :114 realpath with errno logged at :120, :274-278 NUL 400; run-cli-support.mjs:437-446; claude-invocation.mjs:151-157, :185-186; worker-capabilities.mjs:78-86; run-prompts.mjs:323 textSource non-JD stop with needs_confirmation and no envelope; README.md:74-80 and the refusal items; SKILL.md route.ts row.
Not verified: PR body round-4 test and mutant claims; Claude Code 2.1.319 deny behaviour.
