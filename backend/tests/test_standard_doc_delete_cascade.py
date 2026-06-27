"""彻底删除规则文件：物理级联清除 batch_rule_doc / 规则全链 / 条款 / 段落，并物理删除 standard_doc。"""
import uuid

from sqlalchemy import func, select, text
from sqlmodel import Session

from app.db import engine
from app.models import (BatchRuleDoc, ConfigPackage, ConfigRuleVersion,
                        FileObject, ParseSegment, ProjectType,
                        RegulationClause, ReviewRule, ReviewRuleClause,
                        ReviewRuleVersion, ReviewStage, StandardDoc)


def _upload(client, filename="规则X.pdf") -> int:
    content = f"rule-{uuid.uuid4().hex}".encode()
    r = client.post("/api/standard-docs",
                    files=[("files", (filename, content, "application/pdf"))])
    assert r.status_code == 200, r.text
    return r.json()["uploaded"][0]["id"]


def test_delete_standard_doc_cascades_everything(client):
    doc_id = _upload(client)

    # 写 1 条 RegulationClause + 1 条 ParseSegment（直接落 DB）
    with Session(engine) as s:
        doc_code = s.execute(
            select(StandardDoc.doc_code).where(StandardDoc.id == doc_id)
        ).scalar_one()
        s.add(RegulationClause(standard_doc_id=doc_id, doc_code=doc_code, clause_no="第一条"))
        s.add(ParseSegment(standard_doc_id=doc_id, segment_type="text", content_text="正文"))
        s.commit()
        clause_id = s.execute(
            select(RegulationClause.id).where(RegulationClause.standard_doc_id == doc_id)
        ).scalar_one()

    # 经 API 建 1 条 review_rule（绑定到上面的 clause）
    r = client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [
        {"source_clause_id": clause_id, "dimension_code": "compliance", "name": "规则A",
         "logic": None, "decision_type": "hard", "disposition": "reject",
         "binding_class": "common"}]})
    assert r.status_code == 200, r.text

    # 绑定到批次
    batch_id = client.post("/api/batches", json={"batch_no": "DEL-CASCADE"}).json()["id"]
    client.post(f"/api/batches/{batch_id}/bind-rule-docs",
                json={"standard_doc_ids": [doc_id]})

    # 删除前记录 file_id，用于后续 file_object 软删验证
    with Session(engine) as s:
        file_id = s.execute(
            select(StandardDoc.file_id).where(StandardDoc.id == doc_id)
        ).scalar_one()

    # 彻底删除
    assert client.delete(f"/api/standard-docs/{doc_id}").status_code == 204

    with Session(engine) as s:
        assert s.get(StandardDoc, doc_id) is None                       # 物理删
        assert s.execute(select(func.count()).select_from(BatchRuleDoc)
                         .where(BatchRuleDoc.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(RegulationClause)
                         .where(RegulationClause.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ParseSegment)
                         .where(ParseSegment.standard_doc_id == doc_id)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ReviewRuleClause)).scalar_one() == 0
        # 补：ReviewRule / ReviewRuleVersion 主体表必须同时归零
        assert s.execute(select(func.count()).select_from(ReviewRule)).scalar_one() == 0
        assert s.execute(select(func.count()).select_from(ReviewRuleVersion)).scalar_one() == 0
        # 补：file_object 行仍存在但 deleted_at 应已被置（软删）
        fo = s.get(FileObject, file_id)
        assert fo is not None and fo.deleted_at is not None


def test_delete_standard_doc_blocked_by_config_rule_version(client):
    """规则被纳入配置包时，彻底删除应返回 409，且文档/规则保持不变（假绿堵漏用例）。"""
    doc_id = _upload(client)

    # 建 clause + 规则
    with Session(engine) as s:
        doc_code = s.execute(
            select(StandardDoc.doc_code).where(StandardDoc.id == doc_id)
        ).scalar_one()
        s.add(RegulationClause(standard_doc_id=doc_id, doc_code=doc_code, clause_no="第一条"))
        s.commit()
        clause_id = s.execute(
            select(RegulationClause.id).where(RegulationClause.standard_doc_id == doc_id)
        ).scalar_one()

    r = client.post(f"/api/standard-docs/{doc_id}/rules", json={"rules": [
        {"source_clause_id": clause_id, "dimension_code": "compliance", "name": "被引用规则",
         "logic": None, "decision_type": "hard", "disposition": "reject",
         "binding_class": "common"}]})
    assert r.status_code == 200, r.text

    # 取 rule_version_id
    with Session(engine) as s:
        version_id = s.execute(
            select(ReviewRuleClause.rule_version_id)
            .join(RegulationClause, ReviewRuleClause.clause_id == RegulationClause.id)
            .where(RegulationClause.standard_doc_id == doc_id)
        ).scalar_one()

    # 构造前置主数据（INSERT IGNORE 避同会话重复，code 均有 UNIQUE 约束）
    with Session(engine) as s:
        s.execute(text(
            "INSERT IGNORE INTO project_type (code, name, sector, level) "
            "VALUES ('PT-BLOCK', 'BlockTest', '教育', 1)"
        ))
        s.execute(text(
            "INSERT IGNORE INTO review_stage (code, name) "
            "VALUES ('proposal', '立项建议')"
        ))
        s.commit()
        pt_id = s.execute(text("SELECT id FROM project_type WHERE code='PT-BLOCK'")).scalar_one()
        rs_id = s.execute(text("SELECT id FROM review_stage WHERE code='proposal'")).scalar_one()

        # ConfigPackage：用 raw SQL 插入，避免 SQLModel 把 None→JSON'null' 触发 chk_cp_flow
        uid = uuid.uuid4().hex[:8]
        s.execute(text(
            "INSERT INTO config_package (code, project_type_id, stage_id, name, version, status) "
            "VALUES (:code, :pt_id, :rs_id, 'TestConfigPkg', 'V1.0', 'draft')"
        ), {"code": f"CP-{uid}", "pt_id": pt_id, "rs_id": rs_id})
        s.commit()
        cp_id = s.execute(
            text(f"SELECT id FROM config_package WHERE code='CP-{uid}'")
        ).scalar_one()

        # ConfigRuleVersion 引用 version_id → 触发预检拦截
        crv = ConfigRuleVersion(config_id=cp_id, rule_version_id=version_id)
        s.add(crv)
        s.commit()

    # 删除必须被拦截 → 409
    resp = client.delete(f"/api/standard-docs/{doc_id}")
    assert resp.status_code == 409, f"期望 409，实际 {resp.status_code}: {resp.text}"
    detail = resp.json().get("detail", "")
    assert "无法彻底删除" in detail, f"detail 未含预期中文提示: {detail}"

    # 文档与规则/版本仍保持不变
    with Session(engine) as s:
        assert s.get(StandardDoc, doc_id) is not None, "StandardDoc 被错误删除"
        assert s.execute(
            select(func.count()).select_from(ReviewRuleVersion)
            .where(ReviewRuleVersion.id == version_id)
        ).scalar_one() == 1, "ReviewRuleVersion 被错误删除"


def test_delete_standard_doc_unknown_404(client):
    assert client.delete("/api/standard-docs/999999").status_code == 404
