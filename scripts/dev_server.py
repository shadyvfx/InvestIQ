#!/usr/bin/env python3
"""TradeLab's local server: the app plus its account API, standard library only.

    python3 scripts/dev_server.py          -> http://127.0.0.1:5173
    python3 scripts/dev_server.py 8000

It serves the frontend and a small JSON API for user accounts, which are saved
in the SQLite database tradelab.db in the project folder (set TRADELAB_DB to
use another file). There is nothing to install.

    POST   /api/users        {username, email, password}   create an account and sign in
    POST   /api/session      {login, password}             sign in with a username or email
    GET    /api/session                                    who is signed in, or {"user": null}
    DELETE /api/session                                    sign out
    POST   /api/email-check  {email}                       can this address receive email?
    GET    /api/me/data                                    the signed-in account's saved progress
    PUT    /api/me/data      {data}                        save the signed-in account's progress
    POST   /api/guest/simulation/advance {days}            reserve guest simulation days
    POST   /api/guest/journal/entries                      reserve a guest journal entry
    GET    /api/lessons/<lessonId>                         authorized lesson content

Sign-in uses an HttpOnly session cookie. Explicit MIME types are set because
some Windows machines map .js to text/plain, which stops ES modules from
loading, and caching is disabled so edits show up on the next refresh.
The database, the server code and dotfiles such as .git are never served.
"""

from __future__ import annotations

import functools
import http.server
import json
import os
import sys
import traceback
from urllib.parse import unquote, urlsplit

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from server.accounts import (  # noqa: E402
    GUEST_SESSION_DAYS,
    MAX_USER_DATA_BYTES,
    AccountError,
    AccountStore,
    DatabaseSetupError,
)

SESSION_COOKIE = "tradelab_session"
GUEST_SESSION_COOKIE = "tradelab_guest"
MAX_BODY_BYTES = 16 * 1024
GUEST_COURSE_IDS = {"what-is-a-stock", "how-prices-move", "market-vs-limit-orders"}
LESSON_IDS = {
    "what-is-a-stock",
    "how-prices-move",
    "candlestick-anatomy",
    "candlestick-patterns",
    "market-vs-limit-orders",
    "moving-averages",
    "rsi-momentum",
    "position-sizing",
    "diversification-basics",
    "trading-psychology",
}
LESSON_CONTENT_PATH = os.path.join(ROOT, "server", "lesson_content.json")

