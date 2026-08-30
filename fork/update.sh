#!/usr/bin/env bash
set -euo pipefail

git fetch upstream --tags --force
NEW_TAG=$(git tag --list 'desktop_v*' --sort=-v:refname | head -1)
if [[ -z "$NEW_TAG" ]]; then
  echo "No desktop_v* tag found" >&2
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
