# -*- coding: utf-8 -*-
"""呆瓜画画网 - 账号系统模块

基于 SQLite（标准库）实现用户注册、登录与会话管理：
- 密码使用 PBKDF2-HMAC-SHA256 加盐哈希，绝不明文存储
- 会话采用服务端 Token（默认 7 天有效）
- 发布画作需要登录，画作作者与账号绑定
"""
import hashlib
import re
import secrets
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "app.db"
TOKEN_TTL = 7 * 24 * 3600  # 7 天
PBKDF2_ITERATIONS = 120_000


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                username      TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt          TEXT NOT NULL,
                nickname      TEXT NOT NULL,
                created_at    INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                token      TEXT PRIMARY KEY,
                user_id    INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            );
            """
        )


# ---------------------------------------------------------------- 校验

def validate_username(username: str) -> str:
    username = (username or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_\u4e00-\u9fff]{3,20}", username):
        raise ValueError("用户名需为 3-20 位的中英文、数字或下划线")
    return username


def validate_password(password: str) -> str:
    if not password or len(password) < 6:
        raise ValueError("密码至少需要 6 位")
    if len(password) > 64:
        raise ValueError("密码过长，请控制在 64 位以内")
    return password


def _hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), bytes.fromhex(salt), PBKDF2_ITERATIONS
    ).hex()


# ---------------------------------------------------------------- 会话

def _new_session(conn: sqlite3.Connection, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    now = int(time.time())
    conn.execute(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
        (token, user_id, now, now + TOKEN_TTL),
    )
    return token


def _user_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "username": row["username"],
        "nickname": row["nickname"],
        "createdAt": row["created_at"],
    }


# ---------------------------------------------------------------- 注册登录

def register(username: str, password: str, nickname: str = "") -> dict:
    """注册：用户名 + 密码，注册成功即建立会话（自动登录）。"""
    username = validate_username(username)
    password = validate_password(password)
    nickname = (nickname or "").strip()[:20] or username
    salt = secrets.token_hex(16)
    pwd_hash = _hash_password(password, salt)
    now = int(time.time())
    with _conn() as conn:
        exists = conn.execute(
            "SELECT 1 FROM users WHERE username = ?", (username,)
        ).fetchone()
        if exists:
            raise ValueError("该用户名已被注册，换一个试试")
        cur = conn.execute(
            """INSERT INTO users (username, password_hash, salt, nickname, created_at)
               VALUES (?, ?, ?, ?, ?)""",
            (username, pwd_hash, salt, nickname, now),
        )
        token = _new_session(conn, cur.lastrowid)
        row = conn.execute("SELECT * FROM users WHERE id = ?", (cur.lastrowid,)).fetchone()
        return {"token": token, "user": _user_dict(row)}


def login(username: str, password: str) -> dict:
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("请填写用户名和密码")
    with _conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        if not row or _hash_password(password, row["salt"]) != row["password_hash"]:
            raise ValueError("用户名或密码错误")
        token = _new_session(conn, row["id"])
        return {"token": token, "user": _user_dict(row)}


def logout(token: str) -> None:
    with _conn() as conn:
        conn.execute("DELETE FROM sessions WHERE token = ?", (token,))


def get_user_by_token(token: str):
    if not token:
        return None
    with _conn() as conn:
        row = conn.execute(
            "SELECT u.* FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ?",
            (token,),
        ).fetchone()
        if not row:
            return None
        session = conn.execute(
            "SELECT expires_at FROM sessions WHERE token = ?", (token,)
        ).fetchone()
        if session["expires_at"] < int(time.time()):
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
            return None
        return _user_dict(row)
