-- =============================================================================
-- 项目申报智能审查与仿真验证平台 · MySQL 8 建表脚本（权威结构）
-- 来源：02-数据库设计_全平台.md（56 表 v3） + 03-数据库设计_MySQL适配与改进.md（物理实现规则）
-- 引擎 InnoDB / 字符集 utf8mb4 / 时间统一存 UTC（DATETIME(3)，应用层转换）
-- 要求：MySQL 8.0.17+（CHECK / 函数索引 / JSON_SCHEMA_VALID）
-- 约定：JSONB→JSON，TIMESTAMPTZ→DATETIME(3)，NUMERIC→定精度 DECIMAL，BOOLEAN→TINYINT(1)，
--       枚举→VARCHAR+CHECK，分区表放弃外键，round_check 默认保留外键。
-- 执行：mysql -u<user> -p < 审查系统-schema_mysql.sql
-- =============================================================================

CREATE DATABASE IF NOT EXISTS smart
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE smart;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;   -- 允许按任意顺序建表 + 解决 review_rule↔review_rule_version 循环依赖

-- =============================================================================
-- 5A. 用户权限域
-- =============================================================================

CREATE TABLE org (                                            -- 5.1 机构
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(128) NOT NULL,
  org_type   VARCHAR(16)  NOT NULL,
  parent_id  BIGINT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_org_name (name),
  KEY idx_org_parent (parent_id),
  CONSTRAINT fk_org_parent FOREIGN KEY (parent_id) REFERENCES org(id),
  CONSTRAINT chk_org_type CHECK (org_type IN ('受理机构','依托单位','其他'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE sys_user (                                        -- 5.2 用户【+org_id】
  id                BIGINT AUTO_INCREMENT PRIMARY KEY,
  username          VARCHAR(64) NOT NULL,
  display_name      VARCHAR(64) NULL,
  org_id            BIGINT NULL,
  secrecy_clearance VARCHAR(8)  NOT NULL DEFAULT '内部',
  status            VARCHAR(16) NOT NULL DEFAULT 'active',
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_user_name (username),
  KEY idx_user_org (org_id),
  KEY idx_user_status (status),
  KEY idx_user_clearance (secrecy_clearance),
  CONSTRAINT fk_user_org FOREIGN KEY (org_id) REFERENCES org(id),
  CONSTRAINT chk_user_status CHECK (status IN ('active','disabled')),
  CONSTRAINT chk_user_clearance CHECK (secrecy_clearance IN ('内部','秘密','机密','绝密'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE role (                                           -- 5.3 角色
  id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(24) NOT NULL,
  name VARCHAR(32) NOT NULL,
  UNIQUE KEY uq_role_code (code),
  CONSTRAINT chk_role_code CHECK (code IN ('research_admin','reviewer','sys_admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE user_role (                                      -- 5.4 用户×角色
  id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  role_id BIGINT NOT NULL,
  UNIQUE KEY uq_user_role (user_id, role_id),
  KEY idx_ur_role (role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES sys_user(id),
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES role(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE permission (                                     -- 5.5 权限点
  id    BIGINT AUTO_INCREMENT PRIMARY KEY,
  code  VARCHAR(40) NOT NULL,
  name  VARCHAR(64) NOT NULL,
  scope VARCHAR(16) NOT NULL,
  UNIQUE KEY uq_perm_code (code),
  CONSTRAINT chk_perm_scope CHECK (scope IN ('global','fund','batch'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE role_permission (                                -- 5.6 角色×权限
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  role_id       BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  UNIQUE KEY uq_role_perm (role_id, permission_id),
  KEY idx_rp_perm (permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES role(id),
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permission(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5B. 依据库主数据域
-- =============================================================================

CREATE TABLE review_dimension (                               -- 5.7 审查维度（6 行）
  id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(16) NOT NULL,
  UNIQUE KEY uq_dim_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE standard_doc (                                   -- 5.8 规则标准库·政策文件元数据
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  doc_code   VARCHAR(40)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  issuer     VARCHAR(128) NULL,
  pub_year   INT NULL,
  version    VARCHAR(16)  NOT NULL DEFAULT 'V1.0',
  file_id    BIGINT NULL,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  recognition_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  recognition_error  TEXT NULL,
  UNIQUE KEY uq_doc_code (doc_code),
  KEY idx_doc_year (pub_year),
  KEY idx_doc_active (is_active),
  KEY idx_doc_file (file_id),
  CONSTRAINT fk_doc_file FOREIGN KEY (file_id) REFERENCES file_object(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE regulation_clause (                              -- 5.9 依据条款【+embedding】
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  standard_doc_id BIGINT NULL,
  doc_code        VARCHAR(40) NOT NULL,
  clause_no       VARCHAR(40) NOT NULL,
  clause_text     TEXT NULL,
  source_path     VARCHAR(500) NULL,
  embedding_id      VARCHAR(64) NULL,
  embedding_model   VARCHAR(64) NULL,
  embedding_version VARCHAR(16) NULL,
  embedded_at       DATETIME(3) NULL,
  source_segment_id BIGINT NULL,
  KEY idx_clause_doc (standard_doc_id),
  KEY idx_clause_code (doc_code),
  KEY idx_clause_seg (source_segment_id),
  CONSTRAINT fk_clause_doc FOREIGN KEY (standard_doc_id) REFERENCES standard_doc(id),
  CONSTRAINT fk_rc_seg     FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE project_type (                                   -- 5.10 项目/基金类型（自引用）
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  code      VARCHAR(40) NOT NULL,
  name      VARCHAR(80) NOT NULL,
  sector    VARCHAR(8)  NOT NULL,
  parent_id BIGINT NULL,
  `level`   INT NOT NULL DEFAULT 1,
  UNIQUE KEY uq_pt_code (code),
  KEY idx_pt_sector (sector),
  KEY idx_pt_parent (parent_id),
  CONSTRAINT fk_pt_parent FOREIGN KEY (parent_id) REFERENCES project_type(id),
  CONSTRAINT chk_pt_sector CHECK (sector IN ('政府','教育','国防'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE review_stage (                                   -- 5.11 审查阶段（2 行）
  id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(24) NOT NULL,
  UNIQUE KEY uq_stage_code (code),
  CONSTRAINT chk_stage_code CHECK (code IN ('proposal','task'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE review_rule (                                    -- 5.12 规则身份 + 当前版本指针
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_code          VARCHAR(24) NOT NULL,
  current_version_id BIGINT NULL,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rule_code (rule_code),
  KEY idx_rule_curver (current_version_id),
  KEY idx_rule_active (is_active),
  CONSTRAINT fk_rule_curver FOREIGN KEY (current_version_id) REFERENCES review_rule_version(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE review_rule_version (                            -- 5.13 不可变规则版本【+embedding】
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_id        BIGINT NOT NULL,
  version        VARCHAR(16) NOT NULL,
  dimension_id   BIGINT NOT NULL,
  name           VARCHAR(160) NOT NULL,
  logic          TEXT NULL,
  decision_type  VARCHAR(8)  NOT NULL,
  disposition    VARCHAR(8)  NOT NULL,
  binding_class  VARCHAR(16) NOT NULL,
  embedding_id      VARCHAR(64) NULL,
  embedding_model   VARCHAR(64) NULL,
  embedding_version VARCHAR(16) NULL,
  embedded_at       DATETIME(3) NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rv_rule_ver (rule_id, version),
  KEY idx_rv_rule (rule_id),
  KEY idx_rv_dim (dimension_id),
  CONSTRAINT fk_rv_rule FOREIGN KEY (rule_id) REFERENCES review_rule(id),
  CONSTRAINT fk_rv_dim  FOREIGN KEY (dimension_id) REFERENCES review_dimension(id),
  CONSTRAINT chk_rv_decision CHECK (decision_type IN ('hard','verify','soft')),
  CONSTRAINT chk_rv_disp     CHECK (disposition IN ('reject','fix','review')),
  CONSTRAINT chk_rv_binding  CHECK (binding_class IN ('common','parameterized','specific'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE review_rule_clause (                             -- 5.14 规则版本×依据条款
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_version_id BIGINT NOT NULL,
  clause_id      BIGINT NOT NULL,
  note           VARCHAR(255) NULL,
  UNIQUE KEY uq_rvc (rule_version_id, clause_id),
  KEY idx_rvc_clause (clause_id),
  CONSTRAINT fk_rvc_rv     FOREIGN KEY (rule_version_id) REFERENCES review_rule_version(id),
  CONSTRAINT fk_rvc_clause FOREIGN KEY (clause_id) REFERENCES regulation_clause(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE rule_project (                                   -- 5.15 规则×项目
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_id         BIGINT NOT NULL,
  project_type_id BIGINT NOT NULL,
  UNIQUE KEY uq_rp (rule_id, project_type_id),
  KEY idx_rp_pt (project_type_id),
  CONSTRAINT fk_rprj_rule FOREIGN KEY (rule_id) REFERENCES review_rule(id),
  CONSTRAINT fk_rprj_pt   FOREIGN KEY (project_type_id) REFERENCES project_type(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE rule_stage (                                     -- 5.16 规则×阶段
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_id  BIGINT NOT NULL,
  stage_id BIGINT NOT NULL,
  UNIQUE KEY uq_rs (rule_id, stage_id),
  KEY idx_rs_stage (stage_id),
  CONSTRAINT fk_rs_rule  FOREIGN KEY (rule_id) REFERENCES review_rule(id),
  CONSTRAINT fk_rs_stage FOREIGN KEY (stage_id) REFERENCES review_stage(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE rule_param (                                     -- 5.17 规则参数
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  rule_id         BIGINT NOT NULL,
  project_type_id BIGINT NOT NULL,
  param_key       VARCHAR(40) NOT NULL,
  param_value     VARCHAR(64) NOT NULL,
  unit            VARCHAR(16) NULL,
  UNIQUE KEY uq_param (rule_id, project_type_id, param_key),
  KEY idx_param_pt (project_type_id),
  CONSTRAINT fk_param_rule FOREIGN KEY (rule_id) REFERENCES review_rule(id),
  CONSTRAINT fk_param_pt   FOREIGN KEY (project_type_id) REFERENCES project_type(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE form_template (                                  -- 5.18 申报书字段模板
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_type_id BIGINT NOT NULL,
  stage_id        BIGINT NOT NULL,
  name            VARCHAR(80) NOT NULL,
  version         VARCHAR(16) NOT NULL,
  UNIQUE KEY uq_ft (project_type_id, stage_id, version),
  KEY idx_ft_stage (stage_id),
  CONSTRAINT fk_ft_pt    FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_ft_stage FOREIGN KEY (stage_id) REFERENCES review_stage(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE form_field (                                     -- 5.19 字段定义
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  template_id    BIGINT NOT NULL,
  field_code     VARCHAR(40) NOT NULL,
  field_name     VARCHAR(80) NOT NULL,
  logic_type     VARCHAR(16) NOT NULL,
  is_required    TINYINT(1) NOT NULL DEFAULT 0,
  constraint_note TEXT NULL,
  seq            INT NOT NULL,
  UNIQUE KEY uq_ff (template_id, field_code),
  KEY idx_ff_tpl (template_id),
  CONSTRAINT fk_ff_tpl FOREIGN KEY (template_id) REFERENCES form_template(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE report_template (                                -- 5.20 审查报告模板【file_id】
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_type_id BIGINT NULL,
  stage_id        BIGINT NULL,
  name            VARCHAR(80) NOT NULL,
  fmt             VARCHAR(8)  NOT NULL,
  file_id         BIGINT NULL,
  version         VARCHAR(16) NOT NULL,
  is_default      TINYINT(1) NOT NULL DEFAULT 0,
  KEY idx_rt_pt (project_type_id),
  KEY idx_rt_default (is_default),
  KEY idx_rt_file (file_id),
  CONSTRAINT fk_rt_pt    FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_rt_stage FOREIGN KEY (stage_id) REFERENCES review_stage(id),
  CONSTRAINT fk_rt_file  FOREIGN KEY (file_id) REFERENCES file_object(id),
  CONSTRAINT chk_rt_fmt  CHECK (fmt IN ('docx','md','pdf'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE required_material_item (                         -- 5.21 必交材料/附件清单
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_type_id BIGINT NOT NULL,
  stage_id        BIGINT NOT NULL,
  material_category VARCHAR(24) NOT NULL,
  attachment_type   VARCHAR(24) NULL,
  required_copies INT NOT NULL DEFAULT 1,
  is_required     TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_rmi (project_type_id, stage_id, material_category, attachment_type),
  KEY idx_rmi_stage (stage_id),
  CONSTRAINT fk_rmi_pt    FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_rmi_stage FOREIGN KEY (stage_id) REFERENCES review_stage(id),
  CONSTRAINT chk_rmi_cat  CHECK (material_category IN ('application_form','budget','cv','research_plan','attachment'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5C. 配置包域
-- =============================================================================

CREATE TABLE config_package (                                 -- 5.22 配置包（版本化）
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(40) NOT NULL,
  project_type_id BIGINT NOT NULL,
  stage_id        BIGINT NOT NULL,
  name            VARCHAR(80) NOT NULL,
  version         VARCHAR(16) NOT NULL,
  dimension_weight JSON NULL,
  flow_config      JSON NULL,
  report_template_id BIGINT NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'draft',
  published_at    DATETIME(3) NULL,
  published_by    BIGINT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_cp_code_ver (code, version),
  KEY idx_cp_pt (project_type_id),
  KEY idx_cp_stage (stage_id),
  KEY idx_cp_status (status),
  CONSTRAINT fk_cp_pt    FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_cp_stage FOREIGN KEY (stage_id) REFERENCES review_stage(id),
  CONSTRAINT fk_cp_tpl   FOREIGN KEY (report_template_id) REFERENCES report_template(id),
  CONSTRAINT fk_cp_user  FOREIGN KEY (published_by) REFERENCES sys_user(id),
  CONSTRAINT chk_cp_status CHECK (status IN ('draft','active','retired')),
  CONSTRAINT chk_cp_weight CHECK (dimension_weight IS NULL OR JSON_SCHEMA_VALID('{"type":"object"}', dimension_weight)),
  CONSTRAINT chk_cp_flow   CHECK (flow_config IS NULL OR JSON_SCHEMA_VALID('{"type":"object"}', flow_config))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE config_rule_version (                            -- 5.23 配置包×规则版本快照
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  config_id       BIGINT NOT NULL,
  rule_version_id BIGINT NOT NULL,
  UNIQUE KEY uq_crv (config_id, rule_version_id),
  KEY idx_crv_rv (rule_version_id),
  CONSTRAINT fk_crv_cfg FOREIGN KEY (config_id) REFERENCES config_package(id),
  CONSTRAINT fk_crv_rv  FOREIGN KEY (rule_version_id) REFERENCES review_rule_version(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5D. 写作范式域（软规则）
-- =============================================================================

CREATE TABLE writing_paradigm (                               -- 5.24 写作范式库【+embedding】
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_type_id BIGINT NOT NULL,
  paradigm_dim    VARCHAR(16) NOT NULL,
  title           VARCHAR(160) NOT NULL,
  description     TEXT NOT NULL,
  source_package_id BIGINT NULL,
  version         VARCHAR(16) NOT NULL DEFAULT 'V1.0',
  status          VARCHAR(16) NOT NULL DEFAULT 'draft',
  embedding_id      VARCHAR(64) NULL,
  embedding_model   VARCHAR(64) NULL,
  embedding_version VARCHAR(16) NULL,
  embedded_at       DATETIME(3) NULL,
  confirmed_by    BIGINT NULL,
  confirmed_at    DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_wp_pt (project_type_id),
  KEY idx_wp_status (status),
  CONSTRAINT fk_wp_pt   FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_wp_src  FOREIGN KEY (source_package_id) REFERENCES application_package(id),
  CONSTRAINT fk_wp_user FOREIGN KEY (confirmed_by) REFERENCES sys_user(id),
  CONSTRAINT chk_wp_dim    CHECK (paradigm_dim IN ('结构组织','逻辑论证','数据呈现','创新表述','经费论证','其他')),
  CONSTRAINT chk_wp_status CHECK (status IN ('draft','active','retired'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE paradigm_finding (                               -- 5.25 写作提升建议（软规则产物）
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id         BIGINT NOT NULL,
  paradigm_id      BIGINT NULL,
  target_section   VARCHAR(80) NOT NULL,
  suggestion       TEXT NOT NULL,
  source_segment_id BIGINT NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_pf_round (round_id),
  KEY idx_pf_paradigm (paradigm_id),
  CONSTRAINT fk_pf_round FOREIGN KEY (round_id) REFERENCES review_round(id),
  CONSTRAINT fk_pf_para  FOREIGN KEY (paradigm_id) REFERENCES writing_paradigm(id),
  CONSTRAINT fk_pf_seg   FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5E. 外部核验/参考域
-- =============================================================================

CREATE TABLE secrecy_level (                                  -- 5.26 密级
  id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(8) NOT NULL,
  name VARCHAR(8) NOT NULL,
  `rank` INT NOT NULL,
  UNIQUE KEY uq_sl_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE security_qual_level (                            -- 5.27 保密资质等级
  id   BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(8) NOT NULL,
  name VARCHAR(8) NOT NULL,
  `rank` INT NOT NULL,
  UNIQUE KEY uq_sql_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE secrecy_qual_map (                               -- 5.28 密级→最低资质（1:1）
  secrecy_level_id  BIGINT NOT NULL PRIMARY KEY,
  min_qual_level_id BIGINT NOT NULL,
  KEY idx_sqm_qual (min_qual_level_id),
  CONSTRAINT fk_sqm_sl   FOREIGN KEY (secrecy_level_id) REFERENCES secrecy_level(id),
  CONSTRAINT fk_sqm_qual FOREIGN KEY (min_qual_level_id) REFERENCES security_qual_level(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE application_code (                               -- 5.29 申请代码（自引用）
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(16)  NOT NULL,
  name        VARCHAR(128) NOT NULL,
  `level`     INT NOT NULL,
  parent_code VARCHAR(16) NULL,
  UNIQUE KEY uq_ac_code (code),
  KEY idx_ac_parent (parent_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE research_unit (                                  -- 5.30 研究单位
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,
  is_legal_entity TINYINT(1) NOT NULL DEFAULT 0,
  security_qual_level_id BIGINT NULL,
  penalty_until   DATETIME(3) NULL,
  UNIQUE KEY uq_ru_name (name),
  KEY idx_ru_qual (security_qual_level_id),
  CONSTRAINT fk_ru_qual FOREIGN KEY (security_qual_level_id) REFERENCES security_qual_level(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE research_person (                                -- 5.31 研究人员
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  id_no_hash VARCHAR(64) NULL,
  title      VARCHAR(8) NULL,
  degree     VARCHAR(8) NULL,
  birth_date DATETIME(3) NULL,
  unit_id    BIGINT NOT NULL,
  KEY idx_rp_idhash (id_no_hash),
  KEY idx_rp_unit (unit_id),
  CONSTRAINT fk_rp_unit FOREIGN KEY (unit_id) REFERENCES research_unit(id),
  CONSTRAINT chk_rp_title  CHECK (title IS NULL OR title IN ('正高','副高','中级','初级','无')),
  CONSTRAINT chk_rp_degree CHECK (degree IS NULL OR degree IN ('博士','硕士','学士','无'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE person_holding (                                 -- 5.32 限项
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  person_id  BIGINT NOT NULL,
  project_no VARCHAR(64) NOT NULL,
  role       VARCHAR(16) NOT NULL,
  grant_year INT NULL,
  status     VARCHAR(16) NOT NULL,
  KEY idx_ph_person (person_id),
  KEY idx_ph_status (status),
  CONSTRAINT fk_ph_person FOREIGN KEY (person_id) REFERENCES research_person(id),
  CONSTRAINT chk_ph_role   CHECK (role IN ('lead','participant')),
  CONSTRAINT chk_ph_status CHECK (status IN ('ongoing','applying','closed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE integrity_record (                               -- 5.33 失信库（多态主体）
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  subject_type VARCHAR(8) NOT NULL,
  subject_id   BIGINT NOT NULL,
  reason       TEXT NOT NULL,
  period_start DATETIME(3) NOT NULL,
  period_end   DATETIME(3) NULL,
  KEY idx_ir_subject (subject_type, subject_id),
  KEY idx_ir_end (period_end),
  CONSTRAINT chk_ir_subject CHECK (subject_type IN ('person','unit'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5F. 申报批次域
-- =============================================================================

CREATE TABLE declared_project (                               -- 5.34 申报项目（跨阶段主体）
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_code       VARCHAR(64)  NOT NULL,
  project_name       VARCHAR(200) NOT NULL,
  project_type_id    BIGINT NOT NULL,
  declaring_unit_id  BIGINT NOT NULL,
  applicant_person_id BIGINT NOT NULL,
  secrecy_level_id   BIGINT NOT NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by         BIGINT NULL,
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by         BIGINT NULL,
  UNIQUE KEY uq_dp_code (project_code),
  KEY idx_dp_pt (project_type_id),
  KEY idx_dp_unit (declaring_unit_id),
  KEY idx_dp_person (applicant_person_id),
  CONSTRAINT fk_dp_pt     FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_dp_unit   FOREIGN KEY (declaring_unit_id) REFERENCES research_unit(id),
  CONSTRAINT fk_dp_person FOREIGN KEY (applicant_person_id) REFERENCES research_person(id),
  CONSTRAINT fk_dp_sl     FOREIGN KEY (secrecy_level_id) REFERENCES secrecy_level(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE review_batch (                                   -- 5.35 审查批次【+config_id】
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_no        VARCHAR(32) NOT NULL,
  project_type_id BIGINT NOT NULL,
  stage_id        BIGINT NOT NULL,
  config_id       BIGINT NULL,
  declare_period  VARCHAR(32) NULL,
  status          VARCHAR(16) NOT NULL DEFAULT 'reviewing',
  created_by      BIGINT NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rb_no (batch_no),
  KEY idx_rb_pt (project_type_id),
  KEY idx_rb_stage (stage_id),
  KEY idx_rb_config (config_id),
  KEY idx_rb_status (status),
  CONSTRAINT fk_rb_pt     FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_rb_stage  FOREIGN KEY (stage_id) REFERENCES review_stage(id),
  CONSTRAINT fk_rb_config FOREIGN KEY (config_id) REFERENCES config_package(id),
  CONSTRAINT fk_rb_user   FOREIGN KEY (created_by) REFERENCES sys_user(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE application_package (                            -- 5.36 申报包【+审计+软删除】
  id                 BIGINT AUTO_INCREMENT PRIMARY KEY,
  batch_id           BIGINT NOT NULL,
  declared_project_id BIGINT NOT NULL,
  current_round      INT NOT NULL DEFAULT 1,
  is_sample          TINYINT(1) NOT NULL DEFAULT 0,
  status             VARCHAR(16) NOT NULL DEFAULT 'parsing',
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_by         BIGINT NULL,
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  updated_by         BIGINT NULL,
  deleted_at         DATETIME(3) NULL,
  UNIQUE KEY uq_ap (batch_id, declared_project_id),
  KEY idx_ap_dp (declared_project_id),
  KEY idx_ap_sample (is_sample),
  KEY idx_ap_status (status),
  CONSTRAINT fk_ap_batch FOREIGN KEY (batch_id) REFERENCES review_batch(id),
  CONSTRAINT fk_ap_dp    FOREIGN KEY (declared_project_id) REFERENCES declared_project(id),
  CONSTRAINT chk_ap_status CHECK (status IN ('parsing','reviewing','concluded'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- 批次 ↔ 规则文件 绑定（N:M）
CREATE TABLE batch_rule_doc (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  batch_id        BIGINT      NOT NULL,
  standard_doc_id BIGINT      NOT NULL,
  created_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_brd (batch_id, standard_doc_id),
  KEY idx_brd_doc (standard_doc_id),
  CONSTRAINT fk_brd_batch FOREIGN KEY (batch_id)        REFERENCES review_batch(id),
  CONSTRAINT fk_brd_doc   FOREIGN KEY (standard_doc_id) REFERENCES standard_doc(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 5G. 材料解析 + 结构化审查对象域
-- =============================================================================

CREATE TABLE material_file (                                  -- 5.37 材料文件【file_id】
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id      BIGINT NOT NULL,
  round_no        INT NOT NULL DEFAULT 1,
  material_category VARCHAR(24) NOT NULL,
  file_name       VARCHAR(255) NOT NULL,
  file_format     VARCHAR(16) NOT NULL,
  file_id         BIGINT NOT NULL,
  secrecy_level_id BIGINT NOT NULL,
  uploaded_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  recognition_status VARCHAR(16) NOT NULL DEFAULT 'pending',
  recognition_error  TEXT NULL,
  KEY idx_mf_pkg (package_id),
  KEY idx_mf_round (round_no),
  KEY idx_mf_cat (material_category),
  KEY idx_mf_file (file_id),
  CONSTRAINT fk_mf_pkg  FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_mf_file FOREIGN KEY (file_id) REFERENCES file_object(id),
  CONSTRAINT fk_mf_sl   FOREIGN KEY (secrecy_level_id) REFERENCES secrecy_level(id),
  CONSTRAINT chk_mf_cat CHECK (material_category IN ('application_form','budget','cv','research_plan','attachment'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE parse_segment (                                  -- 5.38 解析片段·留页定位（溯源锚）
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  material_file_id BIGINT NULL,
  standard_doc_id  BIGINT NULL,
  page_no          INT NULL,
  locator          JSON NULL,
  segment_type     VARCHAR(8) NOT NULL,
  content_text     TEXT NULL,
  ocr_confidence   DECIMAL(4,3) NULL,
  KEY idx_ps_file (material_file_id),
  KEY idx_ps_doc (standard_doc_id),
  CONSTRAINT fk_ps_file FOREIGN KEY (material_file_id) REFERENCES material_file(id),
  CONSTRAINT fk_ps_doc  FOREIGN KEY (standard_doc_id) REFERENCES standard_doc(id),
  CONSTRAINT chk_ps_type CHECK (segment_type IN ('text','table','title','figure')),
  CONSTRAINT chk_ps_source CHECK (
    (material_file_id IS NOT NULL AND standard_doc_id IS NULL)
    OR (material_file_id IS NULL AND standard_doc_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE extracted_field (                                -- 5.39 标量字段
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id       BIGINT NOT NULL,
  round_no         INT NOT NULL,
  form_field_id    BIGINT NOT NULL,
  field_code_snapshot VARCHAR(40) NOT NULL,
  field_value      TEXT NULL,
  source_segment_id BIGINT NULL,
  extraction_status VARCHAR(12) NOT NULL DEFAULT 'ok',
  UNIQUE KEY uq_ef (package_id, round_no, form_field_id),
  KEY idx_ef_field (form_field_id),
  KEY idx_ef_status (extraction_status),
  CONSTRAINT fk_ef_pkg   FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_ef_field FOREIGN KEY (form_field_id) REFERENCES form_field(id),
  CONSTRAINT fk_ef_seg   FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id),
  CONSTRAINT chk_ef_status CHECK (extraction_status IN ('ok','missing','uncertain'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE package_member (                                 -- 5.40 申报团队成员
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id       BIGINT NOT NULL,
  round_no         INT NOT NULL,
  member_role      VARCHAR(16) NOT NULL,
  name             VARCHAR(50) NOT NULL,
  title            VARCHAR(8) NULL,
  birth_date       DATETIME(3) NULL,
  unit_name        VARCHAR(128) NULL,
  person_id        BIGINT NULL,
  source_segment_id BIGINT NULL,
  KEY idx_pm_pkg (package_id),
  KEY idx_pm_round (round_no),
  KEY idx_pm_person (person_id),
  CONSTRAINT fk_pm_pkg    FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_pm_person FOREIGN KEY (person_id) REFERENCES research_person(id),
  CONSTRAINT fk_pm_seg    FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id),
  CONSTRAINT chk_pm_role  CHECK (member_role IN ('applicant','participant'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE package_coop_unit (                              -- 5.41 合作/联合承研单位
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id       BIGINT NOT NULL,
  round_no         INT NOT NULL,
  coop_type        VARCHAR(16) NOT NULL,
  unit_name        VARCHAR(128) NOT NULL,
  unit_id          BIGINT NULL,
  task_desc        TEXT NULL,
  applied_fund     DECIMAL(16,2) NULL,
  source_segment_id BIGINT NULL,
  KEY idx_pcu_pkg (package_id),
  KEY idx_pcu_round (round_no),
  KEY idx_pcu_unit (unit_id),
  CONSTRAINT fk_pcu_pkg  FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_pcu_unit FOREIGN KEY (unit_id) REFERENCES research_unit(id),
  CONSTRAINT fk_pcu_seg  FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id),
  CONSTRAINT chk_pcu_type CHECK (coop_type IN ('联合承研','合作单位'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE budget_item (                                    -- 5.42 预算明细行（自引用归总）
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id       BIGINT NOT NULL,
  round_no         INT NOT NULL,
  category         VARCHAR(16) NOT NULL,
  item_name        VARCHAR(128) NOT NULL,
  amount           DECIMAL(16,2) NOT NULL,
  is_subitem       TINYINT(1) NOT NULL DEFAULT 0,
  parent_item_id   BIGINT NULL,
  source_segment_id BIGINT NULL,
  KEY idx_bi_pkg (package_id),
  KEY idx_bi_round (round_no),
  KEY idx_bi_parent (parent_item_id),
  CONSTRAINT fk_bi_pkg    FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_bi_parent FOREIGN KEY (parent_item_id) REFERENCES budget_item(id),
  CONSTRAINT fk_bi_seg    FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id),
  CONSTRAINT chk_bi_cat   CHECK (category IN ('设备费','业务费','劳务费','间接费','管理费'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE package_attachment (                             -- 5.43 附件清单项
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id       BIGINT NOT NULL,
  round_no         INT NOT NULL,
  attachment_type  VARCHAR(24) NOT NULL,
  is_present       TINYINT(1) NOT NULL DEFAULT 0,
  material_file_id BIGINT NULL,
  required_item_id BIGINT NULL,
  source_segment_id BIGINT NULL,
  KEY idx_pa_pkg (package_id),
  KEY idx_pa_round (round_no),
  CONSTRAINT fk_pa_pkg   FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_pa_mf    FOREIGN KEY (material_file_id) REFERENCES material_file(id),
  CONSTRAINT fk_pa_req   FOREIGN KEY (required_item_id) REFERENCES required_material_item(id),
  CONSTRAINT fk_pa_seg   FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id),
  CONSTRAINT chk_pa_type CHECK (attachment_type IN ('推荐信','导师同意函','知情同意书','伦理证明','聘任合同','标准初稿','技术成熟度报告','社科结项证书','其他'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5H. 审查运行域
-- =============================================================================

CREATE TABLE review_round (                                   -- 5.44 复审轮次【+snapshot_hash+审计】
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id    BIGINT NOT NULL,
  round_no      INT NOT NULL,
  conclusion    VARCHAR(8) NOT NULL DEFAULT 'pending',
  concluded_at  DATETIME(3) NULL,
  signed_off_by BIGINT NULL,
  signed_off_at DATETIME(3) NULL,
  snapshot_hash CHAR(64) NULL COMMENT '本轮材料+结构化抽取的有序SHA256（防篡改存证）',
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rr (package_id, round_no),
  KEY idx_rr_conclusion (conclusion),
  CONSTRAINT fk_rr_pkg  FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_rr_user FOREIGN KEY (signed_off_by) REFERENCES sys_user(id),
  CONSTRAINT chk_rr_conclusion CHECK (conclusion IN ('reject','fix','accept','pending'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE round_check (                                    -- 5.45 轮次审查项（全量+版本锚+初/终判+乐观锁+审计）
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id        BIGINT NOT NULL,
  rule_version_id BIGINT NOT NULL,
  applied_param_snapshot JSON NULL,
  initial_result  VARCHAR(16) NOT NULL DEFAULT 'pending',
  initial_disposition VARCHAR(8) NULL,
  final_result    VARCHAR(16) NULL,
  final_disposition VARCHAR(8) NULL,
  confidence      DECIMAL(4,3) NULL,
  severity        INT NULL,
  suggestion      TEXT NULL,
  status          VARCHAR(12) NOT NULL DEFAULT 'open',
  version         INT NOT NULL DEFAULT 0,
  reviewed_by     BIGINT NULL,
  reviewed_at     DATETIME(3) NULL,
  review_remark   TEXT NULL,
  checked_at      DATETIME(3) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_rc (round_id, rule_version_id),
  KEY idx_rc_round (round_id),
  KEY idx_rc_rv (rule_version_id),
  KEY idx_rc_initial (initial_result),
  KEY idx_rc_final (final_result),
  KEY idx_rc_status (status),
  KEY idx_rc_effective ((COALESCE(final_result, initial_result))),
  CONSTRAINT fk_rc_round FOREIGN KEY (round_id) REFERENCES review_round(id),
  CONSTRAINT fk_rc_rv    FOREIGN KEY (rule_version_id) REFERENCES review_rule_version(id),
  CONSTRAINT fk_rc_user  FOREIGN KEY (reviewed_by) REFERENCES sys_user(id),
  CONSTRAINT chk_rc_initial CHECK (initial_result IN ('pending','pass','fail','need_review','not_applicable','error')),
  CONSTRAINT chk_rc_final   CHECK (final_result IS NULL OR final_result IN ('pending','pass','fail','need_review','not_applicable','error')),
  CONSTRAINT chk_rc_status  CHECK (status IN ('open','confirmed','overruled','need_review')),
  CONSTRAINT chk_rc_param   CHECK (applied_param_snapshot IS NULL OR JSON_SCHEMA_VALID('{"type":"object"}', applied_param_snapshot))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE check_review_action (                            -- 5.46 复核动作历史
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_check_id BIGINT NOT NULL,
  actor_id      BIGINT NOT NULL,
  action        VARCHAR(12) NOT NULL,
  from_result   VARCHAR(16) NULL,
  to_result     VARCHAR(16) NULL,
  remark        TEXT NULL,
  acted_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_cra_rc (round_check_id),
  KEY idx_cra_actor (actor_id),
  CONSTRAINT fk_cra_rc    FOREIGN KEY (round_check_id) REFERENCES round_check(id),
  CONSTRAINT fk_cra_actor FOREIGN KEY (actor_id) REFERENCES sys_user(id),
  CONSTRAINT chk_cra_action CHECK (action IN ('confirm','overrule','supplement'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE finding_evidence (                               -- 5.47 审查项证据（多定位）【+sim_run_id】
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_check_id BIGINT NOT NULL,
  segment_id     BIGINT NULL,
  field_code     VARCHAR(40) NULL,
  budget_item_id BIGINT NULL,
  sim_run_id     BIGINT NULL,
  note           VARCHAR(255) NULL,
  KEY idx_fe_rc (round_check_id),
  KEY idx_fe_seg (segment_id),
  KEY idx_fe_budget (budget_item_id),
  KEY idx_fe_sim (sim_run_id),
  CONSTRAINT fk_fe_rc     FOREIGN KEY (round_check_id) REFERENCES round_check(id),
  CONSTRAINT fk_fe_seg    FOREIGN KEY (segment_id) REFERENCES parse_segment(id),
  CONSTRAINT fk_fe_budget FOREIGN KEY (budget_item_id) REFERENCES budget_item(id),
  CONSTRAINT fk_fe_sim    FOREIGN KEY (sim_run_id) REFERENCES sim_run(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE review_report (                                  -- 5.48 审查报告【file_id】
  id               BIGINT AUTO_INCREMENT PRIMARY KEY,
  round_id         BIGINT NOT NULL,
  report_template_id BIGINT NULL,
  generated_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  version          VARCHAR(16) NOT NULL DEFAULT 'V1.0',
  file_id          BIGINT NULL,
  KEY idx_rrp_round (round_id),
  KEY idx_rrp_file (file_id),
  CONSTRAINT fk_rrp_round FOREIGN KEY (round_id) REFERENCES review_round(id),
  CONSTRAINT fk_rrp_tpl   FOREIGN KEY (report_template_id) REFERENCES report_template(id),
  CONSTRAINT fk_rrp_file  FOREIGN KEY (file_id) REFERENCES file_object(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5I. 案例经验域
-- =============================================================================

CREATE TABLE review_case (                                    -- 5.49 审查案例（与申报包 1:1）
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id      BIGINT NOT NULL,
  declared_project_id BIGINT NOT NULL,
  final_round_id  BIGINT NOT NULL,
  final_report_id BIGINT NULL,
  final_conclusion VARCHAR(8) NOT NULL,
  finding_count   INT NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_case_pkg (package_id),
  KEY idx_case_dp (declared_project_id),
  CONSTRAINT fk_case_pkg    FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_case_dp     FOREIGN KEY (declared_project_id) REFERENCES declared_project(id),
  CONSTRAINT fk_case_round  FOREIGN KEY (final_round_id) REFERENCES review_round(id),
  CONSTRAINT fk_case_report FOREIGN KEY (final_report_id) REFERENCES review_report(id),
  CONSTRAINT chk_case_conclusion CHECK (final_conclusion IN ('reject','fix','accept','pending'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE case_pattern (                                   -- 5.50 典型问题模式库【+embedding】
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  project_type_id BIGINT NULL,
  dimension_id    BIGINT NULL,
  problem_type    VARCHAR(80) NOT NULL,
  description     TEXT NOT NULL,
  frequency       INT NOT NULL DEFAULT 0,
  sample_check_id BIGINT NULL,
  embedding_id      VARCHAR(64) NULL,
  embedding_model   VARCHAR(64) NULL,
  embedding_version VARCHAR(16) NULL,
  embedded_at       DATETIME(3) NULL,
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_pat_pt_dim (project_type_id, dimension_id),
  KEY idx_pat_sample (sample_check_id),
  CONSTRAINT fk_pat_pt     FOREIGN KEY (project_type_id) REFERENCES project_type(id),
  CONSTRAINT fk_pat_dim    FOREIGN KEY (dimension_id) REFERENCES review_dimension(id),
  CONSTRAINT fk_pat_sample FOREIGN KEY (sample_check_id) REFERENCES round_check(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5J. 仿真域
-- =============================================================================

CREATE TABLE sim_platform (                                   -- 5.51 仿真平台注册表
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  code        VARCHAR(40) NOT NULL,
  name        VARCHAR(80) NOT NULL,
  capability  JSON NULL,
  data_format VARCHAR(32) NULL,
  connection  JSON NULL,
  adapter_key VARCHAR(64) NOT NULL,
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_sp_code (code),
  KEY idx_sp_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE sim_experiment (                                 -- 5.52 抽取的实验配置
  id              BIGINT AUTO_INCREMENT PRIMARY KEY,
  package_id      BIGINT NOT NULL,
  round_no        INT NOT NULL DEFAULT 1,
  scene_type      VARCHAR(16) NOT NULL,
  params          JSON NOT NULL,
  inputs_file_id  BIGINT NULL,
  claimed_result  JSON NULL,
  tolerance       JSON NULL,
  source_segment_id BIGINT NULL,
  extracted_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_se_pkg (package_id),
  KEY idx_se_round (round_no),
  KEY idx_se_scene (scene_type),
  CONSTRAINT fk_se_pkg   FOREIGN KEY (package_id) REFERENCES application_package(id),
  CONSTRAINT fk_se_input FOREIGN KEY (inputs_file_id) REFERENCES file_object(id),
  CONSTRAINT fk_se_seg   FOREIGN KEY (source_segment_id) REFERENCES parse_segment(id),
  CONSTRAINT chk_se_scene CHECK (scene_type IN ('电磁','网络','流体','控制','其他'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

CREATE TABLE sim_run (                                        -- 5.53 复现记录
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  experiment_id BIGINT NOT NULL,
  platform_id   BIGINT NOT NULL,
  status        VARCHAR(16) NOT NULL DEFAULT 'queued',
  output_file_id BIGINT NULL,
  compare_result VARCHAR(16) NULL,
  deviation     DECIMAL(12,4) NULL,
  conclusion    TEXT NULL,
  run_at        DATETIME(3) NULL,
  finished_at   DATETIME(3) NULL,
  KEY idx_sr_exp (experiment_id),
  KEY idx_sr_platform (platform_id),
  KEY idx_sr_status (status),
  KEY idx_sr_compare (compare_result),
  CONSTRAINT fk_sr_exp      FOREIGN KEY (experiment_id) REFERENCES sim_experiment(id),
  CONSTRAINT fk_sr_platform FOREIGN KEY (platform_id) REFERENCES sim_platform(id),
  CONSTRAINT fk_sr_output   FOREIGN KEY (output_file_id) REFERENCES file_object(id),
  CONSTRAINT chk_sr_status  CHECK (status IN ('queued','running','success','failed','timeout')),
  CONSTRAINT chk_sr_compare CHECK (compare_result IS NULL OR compare_result IN ('consistent','deviation','unreproducible'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- =============================================================================
-- 5K. 文件 / 日志审计域
-- =============================================================================

CREATE TABLE file_object (                                    -- 5.54 对象存储登记（唯一桥）【+软删除】
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  bucket       VARCHAR(64)  NOT NULL,
  object_key   VARCHAR(500) NOT NULL,
  file_name    VARCHAR(255) NOT NULL,
  mime_type    VARCHAR(128) NULL,
  size_bytes   BIGINT NULL,
  content_hash VARCHAR(64) NULL,
  sensitivity  VARCHAR(8) NOT NULL DEFAULT '内部',
  uploaded_by  BIGINT NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  deleted_at   DATETIME(3) NULL,
  UNIQUE KEY uq_fo_key (object_key),
  KEY idx_fo_hash (content_hash),
  KEY idx_fo_sensitivity (sensitivity),
  CONSTRAINT fk_fo_user FOREIGN KEY (uploaded_by) REFERENCES sys_user(id),
  CONSTRAINT chk_fo_sensitivity CHECK (sensitivity IN ('内部','秘密','机密','绝密'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC;

-- 以下三张日志表：按时间月分区，放弃外键（append-only，应用层可控；§4.2）。
-- 分区列必须进主键 → PK 含时间列。

CREATE TABLE agent_run_log (                                  -- 5.55 智能体编排步骤（分区·无FK）
  id          BIGINT NOT NULL AUTO_INCREMENT,
  round_id    BIGINT NULL,
  package_id  BIGINT NULL,
  step        VARCHAR(40) NOT NULL,
  skill       VARCHAR(40) NOT NULL,
  status      VARCHAR(16) NOT NULL,
  detail      JSON NULL,
  started_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  PRIMARY KEY (id, started_at),
  KEY idx_arl_round (round_id),
  KEY idx_arl_pkg (package_id),
  CONSTRAINT chk_arl_status CHECK (status IN ('running','success','failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC
PARTITION BY RANGE COLUMNS(started_at) (
  PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

CREATE TABLE model_call_log (                                 -- 5.56 模型调用（分区·无FK）
  id              BIGINT NOT NULL AUTO_INCREMENT,
  agent_run_id    BIGINT NOT NULL,
  model           VARCHAR(64) NOT NULL,
  prompt_tokens   INT NULL,
  completion_tokens INT NULL,
  cost            DECIMAL(12,4) NULL,
  latency_ms      INT NULL,
  called_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, called_at),
  KEY idx_mcl_agent (agent_run_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC
PARTITION BY RANGE COLUMNS(called_at) (
  PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

CREATE TABLE audit_log (                                      -- 5.57 审计（多态目标·分区·无FK）
  id          BIGINT NOT NULL AUTO_INCREMENT,
  actor_id    BIGINT NULL,
  op_action   VARCHAR(64) NOT NULL,
  target_type VARCHAR(32) NULL,
  target_id   BIGINT NULL,
  op_source   VARCHAR(8) NULL,
  op_reason   TEXT NULL,
  op_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id, op_at),
  KEY idx_al_actor (actor_id),
  KEY idx_al_action (op_action),
  KEY idx_al_target (target_type, target_id),
  KEY idx_al_at (op_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 ROW_FORMAT=DYNAMIC
PARTITION BY RANGE COLUMNS(op_at) (
  PARTITION p2026_06 VALUES LESS THAN ('2026-07-01'),
  PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION pmax     VALUES LESS THAN (MAXVALUE)
);

SET FOREIGN_KEY_CHECKS = 1;

-- =============================================================================
-- 共 56 张业务表。分区维护提示：每月新增下月分区，旧分区可 EXPORT 后 DROP 归档：
--   ALTER TABLE audit_log REORGANIZE PARTITION pmax INTO (
--     PARTITION p2026_09 VALUES LESS THAN ('2026-10-01'),
--     PARTITION pmax     VALUES LESS THAN (MAXVALUE));
-- =============================================================================
