from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMART_", env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://root:root@localhost:3306/smart"
    storage_dir: str = "./storage"
    max_upload_mb: int = 50
    cors_origins: str = "http://localhost:3200"
    # 监听地址：默认 0.0.0.0 对外可达（供远程 agent / 隧道访问）。
    # 仅本机访问可设 SMART_HOST=127.0.0.1。
    host: str = "0.0.0.0"
    port: int = 8000
    # 写/变更端点的共享密钥（环境变量 SMART_API_KEY）；为空则不鉴权
    # （本地 dev/向后兼容），对外可达部署应设置以防匿名写/删业务库。
    api_key: str = ""
    # 简单登录:签名 token 的密钥与有效期(分钟)。默认内置值,生产用 SMART_AUTH_SECRET 覆盖。
    auth_secret: str = "smart-doc-dev-secret-change-me"
    token_ttl_min: int = 720

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()


def get_max_upload_bytes() -> int:
    return settings.max_upload_bytes
