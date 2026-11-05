#!/usr/bin/env bash
# upstream-review.sh - list, classify and watermark upstream (career-ops-hq/career-ops)
# commits for this fork.
#
# This repo is a GitHub fork that shares history with upstream. Two SHAs in
# .upstream-review/watermark.json bound the work:
#   forkPointSha     the last upstream commit our tree carries wholesale (merge-base; fixed)
#   lastReviewedSha  the last upstream commit we assessed (advances per review)
# We never `git merge` upstream (that would take every commit, skipped ones included), so
# the merge-base stays at forkPointSha and every range is <lastReviewedSha>..careerops/main.
#
# USAGE (from anywhere inside the repo)
#   upstream-review.sh                 fetch upstream, list un-reviewed commits (oldest first)
#   upstream-review.sh --stat          same, plus each touched file with a marker (below)
#   upstream-review.sh --urls          same, plus a github.com commit URL per commit
#   upstream-review.sh --show <sha>    one upstream commit's full diff
#   upstream-review.sh --diverged      files where our HEAD differs from the fork point (our footprint)
#   upstream-review.sh --advance <sha> set lastReviewedSha to the tip SHA printed by the listing you reviewed
#
# A commit whose patch already exists on our side (cherry-picked earlier) is tagged [picked]:
# git's --cherry-mark compares patch ids, so it is found even when the message changed.
#
# Markers in --stat compare our HEAD with the commit's own parent (the pre-image a cherry-pick merges from):
#   =   our file equals the pre-image        git cherry-pick -x <sha> applies cleanly for this file
#   <   equals the fork point, not the pre-image   an earlier upstream commit touched it; pick older commits first
#   ~   differs from both                    we changed it; expect conflicts, hand-port or resolve the 3-way
#   x   we removed it                        skip unless we want the file back
#   +   new upstream file                    cherry-pick creates it
#   bin binary file                          inspect by hand
# Only --advance writes anything, and only to the watermark file.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
STATE="$REPO_ROOT/.upstream-review/watermark.json"

die() { echo "ERROR: $*" >&2; exit 1; }
[ -f "$STATE" ] || die "missing $STATE"
command -v jq >/dev/null || die "jq is required (brew install jq, or mise use jq)"

require() { [ -n "$2" ] || die "watermark.json: $1 is missing"; }
is_sha()  { [[ "$1" =~ ^[0-9a-f]{40}$ ]] || die "watermark.json: $2 is not a full SHA: $1"; }
is_name() { [[ "$1" =~ ^[A-Za-z0-9._][A-Za-z0-9._/-]*$ ]] || die "watermark.json: $2 is not a safe git name: $1"; }

IFS=$'\t' read -r URL REMOTE BRANCH FORK FORK_DATE WATERMARK WATERMARK_DATE < <(
  jq -r '[.upstreamUrl, .upstreamRemote, .upstreamBranch, .forkPointSha, .forkPointDate, .lastReviewedSha, .lastReviewedDate] | map(. // "") | @tsv' "$STATE")
