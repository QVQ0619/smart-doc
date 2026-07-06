#!/usr/bin/env bash
# 一键部署：读取 cicd/.env 配置 → 准备数据目录 → 构建/拉取镜像 → docker compose 起服务。
#
# 用法（任意目录执行均可）：
#   cicd/deploy.sh            # 部署/更新（首次会生成 cicd/.env 并提示填写）
#   cicd/deploy.sh down       # 停止并移除容器（数据目录保留）
#   cicd/deploy.sh restart    # 重启应用容器
#   cicd/deploy.sh logs       # 跟踪应用日志
#   cicd/deploy.sh status     # 查看容器状态
#
# 配置全部在 cicd/.env（模板见 cicd/.env.example）：
#   - DEPLOY_MODE=build 时本地构建镜像，VITE_BLADE_*（含 Token）编译进前端产物；
#     改过任何 VITE_ 值后重跑本脚本即可，会自动重新构建。
#   - SMART_DOC_DATA_DIR 指定数据挂载目录（MySQL 数据 + 上传文件/报告），
#     默认 cicd/data，可改为任意宿主机绝对路径。

set -euo pipefail

CICD_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$CICD_DIR/.env"
COMPOSE_FILE="$CICD_DIR/docker-compose.yaml"

compose() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" "$@"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令: $1" >&2
    exit 1
  fi
}

require_cmd docker
docker compose version >/dev/null 2>&1 || { echo "docker compose 插件不可用" >&2; exit 1; }

# ── 首次运行：从模板生成 .env 并提示填写关键项 ──
if [[ ! -f "$ENV_FILE" ]]; then
  cp "$CICD_DIR/.env.example" "$ENV_FILE"
  echo "已生成 $ENV_FILE，请先填写其中的配置（至少 VITE_BLADE_API_BASE / VITE_BLADE_TOKEN），"
  echo "然后重新执行本脚本。"
  exit 1
fi

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

ACTION="${1:-up}"

case "$ACTION" in
  down)    compose down; exit 0 ;;
  restart) compose restart smart-doc-review; exit 0 ;;
  logs)    compose logs -f smart-doc-review; exit 0 ;;
  status)  compose ps; exit 0 ;;
  up)      ;;
  *) echo "未知操作: $ACTION（支持 up/down/restart/logs/status）" >&2; exit 1 ;;
esac

# ── 数据目录（bind 挂载）：不存在则创建；相对路径以 cicd/ 为基准 ──
DATA_DIR="${SMART_DOC_DATA_DIR:-./data}"
[[ "$DATA_DIR" = /* ]] || DATA_DIR="$CICD_DIR/$DATA_DIR"
mkdir -p "$DATA_DIR/mysql" "$DATA_DIR/storage"
echo "数据目录: $DATA_DIR （mysql/ 数据库，storage/ 上传文件与报告）"

# ── build 模式提醒：Token 为空时前端会提示未配置 Blade API Key ──
if [[ "${DEPLOY_MODE:-build}" == "build" && -z "${VITE_BLADE_TOKEN:-}" ]]; then
  echo "WARN: VITE_BLADE_TOKEN 为空，部署后右侧对话会提示未配置 API Key。" >&2
fi

# ── 构建 / 拉取 ──
if [[ "${DEPLOY_MODE:-build}" == "build" ]]; then
  echo "本地构建镜像（VITE_BLADE_* 编译进前端产物）..."
  compose build smart-doc-review
else
  echo "拉取镜像 ghcr.io/blade-hq/smart-doc-review:${SMART_DOC_IMAGE_TAG:-latest} ..."
  compose pull smart-doc-review
fi

# ── 启动并等待健康 ──
compose up -d

echo -n "等待应用就绪"
for _ in $(seq 1 60); do
  status="$(docker inspect -f '{{.State.Health.Status}}' smart-doc-review 2>/dev/null || echo starting)"
  if [[ "$status" == "healthy" ]]; then
    echo
    echo "部署完成 ✅  URL: http://127.0.0.1:${HOST_APP_PORT:-8000}"
    exit 0
  fi
  echo -n "."
  sleep 2
done

echo
echo "FATAL: 应用未在预期时间内就绪，请查看日志: $0 logs" >&2
exit 1
