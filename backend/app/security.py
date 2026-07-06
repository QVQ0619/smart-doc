"""简单的密码哈希与签名 token（纯标准库，无第三方依赖）。

定位:为「用户权限管理 + 任务分发」提供最小可用的登录能力——
重点是按角色区分功能,而非高强度安全。
- 密码:salt$sha256(salt+password) 存库。
- token:hmac 签名的 payload(user_id.role.exp),放 Authorization: Bearer。
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
import time

from .config import settings


# ---- 密码 ----
def hash_password(password: str) -> str:
    salt = os.urandom(16).hex()
    digest = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored or "$" not in stored:
        return False
    salt, digest = stored.split("$", 1)
    calc = hashlib.sha256((salt + password).encode("utf-8")).hexdigest()
    return hmac.compare_digest(calc, digest)


# ---- token ----
def _b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def sign_token(user_id: int, role: str, ttl_min: int | None = None) -> str:
    ttl = (ttl_min if ttl_min is not None else settings.token_ttl_min) * 60
    payload = f"{user_id}.{role}.{int(time.time()) + ttl}"
    sig = hmac.new(settings.auth_secret.encode(), payload.encode(), hashlib.sha256).digest()
    return f"{_b64e(payload.encode())}.{_b64e(sig)}"


def verify_token(token: str) -> dict | None:
    """校验 token,返回 {user_id, role, exp};无效/过期返回 None。"""
    try:
        p_b64, sig_b64 = token.split(".", 1)
        payload = _b64d(p_b64).decode()
        expected = hmac.new(settings.auth_secret.encode(), payload.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(_b64d(sig_b64), expected):
            return None
        user_id_s, role, exp_s = payload.split(".")
        if int(exp_s) < int(time.time()):
            return None
        return {"user_id": int(user_id_s), "role": role, "exp": int(exp_s)}
    except Exception:
        return None
