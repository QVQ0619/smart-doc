from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="SMART_", env_file=".env", extra="ignore")

    database_url: str = "mysql+pymysql://root:root@localhost:3306/smart"
    storage_dir: str = "./storage"
    max_upload_mb: int = 50
    cors_origins: str = "http://localhost:3200"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()


def get_max_upload_bytes() -> int:
    return settings.max_upload_bytes