# Never served as static files.
PRIVATE_FOLDERS = {"server", "__pycache__", "node_modules"}
PRIVATE_SUFFIXES = (".db", ".db-journal", ".db-wal", ".db-shm", ".sqlite", ".sqlite3", ".py", ".pyc")


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
        ".md": "text/markdown",
    }
    server_version = "TradeLab"
    sys_version = ""
    store: AccountStore  # set by make_server()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    # -- Routing -------------------------------------------------------------

    def _route_path(self) -> str:
        return unquote(urlsplit(self.path).path)

    def _is_api(self) -> bool:
        path = self._route_path()
        return path == "/api" or path.startswith("/api/")

    def _is_private(self) -> bool:
        parts = [part for part in self._route_path().split("/") if part]
        return any(part.startswith(".") or part in PRIVATE_FOLDERS for part in parts) or (
            bool(parts) and parts[-1].lower().endswith(PRIVATE_SUFFIXES)
        )

    def do_GET(self):
        if self._is_api():
            self._handle_api("GET")
        elif self._is_private():
            self.send_error(404, "File not found")
        else:
            super().do_GET()

    def do_HEAD(self):
        if self._is_api() or self._is_private():
            self.send_error(404, "File not found")
        else:
            super().do_HEAD()

    def do_POST(self):
        self._api_only("POST")

    def do_PUT(self):
        self._api_only("PUT")

    def do_DELETE(self):
        self._api_only("DELETE")

    def _api_only(self, method: str):
        if self._is_api():
            self._handle_api(method)
        else:
            self.send_error(405, "Method not allowed")

    # -- API -----------------------------------------------------------------

    def _handle_api(self, method: str):
        path = self._route_path().rstrip("/")
        routes = {
            ("POST", "/api/users"): self._create_user,
            ("GET", "/api/session"): self._get_session,
            ("POST", "/api/session"): self._sign_in,
            ("DELETE", "/api/session"): self._sign_out,
            ("POST", "/api/email-check"): self._check_email,
            ("GET", "/api/me/data"): self._get_user_data,
            ("PUT", "/api/me/data"): self._put_user_data,
            ("GET", "/api/guest/limits"): self._get_guest_limits,
            ("POST", "/api/guest/simulation/advance"): self._advance_guest_simulation,
            ("POST", "/api/guest/journal/entries"): self._reserve_guest_journal_entry,
        }
        try:
            handler = routes.get((method, path))
            lesson_route = None
            if handler is None and method == "GET":
                parts = path.split("/")
                if len(parts) == 4 and parts[:3] == ["", "api", "lessons"]:
                    lesson_route = ("content", parts[3])
                elif len(parts) == 5 and parts[:3] == ["", "api", "lessons"] and parts[4] == "access":
                    lesson_route = ("access", parts[3])
            if handler is None:
                if lesson_route:
                    self._get_lesson(lesson_route[1], lesson_route[0] == "content")
                    return
                if any(route_path == path for _, route_path in routes):
                    raise AccountError(405, "method_not_allowed", f"{method} isn't supported for {path}.")
                raise AccountError(404, "not_found", "That endpoint doesn't exist on the TradeLab server.")
            if method != "GET":
                self._check_origin()
            handler()
        except AccountError as error:
            self._send_json(error.status, {"error": error.to_dict()})
        except Exception:  # noqa: BLE001 - report without leaking details to the browser
            self.log_error("Unexpected error handling %s %s\n%s", method, path, traceback.format_exc())
            self._send_json(
                500,
                {"error": {"code": "server_error", "message": "Something went wrong on the TradeLab server. Check its terminal for details."}},
            )

    def _create_user(self):
        data = self._read_json()
        user = self.store.create_user(data.get("username"), data.get("email"), data.get("password"))
        token = self.store.create_session(user["id"])
        self._send_json(201, {"user": user}, [("Set-Cookie", self._session_cookie(token))])

    def _get_session(self):
        user = self._current_user()
        if user:
            self._send_json(200, {"user": user, "guestLimits": None})
            return
        token, limits, created = self.store.ensure_guest_session(self._guest_token())
        headers = [("Set-Cookie", self._guest_session_cookie(token))] if created else []
        self._send_json(200, {"user": None, "guestLimits": limits}, headers)

    def _sign_in(self):
        data = self._read_json()
        user = self.store.authenticate(data.get("login"), data.get("password"))
        token = self.store.create_session(user["id"])
        self._send_json(200, {"user": user}, [("Set-Cookie", self._session_cookie(token))])

    def _sign_out(self):
        self.store.delete_session(self._session_token())
        self._send_json(204, None, [("Set-Cookie", f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")])

    def _check_email(self):
        # POST rather than GET so addresses don't end up in the request log.
        data = self._read_json()
        self._send_json(200, self.store.check_email(data.get("email")).to_dict())

    def _signed_in_user(self) -> dict:
        user = self._current_user()
        if user is None:
            raise AccountError(401, "not_signed_in", "Sign in to save progress to your account.")
        return user

    def _current_user(self) -> dict | None:
        return self.store.user_for_session(self._session_token())

    def _get_guest_limits(self):
        if self._current_user():
            self._send_json(200, {"authenticated": True, "limits": None})
            return
        token, limits, created = self.store.ensure_guest_session(self._guest_token())
        headers = [("Set-Cookie", self._guest_session_cookie(token))] if created else []
        self._send_json(200, {"authenticated": False, "limits": limits}, headers)

    def _advance_guest_simulation(self):
        if self._current_user():
            self._send_json(200, {"authenticated": True})
            return
        data = self._read_json()
        token = self._valid_guest_token()
        granted, limits = self.store.reserve_guest_simulation_days(token, data.get("days"))
        if granted == 0:
            raise AccountError(
                403,
                "guest_simulation_limit",
                "You've reached the guest simulation limit. Create an account to continue using TradeLab.",
            )
        self._send_json(
            200,
            {
                "authenticated": False,
                "grantedDays": granted,
                "limitReached": limits["simulationDaysRemaining"] == 0,
                "limits": limits,
            },
        )

    def _reserve_guest_journal_entry(self):
        if self._current_user():
            self._send_json(200, {"authenticated": True})
            return
        self._read_json()
        token = self._valid_guest_token()
        limits = self.store.reserve_guest_journal_entry(token)
        if limits is None:
            raise AccountError(
                403,
                "guest_journal_limit",
                "You've reached the guest journal limit. Create an account to add more entries.",
            )
        self._send_json(200, {"authenticated": False, "limits": limits})

    def _get_lesson(self, lesson_id: str, include_content: bool):
        if lesson_id not in LESSON_IDS:
            raise AccountError(404, "lesson_not_found", "That lesson doesn't exist.")
        if not self._current_user() and lesson_id not in GUEST_COURSE_IDS:
            raise AccountError(
                403,
                "course_account_required",
                "This course requires an account. Sign up to unlock more learning content.",
            )
        if not include_content:
            self._send_json(200, {"allowed": True, "lessonId": lesson_id})
            return
        try:
            with open(LESSON_CONTENT_PATH, encoding="utf-8") as handle:
                lessons = json.load(handle)["lessons"]
            lesson = next((item for item in lessons if item["id"] == lesson_id), None)
        except (OSError, json.JSONDecodeError, KeyError, TypeError):
            self.log_error("Course content could not be loaded for lesson %s", lesson_id)
            raise AccountError(500, "lesson_content_unavailable", "Course content could not be loaded.") from None
        if lesson is None:
            self.log_error("Course content is missing for configured lesson %s", lesson_id)
            raise AccountError(500, "lesson_content_unavailable", "Course content could not be loaded.")
        self._send_json(200, {"lesson": lesson})

    def _get_user_data(self):
        user = self._signed_in_user()
        data, updated_at = self.store.load_user_data(user["id"])
        self._send_json(200, {"data": data, "updatedAt": updated_at})

    def _put_user_data(self):
        user = self._signed_in_user()
        body = self._read_json(limit=MAX_USER_DATA_BYTES + 1024)
        self._send_json(200, {"updatedAt": self.store.save_user_data(user["id"], body.get("data"))})

    # -- Helpers -------------------------------------------------------------

    def _check_origin(self):
        """Refuses changes requested by other websites (a basic CSRF guard)."""
        origin = self.headers.get("Origin")
        if origin is not None and urlsplit(origin).netloc != self.headers.get("Host", ""):
            raise AccountError(403, "forbidden_origin", "Requests from other websites aren't allowed.")

    def _read_json(self, limit: int = MAX_BODY_BYTES) -> dict:
        if "application/json" not in (self.headers.get("Content-Type") or ""):
            raise AccountError(415, "unsupported_media_type", "Send the request body as JSON.")
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = -1
        if length < 0 or length > limit:
            raise AccountError(413, "payload_too_large", "That request is too large.")
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        except (UnicodeDecodeError, json.JSONDecodeError):
            raise AccountError(400, "invalid_request", "The request body isn't valid JSON.") from None
        if not isinstance(data, dict):
            raise AccountError(400, "invalid_request", "The request body must be a JSON object.")
        return data

    def _session_token(self) -> str | None:
        return self._cookie_value(SESSION_COOKIE)

    def _guest_token(self) -> str | None:
        return self._cookie_value(GUEST_SESSION_COOKIE)

    def _cookie_value(self, cookie_name: str) -> str | None:
        for part in (self.headers.get("Cookie") or "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == cookie_name and value:
                return value
        return None

    def _valid_guest_token(self) -> str:
        token = self._guest_token()
        if not token or self.store.guest_session_limits(token) is None:
            raise AccountError(401, "guest_session_required", "Refresh the page to start a guest session.")
        return token

    def _session_cookie(self, token: str) -> str:
        max_age = self.store.session_days * 24 * 60 * 60
        return f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"

    def _guest_session_cookie(self, token: str) -> str:
        max_age = GUEST_SESSION_DAYS * 24 * 60 * 60
        return f"{GUEST_SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"

    def _send_json(self, status: int, payload, headers=()):
        body = b"" if payload is None else json.dumps(payload).encode("utf-8")
        self.send_response(status)
        if payload is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for name, value in headers:
            self.send_header(name, value)
        self.end_headers()
        if body:
            self.wfile.write(body)


def make_server(store: AccountStore, port: int, root: str = ROOT) -> http.server.ThreadingHTTPServer:
    """A server for `root` and the account API backed by `store` (port 0 picks a free port)."""
    handler_class = type("TradeLabHandler", (Handler,), {"store": store})
    return http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(handler_class, directory=root))


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", "5173"))
    db_path = os.path.abspath(os.environ.get("TRADELAB_DB") or os.path.join(ROOT, "tradelab.db"))
    store = AccountStore(db_path)
    try:
        notes = store.migrate()
    except DatabaseSetupError as error:
        sys.exit(f"Can't use the user database at {db_path}: {error}")

    try:
        httpd = make_server(store, port)
    except OSError as error:
        sys.exit(f"Can't start on port {port} ({error.strerror}). Is TradeLab already running? Try another port: python3 scripts/dev_server.py 8000")

    with httpd:
        count = store.count_users()
        lines = [
            f"TradeLab running at http://127.0.0.1:{port}",
            f"User database: {db_path} ({count} account{'' if count == 1 else 's'})",
            f"Email checks use DNS servers: {', '.join(store.email_checker.nameservers)}",
            *(f"  {note}" for note in notes),
            "Press Ctrl+C to stop.",
        ]
        print("\n".join(lines), flush=True)
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
