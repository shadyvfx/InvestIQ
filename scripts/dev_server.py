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

from server.accounts import MAX_USER_DATA_BYTES, AccountError, AccountStore, DatabaseSetupError  # noqa: E402

SESSION_COOKIE = "tradelab_session"
MAX_BODY_BYTES = 16 * 1024

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
        }
        try:
            handler = routes.get((method, path))
            if handler is None:
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
        self._send_json(200, {"user": self.store.user_for_session(self._session_token())})

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
        user = self.store.user_for_session(self._session_token())
        if user is None:
            raise AccountError(401, "not_signed_in", "Sign in to save progress to your account.")
        return user

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
        for part in (self.headers.get("Cookie") or "").split(";"):
            name, _, value = part.strip().partition("=")
            if name == SESSION_COOKIE and value:
                return value
        return None

    def _session_cookie(self, token: str) -> str:
        max_age = self.store.session_days * 24 * 60 * 60
        return f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"

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
