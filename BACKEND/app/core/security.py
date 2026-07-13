"""Security primitives — placeholder (docs/02 §6, §39, §42).

Full auth (login, refresh rotation, reuse detection, RBAC/PBAC, MFA) lands with
the auth module. This provides the shared primitives those pieces build on:
argon2id password hashing, RS256 JWT encode/decode, and a dev keypair so local
runs work without injecting PEM secrets.
"""

from __future__ import annotations

import base64
import hashlib
from functools import lru_cache
from pathlib import Path

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

from app.core.config import settings

_hasher = PasswordHasher()  # argon2id defaults
_ALGO = "RS256"
_KEYS_DIR = Path("keys")  # gitignored; dev keypair persisted here so tokens survive restart


# ── Passwords (argon2id, docs/02 §42) ────────────────────────────────────────
def hash_password(raw: str) -> str:
    return _hasher.hash(raw)


def verify_password(raw: str, hashed: str) -> bool:
    try:
        return _hasher.verify(hashed, raw)
    except VerifyMismatchError:
        return False


# ── JWT keys ─────────────────────────────────────────────────────────────────
@lru_cache
def _keys() -> tuple[str, str]:
    """Return (private_pem, public_pem).

    Preference order: (1) PEM strings from settings (prod, secrets mgr);
    (2) an existing dev keypair under ./keys; (3) a freshly generated dev
    keypair persisted to ./keys so issued tokens survive a restart. Never
    generate/persist in prod — inject the keys instead."""
    if settings.jwt_private_key and settings.jwt_public_key:
        return settings.jwt_private_key, settings.jwt_public_key

    priv_path = _KEYS_DIR / "jwt_private.pem"
    pub_path = _KEYS_DIR / "jwt_public.pem"
    if priv_path.exists() and pub_path.exists():
        return priv_path.read_text(), pub_path.read_text()

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    public_pem = (
        key.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    _KEYS_DIR.mkdir(parents=True, exist_ok=True)
    priv_path.write_text(private_pem)
    pub_path.write_text(public_pem)
    return private_pem, public_pem


def encode_jwt(claims: dict) -> str:
    private_pem, _ = _keys()
    return jwt.encode(claims, private_pem, algorithm=_ALGO)


def decode_jwt(token: str) -> dict:
    _, public_pem = _keys()
    return jwt.decode(token, public_pem, algorithms=[_ALGO])


# ── App-layer symmetric encryption (Fernet) for MFA secrets / API keys ────────
@lru_cache
def _fernet() -> Fernet:
    # Derive a stable 32-byte urlsafe key from SECRET_KEY (docs/02 §42).
    digest = hashlib.sha256(settings.secret_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


def sha256_hex(value: str) -> str:
    """Hash for opaque tokens stored at rest (refresh tokens, docs/02 §42)."""
    return hashlib.sha256(value.encode()).hexdigest()
