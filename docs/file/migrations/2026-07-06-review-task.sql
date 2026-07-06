-- P3 任务分发域:新增 任务表 + 任务报告表(1+4)。轻量新表,与现有申报流水线解耦,预留 package_id 桥接。
-- 执行: mysql -u root -p smart < docs/file/migrations/2026-07-06-review-task.sql
CREATE TABLE IF NOT EXISTS review_task (
  id               BIGINT       NOT NULL AUTO_INCREMENT,
  task_no          VARCHAR(64)  NOT NULL,
  task_name        VARCHAR(255) NOT NULL,
  project_type_id  BIGINT       NULL,
  secrecy_level_id BIGINT       NULL,
  status           VARCHAR(32)  NOT NULL DEFAULT 'created',   -- created→distributed→reviewing→done
  assignee_id      BIGINT       NULL,                          -- 受理人(普通用户 sys_user.id)
  distributed_by   BIGINT       NULL,
  distributed_at   DATETIME(3)  NULL,
  package_id       BIGINT       NULL,                          -- 预留:桥接现有 application_package
  created_by       BIGINT       NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_rt_assignee (assignee_id),
  KEY idx_rt_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS task_report (
  id            BIGINT      NOT NULL AUTO_INCREMENT,
  task_id       BIGINT      NOT NULL,
  report_type   VARCHAR(32) NOT NULL,                          -- comprehensive/economy/tech_system/system_contribution/general_quality
  file_id       BIGINT      NULL,
  file_name     VARCHAR(255) NULL,
  review_status VARCHAR(32) NOT NULL DEFAULT 'pending',        -- 供 5 个审查按钮后续更新
  uploaded_by   BIGINT      NULL,
  uploaded_at   DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_type (task_id, report_type),
  KEY idx_tr_task (task_id),
  CONSTRAINT fk_tr_task FOREIGN KEY (task_id) REFERENCES review_task(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
