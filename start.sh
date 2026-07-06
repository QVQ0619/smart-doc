#!/usr/bin/env bash
# 本地一键启动：编译前端 → 后端(FastAPI)托管前端静态 + /api，单端口出服务。
# 默认后台启动(脚本拉起后端即返回)；带 -f/--foreground 前台阻塞(Ctrl+C 停)。
#
# 前置：MySQL 已就绪(默认 root:root@localhost:3306/smart，可用
#   docker compose -f cicd/docker-compose.yaml up -d mysql 快速起一个)。
# 数据库连接用 SMART_DATABASE_URL 覆盖，或写进 backend/.env。

set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PORT="${BACKEND_PORT:-8000}"
DEV_STATE_DIR="${DEV_STATE_DIR:-$ROOT_DIR/.dev}"
BACKEND_LOG="${BACKEND_LOG:-$DEV_STATE_DIR/smart-doc-backend.log}"
FRONTEND_DIST="$ROOT_DIR/dist"
VENV_DIR="$ROOT_DIR/backend/.venv"

FOREGROUND=""
for arg in "$@"; do
  case "$arg" in
    -f|--foreground) FOREGROUND="1" ;;
    -d|--background|--detach) FOREGROUND="" ;;
  esac
done

BACKEND_PID=""

require_cmd() {
  local name="$1"
  if ! command -v "$name" >/dev/null 2>&1; then
    echo "Missing required command: $name" >&2
    exit 1
  fi
}

