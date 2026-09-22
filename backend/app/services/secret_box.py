"""Encrypt integration secrets at rest using the app SECRET_KEY."""

import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import get_settings


def _fernet() -> Fernet:
    digest = hashlib.sha256(get_settings().secret_key.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_value(plain: str) -> str:
    if not plain:
        return ""
    return _fernet().encrypt(plain.encode()).decode()


def decrypt_value(cipher: str) -> str:
    if not cipher:
        return ""
    return _fernet().decrypt(cipher.encode()).decode()
