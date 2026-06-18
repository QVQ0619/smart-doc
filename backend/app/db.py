from sqlalchemy import create_engine
from sqlmodel import Session

from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)


def get_session():
    with Session(engine) as session:
        yield session