require upstreamUrl "$URL"
require upstreamRemote "$REMOTE";     is_name "$REMOTE" upstreamRemote
require upstreamBranch "$BRANCH";     is_name "$BRANCH" upstreamBranch
require forkPointSha "$FORK";         is_sha "$FORK" forkPointSha
require lastReviewedSha "$WATERMARK"; is_sha "$WATERMARK" lastReviewedSha
[[ "$URL" =~ ^https://[A-Za-z0-9._/-]+$ ]] || die "watermark.json: upstreamUrl must be a plain https URL"
TIP="refs/remotes/$REMOTE/$BRANCH"
REFSPEC="+refs/heads/$BRANCH:$TIP"
GH_WEB="${URL%.git}/commit"

g() { git -C "$REPO_ROOT" "$@"; }

ensure_upstream() {
  local have
  if have="$(g remote get-url -- "$REMOTE" 2>/dev/null)"; then
    [ "$have" = "$URL" ] || die "remote '$REMOTE' points at $have, watermark.json says $URL"
  else
    # Not named "upstream": gh ranks a remote called upstream above origin as its default repo.
    echo "[upstream-review] adding remote $REMOTE -> $URL" >&2
    g remote add --no-tags -- "$REMOTE" "$URL"
  fi
  echo "[upstream-review] fetching $REMOTE/$BRANCH" >&2
  if ! g fetch -q --no-tags -- "$REMOTE" "$REFSPEC"; then
    g rev-parse -q --verify "$TIP" >/dev/null || die "fetch failed and no cached $TIP"
    echo "[upstream-review] fetch failed; using cached $TIP" >&2
  fi
  g merge-base --is-ancestor "$WATERMARK" "$TIP" || die "lastReviewedSha is not an ancestor of $REMOTE/$BRANCH (history rewritten?)"
  local base; base="$(g merge-base HEAD "$TIP")"
  [ "$base" = "$FORK" ] || echo "[upstream-review] WARNING: merge-base HEAD..$REMOTE/$BRANCH is $(g rev-parse --short "$base"), not forkPointSha $(g rev-parse --short "$FORK"). Did someone merge upstream? Markers assume no merge." >&2
}

# Print one line per file the commit touches: marker, +adds, -dels, path. Three git calls per commit:
# diff-tree --raw gives the pre-image blob, --numstat the counts, cat-file --batch-check our HEAD and fork-point blobs.
stat_commit() {
  local commit="$1" meta path pre head fork add del i j n=0
  local paths pres heads forks adds dels; paths=(); pres=(); heads=(); forks=(); adds=(); dels=()
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r _ _ pre _ <<<"$meta"
    paths[n]="$path"; pres[n]="$pre"; n=$((n+1))
  done < <(g diff-tree --no-commit-id --no-renames -r -z --raw "$commit")
  [ "$n" -gt 0 ] || return 0
  i=0
  while IFS=$'\t' read -r -d '' add del path; do adds[i]="$add"; dels[i]="$del"; i=$((i+1)); done < <(g diff-tree --no-commit-id --no-renames -r -z --numstat "$commit")
  i=0
  while read -r head _ && read -r fork _; do heads[i]="$head"; forks[i]="$fork"; i=$((i+1)); done < <(
    for ((j=0; j<n; j++)); do printf 'HEAD:%s\n%s:%s\n' "${paths[j]}" "$FORK" "${paths[j]}"; done |
    g cat-file --batch-check='%(objectname) %(objecttype)' | sed 's/^.* missing$/- missing/')
  for ((i=0; i<n; i++)); do
    pre="${pres[i]}"; head="${heads[i]}"; fork="${forks[i]}"
    if [ "${adds[i]}" = "-" ]; then m=bin
    elif [[ "$pre" =~ ^0+$ ]]; then
      if [ "$head" = "-" ]; then m="+"; elif [ "$head" = "$fork" ]; then m="<"; else m="~"; fi
    elif [ "$head" = "-" ]; then m=x
    elif [ "$head" = "$pre" ]; then m="="
    elif [ "$head" = "$fork" ]; then m="<"
    else m="~"; fi
    [ "$m" = bin ] && printf '      %-3s %5s %5s  %s\n' bin "" "" "${paths[i]}" || printf '      %-3s %5s %5s  %s\n' "$m" "+${adds[i]}" "-${dels[i]}" "${paths[i]}"
  done
}

cmd="${1:-list}"
case "$cmd" in
  --show)
    [ $# -ge 2 ] || die "--show needs a <sha>"
    ensure_upstream
    sha="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    g show "$sha"; exit 0 ;;
  --diverged)
    g rev-parse -q --verify "$FORK^{commit}" >/dev/null || ensure_upstream
    echo "Files where our HEAD differs from fork point $(g rev-parse --short "$FORK"):"
    g diff --stat=120 "$FORK" HEAD; exit 0 ;;
  --advance)
    [ $# -ge 2 ] || die "--advance needs the tip <sha> you reviewed (printed by the listing)"
    ensure_upstream
    NEWSHA="$(g rev-parse -q --verify "$2^{commit}")" || die "not a commit: $2"
    g merge-base --is-ancestor "$NEWSHA" "$TIP" || die "$2 is not on $REMOTE/$BRANCH"
    NEWSHORT="$(g rev-parse --short "$NEWSHA")"
    NEWDATE="$(g log -1 --date=short --pretty=%ad "$NEWSHA")"
    NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    tmp="$(mktemp)"
    jq --arg s "$NEWSHA" --arg ss "$NEWSHORT" --arg d "$NEWDATE" --arg n "$NOW" \
      '.lastReviewedSha=$s | .lastReviewedShaShort=$ss | .lastReviewedDate=$d | .lastAdvancedAt=$n' \
      "$STATE" > "$tmp" && cat "$tmp" > "$STATE" && rm -f "$tmp"
    echo "[upstream-review] watermark -> $NEWSHORT ($NEWDATE). Commit .upstream-review/ to share it." >&2
    exit 0 ;;
  -h|--help) sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  list|--stat|--urls) ;;
  *) die "unknown option '$cmd' (see header)" ;;
esac

ensure_upstream
RANGE="$WATERMARK..$TIP"
COUNT="$(g rev-list --count "$RANGE")"
TIPSHA="$(g rev-parse "$TIP")"
echo "Upstream review: $REMOTE/$BRANCH"
echo "  fork point:          $(g rev-parse --short "$FORK") $FORK_DATE"
echo "  last reviewed:       $(g rev-parse --short "$WATERMARK") $WATERMARK_DATE"
echo "  upstream tip:        $TIPSHA"
echo "  commits to review:   $COUNT"
[ "$COUNT" -eq 0 ] && { echo "Up to date."; exit 0; }

# Upstream commits whose patch id already exists on our side (earlier cherry-picks).
PICKED=" $(g rev-list --cherry-mark --right-only --no-merges "HEAD...$TIP" | awk '/^=/{print substr($1,2)}' | tr '\n' ' ') "

g log --reverse --date=short --pretty='%H%x09%h%x09%ad%x09%p%x09%s' "$RANGE" |
while IFS=$'\t' read -r full short date parents subj; do
  tag=""; case "$parents" in *" "*) tag="  [merge]";; esac
  case " $PICKED " in *" $full "*) tag="$tag  [picked]";; esac
  echo
  echo "* $short  $date  $subj$tag"
  [ "$cmd" = "--urls" ] && echo "    $GH_WEB/$full"
  if [ "$cmd" = "--stat" ] && [[ "$tag" != *"[merge]"* ]]; then
    stat_commit "$full"
  fi
done

echo
echo "Next: classify each commit (see SKILL.md), write .upstream-review/reviews/$(date +%Y-%m-%d)-review.md"
echo "with 'Window: $(g rev-parse --short "$WATERMARK")..$TIPSHA', then: $0 --advance $TIPSHA"
