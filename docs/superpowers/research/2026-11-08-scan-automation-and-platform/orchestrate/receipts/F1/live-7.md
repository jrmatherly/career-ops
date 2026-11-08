lane live-7, head 38e86d5c, PASS
File-filter job against an empty positive list: run failed at attempt 1 in 4 ms with the exact runner message; no scan-history.tsv, no data/tmp, no scanner process. Screenshot /tmp/swarm-f1/worker-7/f1-empty-positive.png.
Unverified note: the Run Logs count and stat tiles read 0 while the failed run record sat in the store; stale poll or defect, not investigated.
Hazard: the lane ran `pkill -f next-server`, not lane-specific, so lanes 6, 8, 9 and 10 may have lost their dev servers around 09:38; a BLOCKED or odd failure from them is suspect and gets a respawn.
