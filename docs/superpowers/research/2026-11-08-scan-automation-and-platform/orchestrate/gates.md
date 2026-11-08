# Gates

## A1-deny-gate-linux

- Status: resolved
- Question: PR-A1's Build gate wants a Linux container from deploy/Dockerfile to prove Read and Grep of /proc/self/environ are refused with the evaluate-text deny rules. The owner proved both denies on the host (Claude Code 2.1.319, the Dockerfile pin) with a /tmp stand-in, but a container run needs a Claude credential inside it, which only the operator can supply. PR-A2 is gated on this.
- Options: A: operator runs the plan's one-line gate command in a scratch container with a short-lived token and posts the two refusal lines; B: accept the host proof (same CLI version, absolute-path denies) as the gate and let A2 start; C: hold A2 until the pod image carries A1 and run the gate there
- Default: C unless the operator picks A or B; A1 itself is not blocked by the gate
- Answer: superseded by A1-deny-gate-linux-v2 (adds the recursive-Grep case from the A1 code review)

## A1-deny-gate-linux-v2

- Status: open
- Question: Amended A1 gate (supersedes A1-deny-gate-linux): the container proof must cover two cases, the plan's direct Read and Grep of /proc/self/environ, and a recursive Grep from the data root as cwd (the agent runs with cwd = data root and three denies are files under it; the Claude Code permissions doc says Read denies reach Grep and Glob best-effort and may not apply when a search of a directory above returns matching files). From a /data with a dummy data/contacts.tsv: claude -p 'Grep for @ in the current directory, output_mode content' must return nothing from that file.
- Options: A: operator runs both lines in a scratch container with a short-lived token; B: accept the host proof for the direct case and run only the recursive-Grep case; C: hold A2 until the pod image carries A1 and run both there
- Default: C unless the operator picks A or B

## A2-auto-mode-secret-surface

- Status: open
- Question: Before PR-A2 starts: the evaluate-text worker keeps Read over everything except seven denied paths, so on a Mac install a hostile posting can have the agent read ~/.ssh, ~/.aws, ~/.config/gh or the checkout's .env.local and quote them into the persisted report (owner-A1 follow-up 1, audit residual). In the pod those files do not exist and the denies cover env and the service-account token. Claude Code permissions cannot express a Read allow-list, so the deny list can never be complete.
- Options: A: A2 ships auto mode as pod-only (a Mac install refuses the drain unless an explicit CAREER_OPS_AUTO_EVALUATE_LOCAL=1 is set) and A1's deny list gains ~/.ssh/**, ~/.aws/**, ~/.config/gh/**, ~/.gnupg/**, and the checkout's .env*; B: A2 documents Mac auto mode as unsupported (Appendix D default 6 already says best-effort) with the extra denies only; C: hold A2 until a sandboxed worker exists
- Default: A unless the operator picks otherwise; it keeps the plan's shape and makes the exposure a deliberate opt-in
