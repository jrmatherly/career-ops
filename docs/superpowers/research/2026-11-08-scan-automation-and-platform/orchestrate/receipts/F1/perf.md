lane perf, head 38e86d5c4bc2c4c6a2d349cd34bdb3589ffaff5b, PASS
n=10 probe too noisy at ~0.4 ms per call (custom/trunk 0.844, 1.015, 1.200 across three runs); n=2000 medians: custom/trunk 1.019, 0.998, 1.021; file/custom 0.47 in every run. Probe /tmp/swarm-f1/perf/probe.mjs and probe2000.mjs. Lane symlinked node_modules into the worktrees to import js-yaml; head worktree left clean.
