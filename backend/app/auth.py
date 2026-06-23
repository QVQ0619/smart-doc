"""写/变更端点的共享密钥鉴权。

默认放行（settings.api_key 为空）——本地 dev、现有测试、不对外的部署零摩擦。
一旦后端对外部沙箱/隧道可达，设置环境变量 SMART_API_KEY 即强制校验，
防止匿名者向业务库写入/删除（regulation_clause / review_rule / standard_doc）。
"""
from fastapi import Header, HTTPException

from .config import settings


def require_api_key(
    x_api_key: str | None = Header(default=None, alias="X-API-Key"),
) -> None:
    expected = settings.api_key
    if not expected:
        return  # 未配置密钥：放行（向后兼容）
    if x_api_key != expected:
        raise HTTPException(status_code=401, detail="invalid or missing API key")
