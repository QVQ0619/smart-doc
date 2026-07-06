# Blade Agent

模块化 AI Agent 框架，提供 Web 交互界面，基于 LangChain + MCP 协议构建。

## 架构

UV workspace monorepo，3 个 Python 包通过 namespace package `blade_agent` 共享命名空间，外加 1 个前端 pnpm monorepo 和 1 个 Go CLI：

![Blade Agent Architecture](docs/diagrams/blade-arch.svg)

> 架构图源文件：[docs/diagrams/](docs/diagrams/)（使用 [D2](https://d2lang.com) + ELK 布局引擎渲染）

| 模块 | 包名 | 说明 |
|------|------|------|
| `core/` | `blade-agent-core` | 协议定义 + `agent_loop` 纯函数，无上游依赖（~1,363 行） |
| `host/` | `blade-agent-host` | 所有具体实现：Engine 总调度台、execution、sessions、llm、skills、tool_host、orchestrator、projections（~12,846 行） |
| `server/` | `blade-agent-server` | HTTP/WebSocket 传输层，依赖 host。FastAPI + Socket.IO + JWT 认证（~2,107 行） |
| `web/` | pnpm monorepo | React 前端（独立于 Python workspace）。`packages/agent-kit` SDK + `apps/web` 主应用 |
| `cli/` | Go module | Blade CLI，**供 Blade Agent 智能体在沙盒内调用**（非面向终端用户或运维）。命令组 `memory` / `session` / `deploy` / `version` |

## 环境要求

- Python >= 3.12
- [UV](https://docs.astral.sh/uv/) (Python 包管理)
- Node.js >= 20 + pnpm (前端)

## 快速开始

```bash
# 1. 安装 Python 依赖
uv sync

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，至少填写 API_KEY 和 BASE_URL

# 3. 启动后端 (FastAPI + Socket.IO, port 8020)
uv run uvicorn blade_agent.server.app:create_app --factory --port 8020

# 4. 启动 Web 前端 (Vite, port 5927, 自动代理后端)
cd web && pnpm install && pnpm dev
```

### AgentKit 集成示例

对外集成示例（npm tgz + Python 脚本 + iframe embed）见 [`examples/README.md`](examples/README.md)。

```bash
pnpm --dir web run examples:pack   # 打包 @blade-hq/agent-kit 到 examples/react-sdk-example/vendor/
pnpm --dir web run examples:dev    # 启动 React SDK 集成示例 (port 5930)
```

### 启动 Web 模式

需要同时运行后端和前端：

```bash
# 后端 (port 8020)
uv run uvicorn blade_agent.server.app:create_app --factory --port 8020

# 前端 (port 5927，自动代理 /api 和 /socket.io 到后端)
cd web && pnpm install && pnpm dev
```

不要使用 reload 启动 Blade Agent 后端。后端运行时会写入 `workspace/` 会话文件；自动重载监听到这些文件变化会重启进程，断开 WebSocket，导致发送消息停在中间态。

### 语音输入（ASR）的 HTTPS 要求

浏览器对 `getUserMedia`（麦克风）强制要求 **secure context**（HTTPS 或 `localhost` / `127.0.0.1`），这是 W3C Secure Contexts 规范，所有主流浏览器都遵守——不是 Chrome 独有的限制。

**会中招的场景**：用局域网 IP 访问 HTTP 部署（`http://192.168.x.x:5927`、`http://内网域名:8020` 等），点麦克风按钮时 console 报 `NotAllowedError: getUserMedia ... only allowed in secure contexts`。

**本地复现（不需要公网服务器）**：

```bash
# 前端绑到所有网卡
cd web && pnpm dev --host
# 浏览器改用 LAN IP 访问，而不是 localhost
# Mac: ipconfig getifaddr en0  → http://<LAN_IP>:5927
```

**公网/生产部署的正解**：上 HTTPS。推荐 Caddy 一把梭（自动 Let's Encrypt）：

```caddy
yourdomain.com {
  reverse_proxy localhost:8020
}
```

内网有域名但无公网出口可以走 Let's Encrypt DNS-01 challenge；完全没有域名只能走 mkcert 自签 + 在每台客户端装根证书。

**临时调试 workaround（仅自用，别给终端用户）**：Chrome 打开 `chrome://flags/#unsafely-treat-insecure-origin-as-secure`，把需要的 origin（如 `http://192.168.1.10:5927`）加进白名单，重启浏览器即可。只对这台 Chrome 生效。

## Docker 镜像

生产环境使用单镜像方案，前端构建产物会被后端直接托管：

- 页面静态资源由后端提供
- API 仍走 `/api`
- Socket.IO 仍走 `/socket.io`
- 前端配置文件通过 `/frontend_config/settings.json` 读写

本地构建：

```bash
docker build -f cicd/Dockerfile -t blade-agent:latest .
```

运行并挂载持久化的前端配置目录：

```bash
docker run --rm \
  -p 8020:8020 \
  -v blade-agent-frontend-config:/app/data/frontend_config \
  blade-agent:latest
```

如需覆盖数据目录位置，可设置 `FRONTEND_CONFIG_DIR`；如需覆盖前端产物目录，可设置 `FRONTEND_DIST_DIR`。

## 沙盒镜像

`DockerSandboxProvider` 会按 `SANDBOX_IMAGE` 直接使用完整镜像名（含 tag）。
`sandbox_type` 仅用于容器池分组，不再参与镜像名拼接。默认示例：

- `registry.cn-beijing.aliyuncs.com/bladeai/blade-sandbox:latest`

仓库内置的沙盒镜像目录：

- `docker/sandbox-images/default`

本地构建：

```bash
# 构建全部沙盒镜像目录
./scripts/build_sandbox_images.sh

# 只构建指定镜像
./scripts/build_sandbox_images.sh default

# 覆盖输出镜像名（含 tag）
SANDBOX_IMAGE=my-sandbox:dev ./scripts/build_sandbox_images.sh default
```

快速验证：

```bash
docker run --rm blade-sandbox:default bash -lc 'echo ok'
docker run --rm blade-sandbox:default python3 -c 'import numpy; print(numpy.__name__)'
docker run --rm blade-sandbox:default python3 -c 'import docx, openpyxl, reportlab, pptx; print("office-ok")'
```

说明：

- `default`：统一的 Bash / Python / 数据分析执行环境
- 默认镜像也应满足 daily `Office文档生成` skill 的依赖与中文字体要求；详细要求可参考 `daily/docs/Office文档生成/sandbox-requirements.md`
- 其中 `docx / xlsx / pptx` 会采用纯 Windows 常见中文字体顺序以提高普通办公电脑上的兼容性，`pdf` 则依赖镜像内可嵌入的 CJK 字体来保证跨机器显示稳定

## 开发

详细的开发环境配置请参考 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

### 测试

```bash
uv run pytest
uv run pytest tests/test_tasks.py              # 单个文件
uv run pytest tests/test_tasks.py::test_name   # 单个用例
```

### Lint

```bash
# Python (ruff)
uv run ruff check core/src/ host/src/ server/src/ tests/

# TypeScript (biome + tsc)
cd web && pnpm lint
cd web && pnpm typecheck
```

### Pre-commit Hook

项目配置了 `.githooks/pre-commit`，对暂存文件自动执行：

- Python: ruff check --fix（自动修复可修复的 lint 问题）
- Python: 单文件行数检查（超过 1500 行会禁止提交）
- TypeScript: tsc 类型检查

首次安装前端依赖时自动激活（`pnpm install` 会执行 `git config core.hooksPath .githooks`）。手动激活：

```bash
git config core.hooksPath .githooks
```

### 关键约定

- **Namespace packages**: `blade_agent/` 目录下无 `__init__.py`，各模块路径如 `core/src/blade_agent/core/`
- **环境变量**: `.env` 从项目根目录加载
- **Build backend**: Hatchling
- **SessionTemplate / ModeSpec**: session 创建后持久化 `template_id`，mode 切换统一写入 `mode_change` 历史事件
- **历史兼容**: 旧 `planning_enter/planning_exit` 与旧 SQLite `entry_type` 数据会在读取/迁移时兼容处理
- **前端代码风格**: Biome (line width 100, double quotes, no semicolons)
- **Python 文件行数**: CI 强制检查 `core/src/ host/src/ server/src/ tests/` 下单文件不超过 1500 行；pre-commit 会禁止提交超过 1500 行的 Python 文件
- **Git 工作流**: 禁止直接推送 main，必须通过 PR

## 环境变量

| 变量 | 说明 |
|------|------|
| `API_KEY` | LLM provider API key |
| `BASE_URL` | LLM API 地址 (默认 OpenRouter) |
| `MODEL_ID` | 模型 ID |
| `SSL_VERIFY` | 是否校验 HTTPS 证书，默认 `false` |
| `LANGFUSE_*` | Langfuse 可观测性配置 |
| `HELICONE_API_KEY` | Helicone 可观测性配置 |
| `SKILL_REGISTRY_URL` | Skill Registry 地址，默认 `http://localhost:8010` |
| `BLADE_AUTH_*` | blade-auth-client / Casdoor 统一登录配置 |
| `WORKSPACE_PATH` | Session 工作区目录 |
| `SKILLS_PATH` | 额外技能目录 |
| `SANDBOX_IMAGE` | 完整沙盒镜像名（含 tag） |
| `FRONTEND_DIST_DIR` | 前端构建产物目录 |
| `FRONTEND_CONFIG_DIR` | 前端配置持久化目录 |
