# 官网部署

taskstick.com 部署在 **Cloudflare Pages**（项目名 `taskstick-site`，直传模式，**没有 Git 集成**）。
推送到 GitHub 只同步代码，**不会自动部署**——每次更新官网都要手动执行 `./deploy.sh`。

## 一键部署

```bash
./deploy.sh
```

前提条件：

1. 本地 Infisical 实例在运行（Docker 容器 `infisical-backend`，`localhost:80`）；
2. infisical CLI 已登录该实例（`infisical login`，指向 `http://localhost/api`）。

脚本流程：从 Infisical 取凭据 → 打包站点白名单到临时目录 → `wrangler pages deploy` 到生产分支 → 提示验证地址。

## 凭据（本地 Infisical）

来源：本地自建 Infisical 实例，项目 `58a92668-e28d-4649-812c-2c22b6de1fb8`，环境 `prod`
（本目录 `.infisical.json` 已绑定该实例与项目）。

| Infisical 键名 | 用途 |
| --- | --- |
| `CLOUDFLARE_TOKEN` | Cloudflare API Token；wrangler 需要 `CLOUDFLARE_API_TOKEN`，deploy.sh 内已做映射 |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账户 ID |

API Token 权限（账户级，限定到本账户）：

- **Account → Cloudflare Pages → Edit**（必需，覆盖上传/发布）
- Account Settings → Read、User Details → Read（可选，便于 `wrangler whoami` / 列项目排查）

> 注意：该 token 没带 User Details Read 时，`/user/tokens/verify` 和 `wrangler whoami`
> 会报 "Invalid API Token"，但**部署功能完全正常**（2026-09-26 已实测）。判断可用性以
> 实际部署或 `/accounts/{id}/pages/projects` 接口为准。

## 手动步骤（deploy.sh 等价展开）

```bash
# 1. 取凭据
eval "$(infisical export --env=prod --format=dotenv | grep -E '^(CLOUDFLARE_TOKEN|CLOUDFLARE_ACCOUNT_ID)=' | tr -d '"')"
export CLOUDFLARE_API_TOKEN="$CLOUDFLARE_TOKEN"

# 2. 打包站点白名单（仓库根目录有 .venv/.claude/tools 等非站点文件，不能整仓直传）
stage=$(mktemp -d /tmp/taskstick-deploy.XXXXXX)
rsync -a --exclude .DS_Store index.html download.html zh assets "$stage/"

# 3. 部署到生产分支（--branch=main 才会发布到 taskstick.com）
npx -y wrangler pages deploy "$stage" --project-name=taskstick-site --branch=main --commit-dirty=true

# 4. 验证（引用 site.css 即新版）
curl -s https://taskstick.com | grep site.css
```

## 站点结构

- 英文页在根目录（`/`、`/download.html`），中文页在 `/zh/`；
- 全部资源本地化（`assets/fonts/` 的 woff2、`assets/img/app/` 截图），无 Google Fonts 等外链依赖；
- 改动下载推荐逻辑时先跑测试：`node --test tools/download-recommendation.test.mjs`。

## 日常更新流程

```bash
# 改完文件后
node --test tools/download-recommendation.test.mjs   # 有涉及就跑
git add -A && git commit -m "..." && git push        # 同步代码
./deploy.sh                                          # 发布线上
```
