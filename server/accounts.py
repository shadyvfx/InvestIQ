"""TradeLab accounts: sign-up rules, password hashing and the SQLite user database.

Standard library only. The rules mirror js/core/accounts.js, which the sign-up
form uses for live checks; tests/account-cases.json is checked against both so
the messages stay identical. This module has the final say, and also checks
that the email's domain can receive mail (server/email_check.py).

Each account's progress (lessons, simulated trades, journal, tutor
conversation and settings) is saved as one JSON document in user_data.

Passwords are never stored. Each one is hashed with PBKDF2-SHA256 and a random
salt, in the format Werkzeug uses ("pbkdf2:sha256:<iterations>$<salt>$<hex>"),
so a Flask backend can check these hashes with
werkzeug.security.check_password_hash and keep using the same database.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import string
import unicodedata
from contextlib import closing
from datetime import datetime, timedelta, timezone

from server.email_check import EmailCheck, EmailChecker

USERNAME_MAX = 30
PASSWORD_MIN = 8
PASSWORD_MAX = 128
EMAIL_MAX = 254
EMAIL_LOCAL_MAX = 64

DEFAULT_ITERATIONS = 1_000_000
SESSION_DAYS = 7
SALT_CHARS = string.ascii_letters + string.digits

# Exactly the characters JavaScript's \s matches, so the browser and the
# server agree on what counts as a space.
WHITESPACE = "\t\n\v\f\r       　﻿" + "".join(
    chr(code) for code in range(0x2000, 0x200B)
)

EMAIL_LOCAL = re.compile(r"[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*")
EMAIL_DOMAIN = re.compile(r"(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}")
RESERVED_DOMAIN_LABELS = {"localhost", "local"}

USERS_COLUMNS = {"id", "display_name", "email", "password_hash", "created_at"}
MAX_USER_DATA_BYTES = 2 * 1024 * 1024


class AccountError(Exception):
    """A problem to report to the browser, with an HTTP status and error code."""

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        field: str | None = None,
        fields: dict | None = None,
        suggestions: dict | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field = field
        self.fields = fields or {}
        self.suggestions = suggestions or {}

    def to_dict(self) -> dict:
        error = {"code": self.code, "message": self.message}
        if self.field:
            error["field"] = self.field
        details = {}
        if self.fields:
            details["fields"] = self.fields
        if self.suggestions:
            details["suggestions"] = self.suggestions
        if details:
            error["details"] = details
        return error


class DatabaseSetupError(Exception):
    """The database file holds a users table this server doesn't recognize."""


# ---------------------------------------------------------------------------
# Rules (keep in step with js/core/accounts.js)


def _text(value) -> str:
    return value if isinstance(value, str) else ""


def _category(char: str) -> str:
    return unicodedata.category(char)


