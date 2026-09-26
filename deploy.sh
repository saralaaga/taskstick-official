#!/usr/bin/env bash
# 一键部署官网到 Cloudflare Pages（taskstick-site，生产分支）。
# 凭据来自本地 Infisical 实例（见 DEPLOY.md），不依赖本机 wrangler 登录态。
set -euo pipefail
cd "$(dirname "$0")"

# 从本地 Infisical 取部署凭据（域名/项目由本目录 .infisical.json 指定）
eval "$(infisical export --env=prod --format=dotenv 2>/dev/null \
  | grep -E '^(CLOUDFLARE_TOKEN|CLOUDFLARE_ACCOUNT_ID)=' | tr -d '"')"
: "${CLOUDFLARE_TOKEN:?Infisical prod 环境缺少 CLOUDFLARE_TOKEN}"
: "${CLOUDFLARE_ACCOUNT_ID:?Infisical prod 环境缺少 CLOUDFLARE_ACCOUNT_ID}"

# Infisical 中的键名是 CLOUDFLARE_TOKEN，wrangler 认的是 CLOUDFLARE_API_TOKEN
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN"

# 仓库根目录含 .venv/.claude/tools 等非站点文件，只打包站点白名单
stage=$(mktemp -d /tmp/taskstick-deploy.XXXXXX)
trap 'rm -rf "$stage"' EXIT
rsync -a --exclude .DS_Store index.html download.html zh assets "$stage/"

npx -y wrangler pages deploy "$stage" \
  --project-name=taskstick-site \
  --branch=main \
  --commit-dirty=true

echo "✅ 部署完成，验证: https://taskstick.com/ (引用 assets/css/site.css 即为新版)"