cleanup() {
  local code=$?
  trap - EXIT INT TERM
  if [[ -n "$FOREGROUND" && -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi
  wait "${BACKEND_PID:-}" 2>/dev/null || true
  exit "$code"
}

trap cleanup EXIT INT TERM

require_cmd node
require_cmd npm
require_cmd python3

# 前端 .env(VITE_BLADE_* 编译期注入)：缺失时从模板拷一份
if [[ ! -f "$ROOT_DIR/.env" && -f "$ROOT_DIR/.env.example" ]]; then
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
  echo "Created .env from .env.example"
fi

if [[ ! -d "$ROOT_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies with npm..."
  (cd "$ROOT_DIR" && npm ci)
fi

# ── 后端依赖（venv 不存在或 requirements.txt 更新过才重装）──
# 优先 uv（快，且不依赖系统 python3-venv/ensurepip）；没有 uv 再退回标准库 venv。
if [[ ! -f "$VENV_DIR/bin/python" ]]; then
  echo "Creating backend virtualenv..."
  rm -rf "$VENV_DIR"
  if command -v uv >/dev/null 2>&1; then
    uv venv "$VENV_DIR"
  else
    python3 -m venv "$VENV_DIR"
  fi
fi
PIP_STAMP="$VENV_DIR/.requirements.stamp"
if [[ ! -f "$PIP_STAMP" || "$ROOT_DIR/backend/requirements.txt" -nt "$PIP_STAMP" ]]; then
  echo "Syncing backend dependencies..."
  if command -v uv >/dev/null 2>&1; then
    uv pip install -q --python "$VENV_DIR/bin/python" -r "$ROOT_DIR/backend/requirements.txt"
  else
    "$VENV_DIR/bin/pip" install -q -r "$ROOT_DIR/backend/requirements.txt"
  fi
  touch "$PIP_STAMP"
else
  echo "Backend dependencies are up to date."
fi

# ── 构建前端（增量：dist 不存在或源码有更新才重新构建）──
# 源码不止 src/：blade/ 下的技能文件以 ?raw 内联进 bundle，index.html 是入口，
# 漏掉它们会导致改了内容却 "skipping build"，跑的是旧 dist。
if [[ ! -f "$FRONTEND_DIST/index.html" ]] || [[ -n "$(find "$ROOT_DIR/src" "$ROOT_DIR/blade" "$ROOT_DIR/index.html" "$ROOT_DIR/package.json" -newer "$FRONTEND_DIST/index.html" 2>/dev/null | head -1)" ]]; then
  echo "Building frontend..."
  (cd "$ROOT_DIR" && npm run build)
  echo "Frontend built → $FRONTEND_DIST"
else
  echo "Frontend dist is up to date, skipping build."
fi

# ── 增量迁移（幂等；与 docker 镜像 entrypoint 行为一致）。DB 没起时给出
#    明确提示并终止，避免 uvicorn 起来后首个请求才报错让人困惑。──
echo "Applying idempotent DB migrations..."
if ! (cd "$ROOT_DIR/backend" && "$VENV_DIR/bin/python" scripts/apply_auth_migration.py && "$VENV_DIR/bin/python" scripts/apply_task_migration.py); then
  echo "FATAL: 数据库不可达或迁移失败。请先启动 MySQL(可用: docker compose -f cicd/docker-compose.yaml up -d mysql)，或检查 SMART_DATABASE_URL。" >&2
  exit 1
fi
# 初始账号(admin/admin123 等)：显式 SMART_SEED_USERS=true 时种入
if [[ "${SMART_SEED_USERS:-}" == "true" ]]; then
  (cd "$ROOT_DIR/backend" && "$VENV_DIR/bin/python" scripts/seed_users.py)
fi

# ── 清理残留进程（上次 Ctrl+C / reload 没杀干净时端口会被占住）──
# 只杀监听 BACKEND_PORT 的进程，不碰其他端口上的服务。
kill_stale_backend() {
  local pids
  if command -v ss >/dev/null 2>&1; then
    pids="$(ss -ltnp 2>/dev/null | awk -v port=":${BACKEND_PORT}" \
      '$4 ~ port"$" {while (match($0, /pid=[0-9]+/)) {print substr($0, RSTART+4, RLENGTH-4); $0=substr($0, RSTART+RLENGTH)}}' \
      | sort -u || true)"
  elif command -v lsof >/dev/null 2>&1; then
    pids="$(lsof -nP -iTCP:"${BACKEND_PORT}" -sTCP:LISTEN -t 2>/dev/null | sort -u || true)"
  else
    echo "WARN: neither ss nor lsof is available; skipping stale backend cleanup" >&2
    pids=""
  fi
  if [[ -z "$pids" ]]; then
    return
  fi
  echo "Port ${BACKEND_PORT} is in use by pid(s): ${pids//$'\n'/ } — killing stale process(es)..."
  # shellcheck disable=SC2086
  kill $pids >/dev/null 2>&1 || true
  sleep 1
  for pid in $pids; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill -9 "$pid" >/dev/null 2>&1 || true
    fi
  done
  sleep 1
  if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk -v port=":${BACKEND_PORT}" '$4 ~ port"$"' | grep -q .; then
    echo "FATAL: port ${BACKEND_PORT} still in use after cleanup" >&2
    exit 1
  fi
}

kill_stale_backend

# ── 启动后端（serve 前端静态文件）──
echo "Starting backend on http://127.0.0.1:${BACKEND_PORT} (serving frontend)"

start_backend() {
  (
    cd "$ROOT_DIR/backend"
    export SMART_FRONTEND_DIST_DIR="$FRONTEND_DIST"
    # --reload-dir 限定只看后端代码：默认会递归监视整个仓库(node_modules /
    # .git / dist 全算)，容易打爆 inotify watch 上限。
    exec "$VENV_DIR/bin/python" -m uvicorn app.main:app --reload \
      --reload-dir "$ROOT_DIR/backend/app" \
      --host 0.0.0.0 --port "$BACKEND_PORT"
  )
}

if [[ -n "$FOREGROUND" ]]; then
  start_backend &
  BACKEND_PID="$!"
  echo
  echo "smart-doc-review is starting (前台)。"
  echo "URL: http://127.0.0.1:${BACKEND_PORT}"
  echo "Press Ctrl+C to stop."
  echo
  wait "$BACKEND_PID" 2>/dev/null || true
else
  mkdir -p "$(dirname "$BACKEND_LOG")"
  start_backend > "$BACKEND_LOG" 2>&1 < /dev/null &
  BACKEND_PID="$!"
  disown "$BACKEND_PID" 2>/dev/null || true
  # 等端口就绪再返回，避免脚本退出时后端还没起好让人误判失败。
  for _ in $(seq 1 30); do
    if { command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"${BACKEND_PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; } || \
       { command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk -v port=":${BACKEND_PORT}" '$4 ~ port"$"' | grep -q .; }; then
      break
    fi
    sleep 1
  done
  echo
  echo "smart-doc-review 已在后台启动 (PID $BACKEND_PID)。"
  echo "URL:  http://127.0.0.1:${BACKEND_PORT}"
  echo "日志: $BACKEND_LOG"
  echo "停止: kill \$(lsof -nP -tiTCP:${BACKEND_PORT} -sTCP:LISTEN)  或重跑本脚本(会先清理)"
  echo "前台模式: $0 -f"
fi