def _join_list(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return f"{', '.join(items[:-1])} and {items[-1]}"


def _has_capital(text: str) -> bool:
    return any(_category(char) == "Lu" for char in text)


def _has_special(text: str) -> bool:
    return any(_category(char)[0] not in "LN" and char not in WHITESPACE for char in text)


def username_error(username) -> str:
    value = _text(username)
    if value == "":
        return "Enter a username."
    if any(char in WHITESPACE for char in value):
        return "Usernames can't contain spaces."
    if any(_category(char) in ("Cf", "Cc") for char in value):
        return "Usernames can't contain invisible characters."
    if "@" in value:
        return "Usernames can't contain @, so they can't be mistaken for an email address."
    if len(value) > USERNAME_MAX:
        return f"Keep your username to {USERNAME_MAX} characters or fewer."
    return ""


def normalize_email(email) -> str:
    return _text(email).strip(WHITESPACE).lower()


def _valid_email_domain(domain: str) -> bool:
    if not domain or domain.startswith(".") or domain.endswith(".") or ".." in domain:
        return False
    labels = domain.split(".")
    if len(labels) < 2:
        return False
    if any(not label or len(label) > 63 or label.startswith("-") or label.endswith("-") for label in labels):
        return False
    if any(label.lower() in RESERVED_DOMAIN_LABELS for label in labels):
        return False
    return bool(re.fullmatch(r"[A-Za-z]{2,63}", labels[-1]))


def email_error(email) -> str:
    value = _text(email).strip(WHITESPACE)
    if value == "":
        return "Enter your email address."
    if len(value) > EMAIL_MAX:
        return "That email address is too long."
    if " " in value:
        return "Enter a valid email address, like name@example.com."
    local, at, domain = value.rpartition("@")
    valid = (
        bool(at)
        and value.count("@") == 1
        and local != ""
        and len(local) <= EMAIL_LOCAL_MAX
        and EMAIL_LOCAL.fullmatch(local) is not None
        and EMAIL_DOMAIN.fullmatch(domain) is not None
        and _valid_email_domain(domain)
    )
    return "" if valid else "Enter a valid email address, like name@example.com."


def password_error(password) -> str:
    value = _text(password)
    if value == "":
        return "Enter a password."
    if len(value) > PASSWORD_MAX:
        return f"Keep your password to {PASSWORD_MAX} characters or fewer."
    missing = []
    if len(value) < PASSWORD_MIN:
        missing.append(f"at least {PASSWORD_MIN} characters")
    if not _has_capital(value):
        missing.append("a capital letter")
    if not _has_special(value):
        missing.append("a special character")
    return f"Your password needs {_join_list(missing)}." if missing else ""


def validate_registration(data: dict) -> tuple[dict, dict]:
    """Returns (errors by field, cleaned values)."""
    checks = {
        "username": username_error(data.get("username")),
        "email": email_error(data.get("email")),
        "password": password_error(data.get("password")),
    }
    errors = {field: message for field, message in checks.items() if message}
    value = {
        "username": _text(data.get("username")),
        "email": normalize_email(data.get("email")),
        "password": _text(data.get("password")),
    }
    return errors, value


def validate_sign_in(data: dict) -> tuple[dict, dict]:
    login = _text(data.get("login")).strip(WHITESPACE)
    password = _text(data.get("password"))
    errors = {}
    if not login:
        errors["login"] = "Enter your username or email."
    if not password:
        errors["password"] = "Enter your password."
    return errors, {"login": login, "password": password}


# ---------------------------------------------------------------------------
# Password hashing (Werkzeug-compatible)


def hash_password(password: str, iterations: int = DEFAULT_ITERATIONS) -> str:
    salt = "".join(secrets.choice(SALT_CHARS) for _ in range(16))
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), iterations).hex()
    return f"pbkdf2:sha256:{iterations}${salt}${digest}"


def verify_password(stored: str, password: str) -> bool:
    """Checks a password against a stored PBKDF2 or scrypt hash in Werkzeug's format."""
    try:
        method, salt, expected = stored.split("$", 2)
        kind, *args = method.split(":")
        secret, salt_bytes = password.encode("utf-8"), salt.encode("utf-8")
        if kind == "pbkdf2" and len(args) == 2:
            digest = hashlib.pbkdf2_hmac(args[0], secret, salt_bytes, int(args[1])).hex()
        elif kind == "scrypt" and len(args) == 3:
            n, r, p = (int(arg) for arg in args)
            digest = hashlib.scrypt(secret, salt=salt_bytes, n=n, r=r, p=p, maxmem=132 * n * r * p).hex()
        else:
            return False
    except (ValueError, TypeError, AttributeError):
        return False
    return hmac.compare_digest(digest, expected)


