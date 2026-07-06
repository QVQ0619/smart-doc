"""幂等应用 P3 迁移:创建 review_task / task_report 两张表(已存在则跳过)。

运行(backend 目录): .venv\\Scripts\\python.exe scripts\\apply_task_migration.py
"""
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from sqlalchemy import text          # noqa: E402
from app.db import engine            # noqa: E402

REVIEW_TASK = """
CREATE TABLE IF NOT EXISTS review_task (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  task_no          VARCHAR(64)  NOT NULL,
  task_name        VARCHAR(255) NOT NULL,
  project_type_id  BIGINT       NULL,
  secrecy_level_id BIGINT       NULL,
  status           VARCHAR(32)  NOT NULL DEFAULT 'created',
  assignee_id      BIGINT       NULL,
  distributed_by   BIGINT       NULL,
  distributed_at   DATETIME(3)  NULL,
  package_id       BIGINT       NULL,
  created_by       BIGINT       NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rt_assignee (assignee_id),
  KEY idx_rt_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

TASK_REPORT = """
CREATE TABLE IF NOT EXISTS task_report (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  task_id       BIGINT      NOT NULL,
  report_type   VARCHAR(32) NOT NULL,
  file_id       BIGINT      NULL,
  file_name     VARCHAR(255) NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',
  uploaded_by   BIGINT      NULL,
  uploaded_at   DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_type (task_id, report_type),
  KEY idx_tr_task (task_id),
  CONSTRAINT fk_tr_task FOREIGN KEY (task_id) REFERENCES review_task(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

TASK_RULE = """
CREATE TABLE IF NOT EXISTS task_rule (
  id              BIGINT      NOT NULL AUTO_INCREMENT,
  task_id         BIGINT      NOT NULL,
  standard_doc_id BIGINT      NOT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_rule (task_id, standard_doc_id),
  KEY idx_tr2_task (task_id),
  CONSTRAINT fk_tr2_task FOREIGN KEY (task_id) REFERENCES review_task(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
"""

with engine.begin() as c:
    c.execute(text(REVIEW_TASK))
    c.execute(text(TASK_REPORT))
    c.execute(text(TASK_RULE))
    n = c.execute(text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='smart'")).scalar()
    has_rt = c.execute(text("SHOW TABLES LIKE 'review_task'")).first()
    has_tr = c.execute(text("SHOW TABLES LIKE 'task_report'")).first()
    has_tru = c.execute(text("SHOW TABLES LIKE 'task_rule'")).first()
print("review_task:", bool(has_rt), "| task_report:", bool(has_tr), "| task_rule:", bool(has_tru), "| total:", n)
