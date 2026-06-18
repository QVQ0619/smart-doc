from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .db import Base, engine


def create_app() -> FastAPI:
    app = FastAPI(title="立项审查文件存储后端")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    Base.metadata.create_all(bind=engine)

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
