#!/usr/bin/env bash
# Codex の画像生成で art/<scope>/raw/<name>.png を作る。プロンプトは art/<scope>/prompts/<name>.txt
# 絵柄は art/style-ref.png にそろえる。くわしくは docs/02-asset-generation.md
# 使い方: scripts/art/gen.sh games/hippari chars enemies ...
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
scope="$1"; shift
mkdir -p "$root/art/$scope/raw"
cd "$root/art/$scope/raw"
for name in "$@"; do
  echo "== $scope/$name"
  codex exec --skip-git-repo-check -s workspace-write -C . "$(cat "../prompts/$name.txt")" -i "$root/art/style-ref.png" < /dev/null | tail -3
  test -f "$name.png" || { echo "$name.png ができませんでした" >&2; exit 1; }
done
