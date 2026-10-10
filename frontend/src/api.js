// 统一 API 封装：开发模式由 vite 代理，生产模式由 FastAPI 同源托管
const TOKEN_KEY = "daigua_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    let detail = `请求失败（${res.status}）`;
    try {
      const data = await res.json();
      if (data && data.detail) detail = data.detail;
    } catch {
      // 忽略非 JSON 响应体
    }
    throw new Error(detail);
  }
  return res.json();
}

/** 获取画展列表：sort=latest|popular，keyword 搜索标题/作者 */
export const listArtworks = (sort = "latest", keyword = "") =>
  request(`/api/artworks?sort=${encodeURIComponent(sort)}&keyword=${encodeURIComponent(keyword)}`);

/** 获取画作详情 */
export const getArtwork = (id) => request(`/api/artworks/${encodeURIComponent(id)}`);

/** 发布画作到画展（需登录） */
export const publishArtwork = (payload) =>
  request("/api/artworks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** 点赞 */
export const likeArtwork = (id) =>
  request(`/api/artworks/${encodeURIComponent(id)}/like`, { method: "POST" });

/** 删除画作（仅作者本人） */
export const deleteArtwork = (id) =>
  request(`/api/artworks/${encodeURIComponent(id)}`, { method: "DELETE" });

/** 编辑已发布画作：改标题/简介，传 imageData 则重画画面（仅作者本人） */
export const updateArtwork = (id, payload) =>
  request(`/api/artworks/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** 发表评论（需登录，内容过审核） */
export const addComment = (artworkId, content) =>
  request(`/api/artworks/${encodeURIComponent(artworkId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });

/** 删除评论（仅评论者本人） */
export const deleteComment = (artworkId, commentId) =>
  request(
    `/api/artworks/${encodeURIComponent(artworkId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" }
  );

/** 修改昵称（同步画作署名） */
export const updateNickname = (nickname) =>
  request("/api/auth/nickname", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });

/** 站点统计 */
export const getStats = () => request("/api/stats");

/** 我的画作列表（需登录） */
export const listMyArtworks = () => request("/api/my/artworks");

/** 注册（成功即自动登录） */
export const register = (payload) =>
  request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** 登录 */
export const login = (payload) =>
  request("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

/** 当前登录用户信息 */
export const me = () => request("/api/auth/me");

/** 退出登录 */
export const logout = () => request("/api/auth/logout", { method: "POST" });
