"""SQLModel 实体定义（56 表）—— 严格对齐 审查系统-schema_mysql.sql。

约定：
- 表已由 SQL 脚本建好，模型仅做 ORM 映射；唯一约束/检查约束/普通索引由数据库强制，
  此处不重复声明（仅声明主键与外键，关系到 ORM 标识与连表）。
- 类型映射：BIGINT→BigInteger，JSON→mysql.JSON，DATETIME(3)→mysql.DATETIME(fsp=3)，
  DECIMAL→Numeric(p,s)，TINYINT(1)→Boolean，TEXT→Text。
- 三张日志表（agent_run_log/model_call_log/audit_log）为分区表，无外键，
  其引用列以普通 BigInteger 存在。
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, Column, ForeignKey, Numeric, Text, text
from sqlalchemy.dialects.mysql import DATETIME, JSON
from sqlmodel import Field, SQLModel


# --------------------------------------------------------------------------- #
# 列工厂（减少样板）
# --------------------------------------------------------------------------- #
def _pk() -> Any:
    return Field(default=None, sa_column=Column(BigInteger, primary_key=True, autoincrement=True))


def _fk(target: str, *, nullable: bool = True, index: bool = True) -> Any:
    return Field(default=None, sa_column=Column(BigInteger, ForeignKey(target), nullable=nullable, index=index))


def _bigint(*, nullable: bool = True, index: bool = False) -> Any:
    return Field(default=None, sa_column=Column(BigInteger, nullable=nullable, index=index))


def _dt(*, nullable: bool = True, now: bool = False) -> Any:
    kw: dict[str, Any] = {"nullable": nullable}
    if now:
        kw["server_default"] = text("CURRENT_TIMESTAMP(3)")
    return Field(default=None, sa_column=Column(DATETIME(fsp=3), **kw))


def _dt_pk() -> Any:
    return Field(
        default=None,
        sa_column=Column(DATETIME(fsp=3), primary_key=True, nullable=False, server_default=text("CURRENT_TIMESTAMP(3)")),
    )


def _num(p: int, s: int, *, nullable: bool = True) -> Any:
    return Field(default=None, sa_column=Column(Numeric(p, s), nullable=nullable))


def _json(*, nullable: bool = True) -> Any:
    return Field(default=None, sa_column=Column(JSON, nullable=nullable))


def _text_req() -> Any:
    return Field(sa_column=Column(Text, nullable=False))


def _text_opt() -> Any:
    return Field(default=None, sa_column=Column(Text, nullable=True))


# =========================================================================== #
# 5A. 用户权限域
# =========================================================================== #
class Org(SQLModel, table=True):
    __tablename__ = "org"
    id: Optional[int] = _pk()
    name: str
    org_type: str
    parent_id: Optional[int] = _fk("org.id")
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class SysUser(SQLModel, table=True):
    __tablename__ = "sys_user"
    id: Optional[int] = _pk()
    username: str
    display_name: Optional[str] = None
    password_hash: Optional[str] = None   # 简单登录用:salt$sha256,详见 security.py
    org_id: Optional[int] = _fk("org.id")
    secrecy_clearance: str = "内部"
    status: str = "active"
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class Role(SQLModel, table=True):
    __tablename__ = "role"
    id: Optional[int] = _pk()
    code: str
    name: str


class UserRole(SQLModel, table=True):
    __tablename__ = "user_role"
    id: Optional[int] = _pk()
    user_id: int = _fk("sys_user.id", nullable=False)
    role_id: int = _fk("role.id", nullable=False)


class Permission(SQLModel, table=True):
    __tablename__ = "permission"
    id: Optional[int] = _pk()
    code: str
    name: str
    scope: str


class RolePermission(SQLModel, table=True):
    __tablename__ = "role_permission"
    id: Optional[int] = _pk()
    role_id: int = _fk("role.id", nullable=False)
    permission_id: int = _fk("permission.id", nullable=False)


# =========================================================================== #
# 5B. 依据库主数据域
# =========================================================================== #
class ReviewDimension(SQLModel, table=True):
    __tablename__ = "review_dimension"
    id: Optional[int] = _pk()
    code: str
    name: str


class StandardDoc(SQLModel, table=True):
    __tablename__ = "standard_doc"
    id: Optional[int] = _pk()
    doc_code: str
    title: str
    issuer: Optional[str] = None
    pub_year: Optional[int] = None
    version: str = "V1.0"
    file_id: Optional[int] = _fk("file_object.id")
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default=text("1")))
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    recognition_status: str = "pending"
    recognition_error: Optional[str] = _text_opt()


class RegulationClause(SQLModel, table=True):
    __tablename__ = "regulation_clause"
    id: Optional[int] = _pk()
    standard_doc_id: Optional[int] = _fk("standard_doc.id")
    doc_code: str
    clause_no: str
    clause_text: Optional[str] = _text_opt()
    source_path: Optional[str] = None
    embedding_id: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_version: Optional[str] = None
    embedded_at: Optional[datetime] = _dt()
    source_segment_id: Optional[int] = _fk("parse_segment.id")


class ProjectType(SQLModel, table=True):
    __tablename__ = "project_type"
    id: Optional[int] = _pk()
    code: str
    name: str
    sector: str
    parent_id: Optional[int] = _fk("project_type.id")
    level: int = 1


class ReviewStage(SQLModel, table=True):
    __tablename__ = "review_stage"
    id: Optional[int] = _pk()
    code: str
    name: str


class ReviewRule(SQLModel, table=True):
    __tablename__ = "review_rule"
    id: Optional[int] = _pk()
    rule_code: str
    current_version_id: Optional[int] = _fk("review_rule_version.id")
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default=text("1")))
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)


class ReviewRuleVersion(SQLModel, table=True):
    __tablename__ = "review_rule_version"
    id: Optional[int] = _pk()
    rule_id: int = _fk("review_rule.id", nullable=False)
    version: str
    dimension_id: int = _fk("review_dimension.id", nullable=False)
    name: str
    logic: Optional[str] = _text_opt()
    decision_type: str
    disposition: str
    binding_class: str
    embedding_id: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_version: Optional[str] = None
    embedded_at: Optional[datetime] = _dt()
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class ReviewRuleClause(SQLModel, table=True):
    __tablename__ = "review_rule_clause"
    id: Optional[int] = _pk()
    rule_version_id: int = _fk("review_rule_version.id", nullable=False)
    clause_id: int = _fk("regulation_clause.id", nullable=False)
    note: Optional[str] = None


class RuleProject(SQLModel, table=True):
    __tablename__ = "rule_project"
    id: Optional[int] = _pk()
    rule_id: int = _fk("review_rule.id", nullable=False)
    project_type_id: int = _fk("project_type.id", nullable=False)


class RuleStage(SQLModel, table=True):
    __tablename__ = "rule_stage"
    id: Optional[int] = _pk()
    rule_id: int = _fk("review_rule.id", nullable=False)
    stage_id: int = _fk("review_stage.id", nullable=False)


class RuleParam(SQLModel, table=True):
    __tablename__ = "rule_param"
    id: Optional[int] = _pk()
    rule_id: int = _fk("review_rule.id", nullable=False)
    project_type_id: int = _fk("project_type.id", nullable=False)
    param_key: str
    param_value: str
    unit: Optional[str] = None


class FormTemplate(SQLModel, table=True):
    __tablename__ = "form_template"
    id: Optional[int] = _pk()
    project_type_id: int = _fk("project_type.id", nullable=False)
    stage_id: int = _fk("review_stage.id", nullable=False)
    name: str
    version: str


class FormField(SQLModel, table=True):
    __tablename__ = "form_field"
    id: Optional[int] = _pk()
    template_id: int = _fk("form_template.id", nullable=False)
    field_code: str
    field_name: str
    logic_type: str
    is_required: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0")))
    constraint_note: Optional[str] = _text_opt()
    seq: int


class ReportTemplate(SQLModel, table=True):
    __tablename__ = "report_template"
    id: Optional[int] = _pk()
    project_type_id: Optional[int] = _fk("project_type.id")
    stage_id: Optional[int] = _fk("review_stage.id")
    name: str
    fmt: str
    file_id: Optional[int] = _fk("file_object.id")
    version: str
    is_default: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0")))


class RequiredMaterialItem(SQLModel, table=True):
    __tablename__ = "required_material_item"
    id: Optional[int] = _pk()
    project_type_id: int = _fk("project_type.id", nullable=False)
    stage_id: int = _fk("review_stage.id", nullable=False)
    material_category: str
    attachment_type: Optional[str] = None
    required_copies: int = 1
    is_required: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default=text("1")))


# =========================================================================== #
# 5C. 配置包域
# =========================================================================== #
class ConfigPackage(SQLModel, table=True):
    __tablename__ = "config_package"
    id: Optional[int] = _pk()
    code: str
    project_type_id: int = _fk("project_type.id", nullable=False)
    stage_id: int = _fk("review_stage.id", nullable=False)
    name: str
    version: str
    dimension_weight: Optional[Any] = _json()
    flow_config: Optional[Any] = _json()
    report_template_id: Optional[int] = _fk("report_template.id")
    status: str = "draft"
    published_at: Optional[datetime] = _dt()
    published_by: Optional[int] = _fk("sys_user.id")
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class ConfigRuleVersion(SQLModel, table=True):
    __tablename__ = "config_rule_version"
    id: Optional[int] = _pk()
    config_id: int = _fk("config_package.id", nullable=False)
    rule_version_id: int = _fk("review_rule_version.id", nullable=False)


# =========================================================================== #
# 5D. 写作范式域
# =========================================================================== #
class WritingParadigm(SQLModel, table=True):
    __tablename__ = "writing_paradigm"
    id: Optional[int] = _pk()
    project_type_id: int = _fk("project_type.id", nullable=False)
    paradigm_dim: str
    title: str
    description: str = _text_req()
    source_package_id: Optional[int] = _fk("application_package.id")
    version: str = "V1.0"
    status: str = "draft"
    embedding_id: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_version: Optional[str] = None
    embedded_at: Optional[datetime] = _dt()
    confirmed_by: Optional[int] = _fk("sys_user.id")
    confirmed_at: Optional[datetime] = _dt()
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class ParadigmFinding(SQLModel, table=True):
    __tablename__ = "paradigm_finding"
    id: Optional[int] = _pk()
    round_id: int = _fk("review_round.id", nullable=False)
    paradigm_id: Optional[int] = _fk("writing_paradigm.id")
    target_section: str
    suggestion: str = _text_req()
    source_segment_id: Optional[int] = _fk("parse_segment.id")
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


# =========================================================================== #
# 5E. 外部核验/参考域
# =========================================================================== #
class SecrecyLevel(SQLModel, table=True):
    __tablename__ = "secrecy_level"
    id: Optional[int] = _pk()
    code: str
    name: str
    rank: int


class SecurityQualLevel(SQLModel, table=True):
    __tablename__ = "security_qual_level"
    id: Optional[int] = _pk()
    code: str
    name: str
    rank: int


class SecrecyQualMap(SQLModel, table=True):
    __tablename__ = "secrecy_qual_map"
    secrecy_level_id: Optional[int] = Field(
        default=None, sa_column=Column(BigInteger, ForeignKey("secrecy_level.id"), primary_key=True)
    )
    min_qual_level_id: int = _fk("security_qual_level.id", nullable=False)


class ApplicationCode(SQLModel, table=True):
    __tablename__ = "application_code"
    id: Optional[int] = _pk()
    code: str
    name: str
    level: int
    parent_code: Optional[str] = None


class ResearchUnit(SQLModel, table=True):
    __tablename__ = "research_unit"
    id: Optional[int] = _pk()
    name: str
    is_legal_entity: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0")))
    security_qual_level_id: Optional[int] = _fk("security_qual_level.id")
    penalty_until: Optional[datetime] = _dt()


class ResearchPerson(SQLModel, table=True):
    __tablename__ = "research_person"
    id: Optional[int] = _pk()
    name: str
    id_no_hash: Optional[str] = None
    title: Optional[str] = None
    degree: Optional[str] = None
    birth_date: Optional[datetime] = _dt()
    unit_id: int = _fk("research_unit.id", nullable=False)


class PersonHolding(SQLModel, table=True):
    __tablename__ = "person_holding"
    id: Optional[int] = _pk()
    person_id: int = _fk("research_person.id", nullable=False)
    project_no: str
    role: str
    grant_year: Optional[int] = None
    status: str


class IntegrityRecord(SQLModel, table=True):
    __tablename__ = "integrity_record"
    id: Optional[int] = _pk()
    subject_type: str
    subject_id: int = Field(sa_column=Column(BigInteger, nullable=False, index=True))  # 多态，无 FK
    reason: str = _text_req()
    period_start: datetime = _dt(nullable=False)
    period_end: Optional[datetime] = _dt()


# =========================================================================== #
# 5F. 申报批次域
# =========================================================================== #
class DeclaredProject(SQLModel, table=True):
    __tablename__ = "declared_project"
    id: Optional[int] = _pk()
    project_code: str
    project_name: str
    project_type_id: int = _fk("project_type.id", nullable=False)
    declaring_unit_id: int = _fk("research_unit.id", nullable=False)
    applicant_person_id: int = _fk("research_person.id", nullable=False)
    secrecy_level_id: int = _fk("secrecy_level.id", nullable=False)
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    created_by: Optional[int] = _bigint()       # 审计列，不设 FK
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)
    updated_by: Optional[int] = _bigint()


class ReviewBatch(SQLModel, table=True):
    __tablename__ = "review_batch"
    id: Optional[int] = _pk()
    batch_no: str
    project_type_id: int = _fk("project_type.id", nullable=False)
    stage_id: int = _fk("review_stage.id", nullable=False)
    config_id: Optional[int] = _fk("config_package.id")
    declare_period: Optional[str] = None
    status: str = "reviewing"
    created_by: int = _fk("sys_user.id", nullable=False)
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class BatchRuleDoc(SQLModel, table=True):
    __tablename__ = "batch_rule_doc"
    id: Optional[int] = _pk()
    batch_id: int = _fk("review_batch.id", nullable=False)
    standard_doc_id: int = _fk("standard_doc.id", nullable=False)
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class ApplicationPackage(SQLModel, table=True):
    __tablename__ = "application_package"
    id: Optional[int] = _pk()
    batch_id: int = _fk("review_batch.id", nullable=False)
    declared_project_id: int = _fk("declared_project.id", nullable=False)
    current_round: int = 1
    is_sample: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0")))
    status: str = "parsing"
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    created_by: Optional[int] = _bigint()
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)
    updated_by: Optional[int] = _bigint()
    deleted_at: Optional[datetime] = _dt()


# =========================================================================== #
# 5F+. 任务分发域（新增：管理员建任务→传1+4报告→分发→普通用户我的任务）
# =========================================================================== #
class ReviewTask(SQLModel, table=True):
    __tablename__ = "review_task"
    id: Optional[int] = _pk()
    task_no: str
    task_name: str
    project_type_id: Optional[int] = _bigint()
    secrecy_level_id: Optional[int] = _bigint()
    status: str = "created"                      # created→distributed→reviewing→done
    assignee_id: Optional[int] = _bigint(index=True)   # 受理人(普通用户 sys_user.id)
    distributed_by: Optional[int] = _bigint()
    distributed_at: Optional[datetime] = _dt()
    package_id: Optional[int] = _bigint()        # 预留:桥接现有 application_package
    created_by: Optional[int] = _bigint()
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)


class TaskReport(SQLModel, table=True):
    __tablename__ = "task_report"
    id: Optional[int] = _pk()
    task_id: int = _fk("review_task.id", nullable=False)
    report_type: str                              # 见 routers/tasks.py REPORT_TYPES
    file_id: Optional[int] = _fk("file_object.id")
    file_name: Optional[str] = None
    review_status: str = "pending"
    uploaded_by: Optional[int] = _bigint()
    uploaded_at: Optional[datetime] = _dt()


class TaskRule(SQLModel, table=True):
    __tablename__ = "task_rule"
    id: Optional[int] = _pk()
    task_id: int = _fk("review_task.id", nullable=False)
    standard_doc_id: int = _fk("standard_doc.id", nullable=False)  # 规则库中的规则文件
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


# =========================================================================== #
# 5G. 材料解析 + 结构化审查对象域
# =========================================================================== #
class MaterialFile(SQLModel, table=True):
    __tablename__ = "material_file"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int = 1
    material_category: str
    file_name: str
    file_format: str
    file_id: int = _fk("file_object.id", nullable=False)
    secrecy_level_id: int = _fk("secrecy_level.id", nullable=False)
    uploaded_at: Optional[datetime] = _dt(nullable=False, now=True)
    recognition_status: str = "pending"
    recognition_error: Optional[str] = _text_opt()


class ParseSegment(SQLModel, table=True):
    __tablename__ = "parse_segment"
    id: Optional[int] = _pk()
    material_file_id: Optional[int] = _fk("material_file.id")     # 改：可空
    standard_doc_id: Optional[int] = _fk("standard_doc.id")        # 新增
    page_no: Optional[int] = None                                 # 改：docx 无页码，允许空
    locator: Optional[Any] = _json()
    segment_type: str
    content_text: Optional[str] = _text_opt()
    ocr_confidence: Optional[Decimal] = _num(4, 3)


class ExtractedField(SQLModel, table=True):
    __tablename__ = "extracted_field"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int
    form_field_id: int = _fk("form_field.id", nullable=False)
    field_code_snapshot: str
    field_value: Optional[str] = _text_opt()
    source_segment_id: Optional[int] = _fk("parse_segment.id")
    extraction_status: str = "ok"


class PackageMember(SQLModel, table=True):
    __tablename__ = "package_member"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int
    member_role: str
    name: str
    title: Optional[str] = None
    birth_date: Optional[datetime] = _dt()
    unit_name: Optional[str] = None
    person_id: Optional[int] = _fk("research_person.id")
    source_segment_id: Optional[int] = _fk("parse_segment.id")


class PackageCoopUnit(SQLModel, table=True):
    __tablename__ = "package_coop_unit"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int
    coop_type: str
    unit_name: str
    unit_id: Optional[int] = _fk("research_unit.id")
    task_desc: Optional[str] = _text_opt()
    applied_fund: Optional[Decimal] = _num(16, 2)
    source_segment_id: Optional[int] = _fk("parse_segment.id")


class BudgetItem(SQLModel, table=True):
    __tablename__ = "budget_item"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int
    category: str
    item_name: str
    amount: Decimal = _num(16, 2, nullable=False)
    is_subitem: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0")))
    parent_item_id: Optional[int] = _fk("budget_item.id")
    source_segment_id: Optional[int] = _fk("parse_segment.id")


class PackageAttachment(SQLModel, table=True):
    __tablename__ = "package_attachment"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int
    attachment_type: str
    is_present: bool = Field(default=False, sa_column=Column(Boolean, nullable=False, server_default=text("0")))
    material_file_id: Optional[int] = _fk("material_file.id")
    required_item_id: Optional[int] = _fk("required_material_item.id")
    source_segment_id: Optional[int] = _fk("parse_segment.id")


# =========================================================================== #
# 5H. 审查运行域
# =========================================================================== #
class ReviewRound(SQLModel, table=True):
    __tablename__ = "review_round"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int
    conclusion: str = "pending"
    concluded_at: Optional[datetime] = _dt()
    signed_off_by: Optional[int] = _fk("sys_user.id")
    signed_off_at: Optional[datetime] = _dt()
    snapshot_hash: Optional[str] = None
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)


class RoundCheck(SQLModel, table=True):
    __tablename__ = "round_check"
    id: Optional[int] = _pk()
    round_id: int = _fk("review_round.id", nullable=False)
    rule_version_id: int = _fk("review_rule_version.id", nullable=False)
    applied_param_snapshot: Optional[Any] = _json()
    initial_result: str = "pending"
    initial_disposition: Optional[str] = None
    final_result: Optional[str] = None
    final_disposition: Optional[str] = None
    confidence: Optional[Decimal] = _num(4, 3)
    severity: Optional[int] = None
    suggestion: Optional[str] = _text_opt()
    status: str = "open"
    version: int = 0                       # 乐观锁
    reviewed_by: Optional[int] = _fk("sys_user.id")
    reviewed_at: Optional[datetime] = _dt()
    review_remark: Optional[str] = _text_opt()
    checked_at: Optional[datetime] = _dt()
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)


class CheckReviewAction(SQLModel, table=True):
    __tablename__ = "check_review_action"
    id: Optional[int] = _pk()
    round_check_id: int = _fk("round_check.id", nullable=False)
    actor_id: int = _fk("sys_user.id", nullable=False)
    action: str
    from_result: Optional[str] = None
    to_result: Optional[str] = None
    remark: Optional[str] = _text_opt()
    acted_at: Optional[datetime] = _dt(nullable=False, now=True)


class FindingEvidence(SQLModel, table=True):
    __tablename__ = "finding_evidence"
    id: Optional[int] = _pk()
    round_check_id: int = _fk("round_check.id", nullable=False)
    segment_id: Optional[int] = _fk("parse_segment.id")
    field_code: Optional[str] = None
    budget_item_id: Optional[int] = _fk("budget_item.id")
    sim_run_id: Optional[int] = _fk("sim_run.id")
    note: Optional[str] = None


class ReviewReport(SQLModel, table=True):
    __tablename__ = "review_report"
    id: Optional[int] = _pk()
    round_id: int = _fk("review_round.id", nullable=False)
    report_template_id: Optional[int] = _fk("report_template.id")
    generated_at: Optional[datetime] = _dt(nullable=False, now=True)
    version: str = "V1.0"
    file_id: Optional[int] = _fk("file_object.id")


# =========================================================================== #
# 5I. 案例经验域
# =========================================================================== #
class ReviewCase(SQLModel, table=True):
    __tablename__ = "review_case"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    declared_project_id: int = _fk("declared_project.id", nullable=False)
    final_round_id: int = _fk("review_round.id", nullable=False)
    final_report_id: Optional[int] = _fk("review_report.id")
    final_conclusion: str
    finding_count: int = 0
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class CasePattern(SQLModel, table=True):
    __tablename__ = "case_pattern"
    id: Optional[int] = _pk()
    project_type_id: Optional[int] = _fk("project_type.id")
    dimension_id: Optional[int] = _fk("review_dimension.id")
    problem_type: str
    description: str = _text_req()
    frequency: int = 0
    sample_check_id: Optional[int] = _fk("round_check.id")
    embedding_id: Optional[str] = None
    embedding_model: Optional[str] = None
    embedding_version: Optional[str] = None
    embedded_at: Optional[datetime] = _dt()
    updated_at: Optional[datetime] = _dt(nullable=False, now=True)


# =========================================================================== #
# 5J. 仿真域
# =========================================================================== #
class SimPlatform(SQLModel, table=True):
    __tablename__ = "sim_platform"
    id: Optional[int] = _pk()
    code: str
    name: str
    capability: Optional[Any] = _json()
    data_format: Optional[str] = None
    connection: Optional[Any] = _json()
    adapter_key: str
    is_active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, server_default=text("1")))
    created_at: Optional[datetime] = _dt(nullable=False, now=True)


class SimExperiment(SQLModel, table=True):
    __tablename__ = "sim_experiment"
    id: Optional[int] = _pk()
    package_id: int = _fk("application_package.id", nullable=False)
    round_no: int = 1
    scene_type: str
    params: Any = _json(nullable=False)
    inputs_file_id: Optional[int] = _fk("file_object.id")
    claimed_result: Optional[Any] = _json()
    tolerance: Optional[Any] = _json()
    source_segment_id: Optional[int] = _fk("parse_segment.id")
    extracted_at: Optional[datetime] = _dt(nullable=False, now=True)


class SimRun(SQLModel, table=True):
    __tablename__ = "sim_run"
    id: Optional[int] = _pk()
    experiment_id: int = _fk("sim_experiment.id", nullable=False)
    platform_id: int = _fk("sim_platform.id", nullable=False)
    status: str = "queued"
    output_file_id: Optional[int] = _fk("file_object.id")
    compare_result: Optional[str] = None
    deviation: Optional[Decimal] = _num(12, 4)
    conclusion: Optional[str] = _text_opt()
    run_at: Optional[datetime] = _dt()
    finished_at: Optional[datetime] = _dt()


# =========================================================================== #
# 5K. 文件 / 日志审计域
# =========================================================================== #
class FileObject(SQLModel, table=True):
    __tablename__ = "file_object"
    id: Optional[int] = _pk()
    bucket: str
    object_key: str
    file_name: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = _bigint()
    content_hash: Optional[str] = None
    sensitivity: str = "内部"
    uploaded_by: Optional[int] = _fk("sys_user.id")
    created_at: Optional[datetime] = _dt(nullable=False, now=True)
    deleted_at: Optional[datetime] = _dt()


# --- 三张分区日志表：复合主键 (id, 时间)，无外键 ---
class AgentRunLog(SQLModel, table=True):
    __tablename__ = "agent_run_log"
    id: Optional[int] = _pk()
    started_at: Optional[datetime] = _dt_pk()
    round_id: Optional[int] = _bigint(index=True)
    package_id: Optional[int] = _bigint(index=True)
    step: str
    skill: str
    status: str
    detail: Optional[Any] = _json()
    finished_at: Optional[datetime] = _dt()


class ModelCallLog(SQLModel, table=True):
    __tablename__ = "model_call_log"
    id: Optional[int] = _pk()
    called_at: Optional[datetime] = _dt_pk()
    agent_run_id: int = _bigint(nullable=False, index=True)
    model: str
    prompt_tokens: Optional[int] = None
    completion_tokens: Optional[int] = None
    cost: Optional[Decimal] = _num(12, 4)
    latency_ms: Optional[int] = None


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_log"
    id: Optional[int] = _pk()
    op_at: Optional[datetime] = _dt_pk()
    actor_id: Optional[int] = _bigint(index=True)
    op_action: str
    target_type: Optional[str] = None
    target_id: Optional[int] = _bigint()
    op_source: Optional[str] = None
    op_reason: Optional[str] = _text_opt()


__all__ = [
    "Org", "SysUser", "Role", "UserRole", "Permission", "RolePermission",
    "ReviewDimension", "StandardDoc", "RegulationClause", "ProjectType", "ReviewStage",
    "ReviewRule", "ReviewRuleVersion", "ReviewRuleClause", "RuleProject", "RuleStage",
    "RuleParam", "FormTemplate", "FormField", "ReportTemplate", "RequiredMaterialItem",
    "ConfigPackage", "ConfigRuleVersion",
    "WritingParadigm", "ParadigmFinding",
    "SecrecyLevel", "SecurityQualLevel", "SecrecyQualMap", "ApplicationCode",
    "ResearchUnit", "ResearchPerson", "PersonHolding", "IntegrityRecord",
    "DeclaredProject", "ReviewBatch", "BatchRuleDoc", "ApplicationPackage",
    "ReviewTask", "TaskReport", "TaskRule",
    "MaterialFile", "ParseSegment", "ExtractedField", "PackageMember",
    "PackageCoopUnit", "BudgetItem", "PackageAttachment",
    "ReviewRound", "RoundCheck", "CheckReviewAction", "FindingEvidence", "ReviewReport",
    "ReviewCase", "CasePattern",
    "SimPlatform", "SimExperiment", "SimRun",
    "FileObject", "AgentRunLog", "ModelCallLog", "AuditLog",
]
