#!/usr/bin/env bash

set -euo pipefail

PUBLIC_REMOTE="${PUBLIC_REMOTE:-public}"
PUBLIC_BRANCH="${PUBLIC_BRANCH:-main}"
COMMIT_MESSAGE="${COMMIT_MESSAGE:-Deploy new version}"
COMMIT_NAME="${COMMIT_NAME:-iambriccardo}"
COMMIT_EMAIL="${COMMIT_EMAIL:-iambriccardo@users.noreply.github.com}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to publish: commit or stash the working tree changes first." >&2
  exit 1
fi

if ! git remote get-url "$PUBLIC_REMOTE" >/dev/null 2>&1; then
  echo "Missing Git remote '$PUBLIC_REMOTE'." >&2
  echo "Add it with: git remote add public <public-repository-url>" >&2
  exit 1
fi

PUBLIC_URL="$(git remote get-url --push "$PUBLIC_REMOTE")"
ORIGIN_URL="$(git remote get-url --push origin 2>/dev/null || true)"

if [[ "$PUBLIC_REMOTE" != "origin" && -n "$ORIGIN_URL" && "$PUBLIC_URL" == "$ORIGIN_URL" ]]; then
  echo "Refusing to publish: 'origin' and '$PUBLIC_REMOTE' point to the same repository." >&2
  echo "Use a private development repository for origin and the public mirror for public." >&2
  exit 1
fi

echo "Building the committed snapshot..."
npm run build
git diff --check

SNAPSHOT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/personal-website-public.XXXXXX")"
trap 'rm -rf "$SNAPSHOT_DIR"' EXIT

git archive HEAD | tar -x -C "$SNAPSHOT_DIR"

git -C "$SNAPSHOT_DIR" init --quiet
git -C "$SNAPSHOT_DIR" checkout --quiet --orphan "$PUBLIC_BRANCH"
git -C "$SNAPSHOT_DIR" add --all
git -C "$SNAPSHOT_DIR" \
  -c "user.name=$COMMIT_NAME" \
  -c "user.email=$COMMIT_EMAIL" \
  commit --quiet -m "$COMMIT_MESSAGE"

SNAPSHOT_COMMIT="$(git -C "$SNAPSHOT_DIR" rev-parse HEAD)"

echo "Publishing $SNAPSHOT_COMMIT to $PUBLIC_REMOTE/$PUBLIC_BRANCH..."
git -C "$SNAPSHOT_DIR" push --force "$PUBLIC_URL" "$PUBLIC_BRANCH:$PUBLIC_BRANCH"

echo "Published one public commit: $COMMIT_MESSAGE"
