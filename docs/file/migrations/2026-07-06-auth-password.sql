-- P1 认证地基:给 sys_user 增加密码列(现无)。
-- 角色(admin/reviewer)与初始用户由 backend/scripts/seed_users.py 幂等写入。
-- 执行: mysql -u root -p smart < docs/file/migrations/2026-07-06-auth-password.sql
ALTER TABLE sys_user ADD COLUMN password_hash VARCHAR(255) NULL AFTER display_name;