# ---------------------------------------------------------------------------
# The database


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _timestamp(moment: datetime) -> str:
    return moment.isoformat(timespec="microseconds")


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class AccountStore:
    """Users and sign-in sessions in a SQLite file.

    Each call opens its own connection, so the store is safe to share between
    the server's request threads.
    """

    def __init__(
        self,
        path: str,
        iterations: int = DEFAULT_ITERATIONS,
        session_days: int = SESSION_DAYS,
        email_checker=None,
    ):
        self.path = path
        self.iterations = iterations
        self.session_days = session_days
        # Called with a well-formed email; returns an EmailCheck. Tests pass a stand-in.
        self.email_checker = email_checker or EmailChecker()
        self._dummy_hash = None

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        return connection

    def migrate(self) -> list[str]:
        """Creates the tables, or upgrades a users table from an earlier version.

        Upgrading only adds things (a username column, an index and a sessions
        table), so existing accounts are never changed or removed.
        Returns a note for each change it made.
        """
        notes = []
        with closing(self._connect()) as connection, connection:
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(users)")}
            if not columns:
                connection.execute(
                    """CREATE TABLE users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT,
                        display_name TEXT NOT NULL,
                        email TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL,
                        created_at TEXT NOT NULL
                    )"""
                )
                notes.append("Created the users table.")
            else:
                missing = sorted(USERS_COLUMNS - columns)
                if missing:
                    raise DatabaseSetupError(
                        f"its users table is missing {', '.join(missing)}. "
                        "Move the file somewhere else, or set TRADELAB_DB to use another database file."
                    )
                if "username" not in columns:
                    connection.execute("ALTER TABLE users ADD COLUMN username TEXT")
                    notes.append(
                        "Added a username column to your existing users table. "
                        "Accounts created before this sign in with their email."
                    )
            connection.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users (username COLLATE NOCASE)")
            connection.execute(
                """CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                )"""
            )
            connection.execute("CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id)")
            has_user_data = connection.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'user_data'"
            ).fetchone()
            if not has_user_data:
                if columns:  # upgrading an existing database
                    notes.append("Added a user_data table, which keeps each account's progress separate.")
                connection.execute(
                    """CREATE TABLE user_data (
                        user_id INTEGER PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
                        data TEXT NOT NULL,
                        updated_at TEXT NOT NULL
                    )"""
                )
        return notes

    def count_users(self) -> int:
        with closing(self._connect()) as connection:
            return connection.execute("SELECT count(*) FROM users").fetchone()[0]

    @staticmethod
    def _public(row) -> dict:
        """The user fields the browser may see. Never includes the password hash."""
        return {
            "id": row["id"],
            "username": row["username"],
            "displayName": row["display_name"],
            "email": row["email"],
            "createdAt": row["created_at"],
        }

    def check_email(self, email) -> EmailCheck:
        """Format first, then whether the domain can receive mail."""
        problem = email_error(email)
        if problem:
            return EmailCheck("invalid", problem)
        return self.email_checker(normalize_email(email))

    def create_user(self, username, email, password) -> dict:
        errors, value = validate_registration({"username": username, "email": email, "password": password})
        suggestions = {}
        if "email" not in errors:
            check = self.email_checker(value["email"])
            if not check.ok:
                errors["email"] = check.message
                if check.suggestion:
                    suggestions["email"] = check.suggestion
        if errors:
            raise AccountError(400, "validation_failed", "Some fields need attention.", fields=errors, suggestions=suggestions)

        with closing(self._connect()) as connection:
            if connection.execute("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (value["username"],)).fetchone():
                raise _username_taken()
            if connection.execute("SELECT 1 FROM users WHERE lower(email) = ?", (value["email"],)).fetchone():
                raise _email_taken()

        # Hashing takes a moment on purpose; do it outside any transaction.
        password_hash = hash_password(value["password"], self.iterations)
        try:
            with closing(self._connect()) as connection, connection:
                cursor = connection.execute(
                    "INSERT INTO users (username, display_name, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
                    (value["username"], value["username"], value["email"], password_hash, _timestamp(_now())),
                )
                row = connection.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
        except sqlite3.IntegrityError as error:
            # Two sign-ups raced for the same username or email.
            raise (_email_taken() if "email" in str(error) else _username_taken()) from error
        return self._public(row)

    def authenticate(self, login, password) -> dict:
        errors, value = validate_sign_in({"login": login, "password": password})
        if errors:
            raise AccountError(400, "validation_failed", "Some fields need attention.", fields=errors)

        with closing(self._connect()) as connection:
            if "@" in value["login"]:
                row = connection.execute("SELECT * FROM users WHERE lower(email) = ?", (normalize_email(value["login"]),)).fetchone()
            else:
                row = connection.execute("SELECT * FROM users WHERE username = ? COLLATE NOCASE", (value["login"],)).fetchone()

        if row is None:
            # Do the same work as a real check, so response times don't reveal
            # which usernames and emails exist.
            if self._dummy_hash is None:
                self._dummy_hash = hash_password(secrets.token_hex(8), self.iterations)
            verify_password(self._dummy_hash, value["password"])
        if row is None or not verify_password(row["password_hash"], value["password"]):
            raise AccountError(
                401,
                "invalid_credentials",
                "That username or email and password don't match. Check them and try again.",
            )
        return self._public(row)

    def create_session(self, user_id: int) -> str:
        """Starts a sign-in session and returns its token (only a hash of it is stored)."""
        token = secrets.token_urlsafe(32)
        now = _now()
        with closing(self._connect()) as connection, connection:
            connection.execute("DELETE FROM sessions WHERE expires_at <= ?", (_timestamp(now),))
            connection.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (_token_hash(token), user_id, _timestamp(now), _timestamp(now + timedelta(days=self.session_days))),
            )
        return token

    def user_for_session(self, token: str | None) -> dict | None:
        if not token:
            return None
        with closing(self._connect()) as connection:
            row = connection.execute(
                """SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id
                   WHERE sessions.token_hash = ? AND sessions.expires_at > ?""",
                (_token_hash(token), _timestamp(_now())),
            ).fetchone()
        return self._public(row) if row else None

    def delete_session(self, token: str | None) -> None:
        if not token:
            return
        with closing(self._connect()) as connection, connection:
            connection.execute("DELETE FROM sessions WHERE token_hash = ?", (_token_hash(token),))

    # -- Progress saved per account ----------------------------------------

    def load_user_data(self, user_id: int) -> tuple[dict | None, str | None]:
        """The account's saved progress and when it was saved, or (None, None) before the first save."""
        with closing(self._connect()) as connection:
            row = connection.execute("SELECT data, updated_at FROM user_data WHERE user_id = ?", (user_id,)).fetchone()
        if row is None:
            return None, None
        try:
            return json.loads(row["data"]), row["updated_at"]
        except json.JSONDecodeError:
            return None, row["updated_at"]

    def save_user_data(self, user_id: int, data) -> str:
        """Replaces the account's saved progress. Returns the time it was saved."""
        if not isinstance(data, dict) or not isinstance(data.get("state"), dict):
            raise AccountError(400, "invalid_request", "Progress must be sent as {data: {schemaVersion, state}}.")
        text = json.dumps(data, separators=(",", ":"))
        if len(text.encode("utf-8")) > MAX_USER_DATA_BYTES:
            raise AccountError(413, "payload_too_large", "Your saved progress is too large to store.")
        saved_at = _timestamp(_now())
        with closing(self._connect()) as connection, connection:
            connection.execute(
                """INSERT INTO user_data (user_id, data, updated_at) VALUES (?, ?, ?)
                   ON CONFLICT (user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at""",
                (user_id, text, saved_at),
            )
        return saved_at


def _username_taken() -> AccountError:
    return AccountError(409, "username_taken", "That username is already taken. Try another one.", field="username")


def _email_taken() -> AccountError:
    return AccountError(409, "email_taken", "An account with that email already exists. Sign in instead.", field="email")
