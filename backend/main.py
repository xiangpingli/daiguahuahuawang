# -*- coding: utf-8 -*-
"""呆瓜画画网 - FastAPI 后端服务

提供画作发布、画展浏览、画作详情、点赞、删除、统计等 API，
并在生产模式下托管 React 前端构建产物（frontend/dist），
统一通过 9999 端口对外服务。
"""
import base64
import json
import re
import threading
import time
import uuid
from pathlib import Path

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

import auth
import moderation

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
ARTWORK_DIR = DATA_DIR / "artworks"
GALLERY_JSON = DATA_DIR / "gallery.json"
# 前端构建产物目录（frontend/dist），构建后由本服务统一托管
DIST_DIR = BASE_DIR.parent / "frontend" / "dist"

IMAGE_DATA_RE = re.compile(r"^data:image/(png|jpeg);base64,(.+)$", re.DOTALL)

app = FastAPI(
    title="呆瓜画画网 API",
    description="在线画板创作与画展分享：自由创作画作，一键发布到画展",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------- 数据存储

_lock = threading.Lock()


def _ensure_dirs():
    ARTWORK_DIR.mkdir(parents=True, exist_ok=True)


def _load_gallery() -> dict:
    if not GALLERY_JSON.exists():
        return {"items": []}
    with open(GALLERY_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_gallery(data: dict) -> None:
    _ensure_dirs()
    tmp = GALLERY_JSON.with_suffix(".json.tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(GALLERY_JSON)


_ensure_dirs()

# 初始化账号数据库（用户/会话）
auth.init_db()


# ---------------------------------------------------------------- 模型

class PublishRequest(BaseModel):
    title: str = Field(default="未命名画作", max_length=50, description="画作标题")
    description: str = Field(default="", max_length=200, description="画作简介")
    imageData: str = Field(..., description="画布导出的 dataURL（data:image/png;base64,...）")


class RegisterRequest(BaseModel):
    username: str = Field(..., description="用户名（3-20 位中英文、数字或下划线）")
    password: str = Field(..., description="密码（至少 6 位）")
    nickname: str = Field(default="", max_length=20, description="昵称（可选，默认同用户名）")


class LoginRequest(BaseModel):
    username: str = Field(..., description="用户名")
    password: str = Field(..., description="密码")


# ---------------------------------------------------------------- 鉴权

def _bearer_token(authorization: str = Header(default="")) -> str:
    if authorization.startswith("Bearer "):
        return authorization[7:].strip()
    return ""


def require_user(authorization: str = Header(default="")) -> dict:
    user = auth.get_user_by_token(_bearer_token(authorization))
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再发布画作")
    return user


# ---------------------------------------------------------------- 账号 API

@app.post("/api/auth/register")
def auth_register(req: RegisterRequest):
    """注册成功即自动登录，返回 token 与用户信息。"""
    ok, reason = moderation.check_text(req.username, req.nickname)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    try:
        return auth.register(req.username, req.password, req.nickname)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/auth/login")
def auth_login(req: LoginRequest):
    try:
        return auth.login(req.username, req.password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(require_user)):
    return {"user": user}


@app.post("/api/auth/logout")
def auth_logout(authorization: str = Header(default="")):
    token = _bearer_token(authorization)
    if token:
        auth.logout(token)
    return {"message": "已退出登录"}


# ---------------------------------------------------------------- API

@app.get("/api/artworks")
def list_artworks(sort: str = "latest", keyword: str = ""):
    """画展列表。sort=latest 按最新，popular 按最热；keyword 模糊搜索标题/作者。"""
    data = _load_gallery()
    items = data.get("items", [])
    if keyword.strip():
        kw = keyword.strip().lower()
        items = [a for a in items if kw in a.get("title", "").lower() or kw in a.get("author", "").lower()]
    if sort == "popular":
        items = sorted(items, key=lambda a: a.get("likes", 0), reverse=True)
    else:
        items = sorted(items, key=lambda a: a.get("createdAt", 0), reverse=True)
    return {"items": items, "total": len(items)}


@app.post("/api/artworks")
def publish_artwork(req: PublishRequest, user: dict = Depends(require_user)):
    """发布画作到画展：需登录，作者强制为账号昵称。"""
    match = IMAGE_DATA_RE.match(req.imageData.strip())
    if not match:
        raise HTTPException(status_code=400, detail="图片数据格式不正确，请重新创作后再发布")
    ext = "png" if match.group(1) == "png" else "jpg"
    try:
        raw = base64.b64decode(match.group(2))
    except Exception:
        raise HTTPException(status_code=400, detail="图片解码失败，请重新创作后再发布")

    # 内容审核：标题/简介文本 + 画作图片双重检查，命中色情低俗即拒绝发布
    ok, reason = moderation.check_text(req.title, req.description)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)
    ok, reason = moderation.check_image(raw)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)

    artwork_id = uuid.uuid4().hex[:12]
    _ensure_dirs()
    (ARTWORK_DIR / f"{artwork_id}.{ext}").write_bytes(raw)

    now = time.time()
    item = {
        "id": artwork_id,
        "title": req.title.strip() or "未命名画作",
        "author": user["nickname"],
        "userId": user["id"],
        "description": req.description.strip(),
        "image": f"/artworks-img/{artwork_id}.{ext}",
        "likes": 0,
        "views": 0,
        "createdAt": now,
        "createdAtText": time.strftime("%Y-%m-%d %H:%M", time.localtime(now)),
    }
    with _lock:
        data = _load_gallery()
        data["items"].append(item)
        _save_gallery(data)
    return {"message": "发布成功，快去画展看看吧", "artwork": item}


@app.get("/api/artworks/{artwork_id}")
def get_artwork(artwork_id: str):
    data = _load_gallery()
    for item in data.get("items", []):
        if item["id"] == artwork_id:
            with _lock:
                item["views"] = item.get("views", 0) + 1
                _save_gallery(data)
            return item
    raise HTTPException(status_code=404, detail="画作不存在或已被删除")


@app.post("/api/artworks/{artwork_id}/like")
def like_artwork(artwork_id: str):
    with _lock:
        data = _load_gallery()
        for item in data.get("items", []):
            if item["id"] == artwork_id:
                item["likes"] = item.get("likes", 0) + 1
                _save_gallery(data)
                return {"likes": item["likes"]}
    raise HTTPException(status_code=404, detail="画作不存在或已被删除")


@app.get("/api/my/artworks")
def my_artworks(user: dict = Depends(require_user)):
    """当前登录用户发布的全部画作。"""
    data = _load_gallery()
    items = [a for a in data.get("items", []) if a.get("userId") == user["id"]]
    items.sort(key=lambda a: a.get("createdAt", 0), reverse=True)
    return {"items": items, "total": len(items)}


@app.delete("/api/artworks/{artwork_id}")
def delete_artwork(artwork_id: str, user: dict = Depends(require_user)):
    with _lock:
        data = _load_gallery()
        kept = []
        removed = None
        for item in data.get("items", []):
            if item["id"] == artwork_id:
                removed = item
            else:
                kept.append(item)
        if removed is None:
            raise HTTPException(status_code=404, detail="画作不存在或已被删除")
        if removed.get("userId") != user["id"]:
            raise HTTPException(status_code=403, detail="只能删除自己的画作")
        data["items"] = kept
        _save_gallery(data)
    suffix = Path(removed["image"]).suffix
    (ARTWORK_DIR / f"{artwork_id}{suffix}").unlink(missing_ok=True)
    return {"message": "画作已删除"}


@app.get("/api/stats")
def get_stats():
    data = _load_gallery()
    items = data.get("items", [])
    return {
        "artworks": len(items),
        "likes": sum(a.get("likes", 0) for a in items),
        "views": sum(a.get("views", 0) for a in items),
    }


# ---------------------------------------------------------------- 静态托管

# 画作图片目录
app.mount("/artworks-img", StaticFiles(directory=str(ARTWORK_DIR)), name="artworks")

# 前端构建产物 + SPA 路由回退（catch-all 必须最后注册）
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        candidate = DIST_DIR / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9999)
