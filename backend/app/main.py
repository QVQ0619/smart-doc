from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from .config import settings
from .db import engine
from .dimensions import ensure_dimensions
from .recognition import reset_stuck_processing
from .routers import standard_docs, clauses, config_packages, material_files


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        with Session(engine) as db:
            ensure_dimensions(db)
            reset_stuck_processing(db)
        yield

    app = FastAPI(title="立项审查文件存储后端", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(standard_docs.router, prefix="/api")
    app.include_router(clauses.router, prefix="/api")
    app.include_router(config_packages.router, prefix="/api")
    app.include_router(material_files.router, prefix="/api")

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    return app


app = create_app()
