lane perf, head 189da72e vs trunk d2fea890, INCONCLUSIVE under load
5 runs: head/trunk 1.129; 20 runs: 0.953; per-run spread 50-150 percent with five owners and several dev servers on the machine, so the sets disagree in sign. Receipts /tmp/swarm-p1/worker-11/perf.txt, perf-20.txt, bench.mjs. Re-measured by a second lane in-process on checkBillingSource plus a longer interleaved run.
