ARG NODE_IMAGE=node:24-alpine
ARG PYTHON_IMAGE=python:3.12-slim

# ── 前端构建：Vite 产物为纯静态文件，API 走相对路径 /api ──
FROM ${NODE_IMAGE} AS web-build

# 多架构构建时 amd64/arm64 并行执行，缓存挂载 id 按架构区分，避免抢同一把锁
ARG TARGETARCH
ARG NPM_CONFIG_REGISTRY=https://registry.npmjs.org
ARG VITE_APP_VERSION=
# Blade Agent 接入配置为构建期注入（Vite 编译进产物）。密钥类（VITE_BLADE_TOKEN /
# VITE_SMART_DOC_API_KEY）会明文进镜像，公开镜像务必留空，运行期另行下发。
ARG VITE_BLADE_API_BASE=
ARG VITE_BLADE_SOLUTION_ID=
ARG VITE_BLADE_BIZ_ROLE_ID=
ARG VITE_SMART_DOC_API=
ENV NPM_CONFIG_REGISTRY=${NPM_CONFIG_REGISTRY} \
    VITE_APP_VERSION=${VITE_APP_VERSION} \
    VITE_BLADE_API_BASE=${VITE_BLADE_API_BASE} \
    VITE_BLADE_SOLUTION_ID=${VITE_BLADE_SOLUTION_ID} \
    VITE_BLADE_BIZ_ROLE_ID=${VITE_BLADE_BIZ_ROLE_ID} \
    VITE_SMART_DOC_API=${VITE_SMART_DOC_API}

WORKDIR /app

COPY package.json package-lock.json ./
RUN --mount=type=cache,id=smart-doc-npm-cache-${TARGETARCH},target=/root/.npm,sharing=locked \
    npm ci

COPY index.html tsconfig.json tsconfig.node.json vite.config.ts ./
# 前端以 ?raw 内联 blade/skills 下的技能文件（sessionSkill.ts），构建期必须在场
COPY blade ./blade
COPY src ./src

RUN npm run build


# ── 后端运行时：FastAPI 同时托管前端静态文件 ──
FROM ${PYTHON_IMAGE} AS runtime

ARG TARGETARCH
ARG APT_MIRROR=deb.debian.org
ARG PIP_INDEX_URL=https://pypi.org/simple
ARG PIP_TRUSTED_HOST=
ARG SMART_DOC_VERSION=""
ENV PYTHONUNBUFFERED=1 \
    PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_TRUSTED_HOST=${PIP_TRUSTED_HOST} \
    SMART_DOC_VERSION=${SMART_DOC_VERSION} \
    SMART_FRONTEND_DIST_DIR=/app/web/dist \
    SMART_STORAGE_DIR=/app/storage

WORKDIR /app

# libglib2.0-0: rapidocr(opencv-headless) 运行依赖；libgomp1: onnxruntime；curl: 健康检查
RUN sed -i "s|deb.debian.org|${APT_MIRROR}|g; s|security.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources && \
    apt-get update && \
    apt-get install -y --no-install-recommends \
        curl \
        libglib2.0-0 \
        libgomp1 && \
    rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
# rapidocr 依赖完整版 opencv-python，需要 libGL/libxcb 等 X11 库；
# 服务端无 GUI，换成同 API 的 headless 版，避免给 slim 镜像塞一堆图形库
RUN --mount=type=cache,id=smart-doc-pip-cache-${TARGETARCH},target=/root/.cache/pip,sharing=locked \
    pip install -r requirements.txt && \
    pip uninstall -y opencv-python && \
    pip install opencv-python-headless

COPY backend/app ./app
COPY backend/scripts ./scripts
COPY --from=web-build /app/dist /app/web/dist
COPY cicd/entrypoint.sh ./entrypoint.sh

RUN chmod +x ./entrypoint.sh && mkdir -p /app/storage

VOLUME ["/app/storage"]

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
