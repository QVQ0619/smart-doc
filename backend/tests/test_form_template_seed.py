from sqlmodel import Session
from sqlalchemy import func, select
from app.db import engine
from app.materials import ensure_default_form_template, DEFAULT_FORM_FIELDS, SENTINEL
from app.models import FormField, FormTemplate


def test_seed_form_template_idempotent(client):  # client fixture 已清表
    with Session(engine) as db:
        tid1 = ensure_default_form_template(db)
        tid2 = ensure_default_form_template(db)
        assert tid1 == tid2
        tpl_count = db.execute(select(func.count()).select_from(FormTemplate)
                               .where(FormTemplate.version == SENTINEL)).scalar_one()
        ff_count = db.execute(select(func.count()).select_from(FormField)
                              .where(FormField.template_id == tid1)).scalar_one()
        assert tpl_count == 1
        assert ff_count == len(DEFAULT_FORM_FIELDS) == 7
        codes = set(db.execute(select(FormField.field_code)
                               .where(FormField.template_id == tid1)).scalars().all())
        assert "project_name" in codes and "total_budget" in codes
