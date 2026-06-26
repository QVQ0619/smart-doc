-- 项目批次重构 · 新增 批次↔规则文件 绑定表
-- 对生产库执行:mysql -uroot -p smart < docs/file/migrations/2026-06-26-batch_rule_doc.sql
USE smart;
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
