"""Fernet-based symmetric encryption for sensitive fields (e.g., LLM API keys).

The encryption key is read from the FIELD_ENCRYPTION_KEY environment variable.
Generate one with:

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

Store it in .env and in Render environment variables.
"""

import os
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_ENCRYPTION_KEY = os.getenv("FIELD_ENCRYPTION_KEY", "")


def _get_fernet():
    """Return a Fernet instance, or None if no key is configured."""
    if not _ENCRYPTION_KEY:
        return None
    try:
        return Fernet(_ENCRYPTION_KEY.encode())
    except Exception:
        logger.warning("FIELD_ENCRYPTION_KEY is set but invalid. Encryption disabled.")
        return None


def encrypt_value(plaintext: str) -> str:
    """Encrypt a plaintext string. Returns ciphertext prefixed with 'enc:'.

    If no encryption key is configured, returns the plaintext unchanged
    (safe for local dev where the env var isn't set).
    """
    if not plaintext:
        return plaintext
    f = _get_fernet()
    if f is None:
        return plaintext
    token = f.encrypt(plaintext.encode()).decode()
    return f"enc:{token}"


def decrypt_value(stored: str) -> str:
    """Decrypt a stored value. Handles both encrypted ('enc:...')
    and legacy plaintext values gracefully.

    If the value isn't prefixed with 'enc:', it's returned as-is
    (backwards-compatible with existing plaintext keys in the DB).
    """
    if not stored:
        return stored
    if not stored.startswith("enc:"):
        # Legacy plaintext — return as-is.
        return stored
    f = _get_fernet()
    if f is None:
        logger.error(
            "Encrypted value found but FIELD_ENCRYPTION_KEY is not set. "
            "Cannot decrypt."
        )
        return ""
    try:
        return f.decrypt(stored[4:].encode()).decode()
    except InvalidToken:
        logger.error("Failed to decrypt value — key mismatch or corrupted data.")
        return ""
