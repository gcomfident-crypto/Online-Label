#!/usr/bin/env sh
set -eu

git config core.hooksPath .githooks
echo "已设置本仓库 git hooks 路径为 .githooks"

