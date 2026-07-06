#!/bin/sh
# 容器启动入口：先幂等应用增量迁移（基础 schema 之外的列/表），再起服务。
# compose 里 depends_on: mysql(healthy) 保证 DB 就绪；独立 docker run 时若 DB
# 未就绪会失败退出，交给 restart 策略重试。
set -e

if [ "${SMART_AUTO_MIGRATE:-true}" = "true" ]; then
    python scripts/apply_auth_migration.py
    python scripts/apply_task_migration.py
    python scripts/apply_settings_migration.py
fi

# 初始账号（admin/admin123 等）仅在显式开启时种入，避免生产误留默认口令
if [ "${SMART_SEED_USERS:-false}" = "true" ]; then
    python scripts/seed_users.py
fi

exec uvicorn app.main:app --host 0.0.0.0 --port 8000
