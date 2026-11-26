#!/usr/bin/env bash
set -euo pipefail

git fetch upstream --tags --force
# Newest *published* release, not newest tag: upstream sometimes tags without releasing.
TAGS=$(gh api 'repos/fastrepl/anarlog/releases?per_page=100' \
  --jq '.[] | select((.draft or .prerelease) | not) | .tag_name | select(startswith("desktop_v"))')
NEW_TAG=$(sort -V <<<"$TAGS" | tail -n1)
if [[ -z "$NEW_TAG" ]]; then
  echo "No published desktop_v* release found" >&2
  exit 1
fi
OLD_BASE=$(git merge-base fork upstream/main 2>/dev/null || git merge-base HEAD upstream/main)
echo "Rebasing fork onto $NEW_TAG (old base $OLD_BASE)"
if ! git rebase --onto "$NEW_TAG" "$OLD_BASE" fork; then
  echo "Rebase conflict — aborting. Resolve locally then force-push fork." >&2
  git rebase --abort || true
  exit 1
fi
echo "Rebased fork onto $NEW_TAG"
