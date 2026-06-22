"""开发用启动脚本：按 settings.host/settings.port 启动后端。

默认监听 0.0.0.0:8000，对外可达（供远程 agent / 隧道访问本机后端）。
用法（在 backend/ 目录下）：

    .venv\\Scripts\\python run.py

可用环境变量覆盖（沿用 SMART_ 前缀，可写进 .env）：
    SMART_HOST=127.0.0.1   # 改回仅本机访问
    SMART_PORT=8000

等价的纯命令行写法（不经本脚本）：
    .venv\\Scripts\\python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

import uvicorn

from app.config import settings

if __name__ == "__main__":
    uvicorn.run("app.main:app", host=settings.host, port=settings.port, reload=True)
