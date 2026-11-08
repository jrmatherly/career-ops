toolkit comment-analyzer, head 5ecd6dc8 (code identical to 38e86d5c)
C1 docs/WEB_UI.md:60 says a relative CAREER_OPS_PORTALS resolves against the data root; true for the runner (portalsPath, runner:147-150) but the web's portalsConfigPath (career-ops.ts:333-336) resolves against cwd and scan.mjs:121 uses the raw value. Reword to the runner, or fix portalsConfigPath (out of F1 scope; career-ops.ts is R2's file).
C2 runner:235-236 the pre-existing comment "a relative override is resolved here, the way the web resolves it" now sits under the new CAREER_OPS_PORTALS line (234) where it is false; it describes CAREER_OPS_PROFILE. Move it or name profile.
C3 SKILL.md:267 the create/edit modal deviations row omits the FiltersFromToggle component (create-job-modal.tsx:170-186), its import in edit-job-modal.tsx:9 and the FiltersFrom type import.
C4 docs/WEB_UI.md:65 "saved before this change" is unanchored; date it.
Nits: WEB_UI.md:61 title_filter_full clause applies only when the file has that block (runner:182); inherited lists pass through cleanChips; runner:163-164 "whenever the key exists" should read "whenever it is set" (null falls back).
Verified accurate: retry-scope comment, body helper comment, toggle hint, error string, SKILL.md row tests exist.
