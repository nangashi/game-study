#!/usr/bin/env bash
# Codex の画像生成で art/raw/<name>.png を作る。プロンプトは art/prompts/<name>.txt
# 使い方: scripts/gen-art.sh hero_witch enemies ...
set -euo pipefail
cd "$(dirname "$0")/../art/raw"
for name in "$@"; do
  codex exec --skip-git-repo-check -s workspace-write -C . "$(cat ../prompts/$name.txt)" -i ref_player.png | tail -3
done
