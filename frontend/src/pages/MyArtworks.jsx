import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listMyArtworks, deleteArtwork } from "../api";
import { useAuth } from "../context/AuthContext";

export default function MyArtworks() {
  const { isLoggedIn, loading: authLoading, user, updateNickname } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [nameEditing, setNameEditing] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameMsg, setNameMsg] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading) return;
    if (!isLoggedIn) {
      navigate("/auth");
      return;
    }
    listMyArtworks()
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isLoggedIn, authLoading, navigate]);

  const handleDelete = async (id) => {
    if (!window.confirm("确定要删除这幅画作吗？删除后无法恢复。")) return;
    try {
      await deleteArtwork(id);
      setItems((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRename = async () => {
    if (nameBusy) return;
    const nickname = newName.trim();
    if (!nickname) {
      setNameMsg("昵称不能为空");
      return;
    }
    try {
      setNameBusy(true);
      const res = await updateNickname(nickname);
      setNameMsg(res.message);
      setNameEditing(false);
      setItems((prev) => prev.map((a) => ({ ...a, author: res.user.nickname })));
    } catch (err) {
      setNameMsg(err.message);
    } finally {
      setNameBusy(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="container my-page">
        <div className="empty-tip">画作整理中...</div>
      </div>
    );
  }

  return (
    <div className="container my-page">
      <h1 className="page-title">我的画作</h1>
      <p className="page-sub">你发布的画作都在这里，可以随时删除</p>

      <div className="profile-card">
        <div className="profile-row">
          <span className="profile-label">我的昵称</span>
          <strong className="profile-name">{user.nickname}</strong>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => {
              setNameEditing(!nameEditing);
              setNewName("");
              setNameMsg("");
            }}
          >
            {nameEditing ? "收起" : "修改昵称"}
          </button>
        </div>
        {nameEditing && (
          <div className="profile-edit">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="输入新昵称（1-20 字）"
              maxLength={20}
            />
            <button className="btn btn-primary btn-sm" onClick={handleRename} disabled={nameBusy}>
              {nameBusy ? "保存中..." : "保存"}
            </button>
          </div>
        )}
        {nameMsg && <p className="profile-msg">{nameMsg}</p>}
        <p className="profile-hint">改名后，你已发布画作的署名会一起更新</p>
      </div>

      {error && <div className="empty-tip error">{error}</div>}

      {items.length === 0 && !error ? (
        <div className="empty-tip">
          你还没有发布过画作，<Link to="/studio" className="link">去画第一幅</Link>？
        </div>
      ) : (
        <div className="artwork-grid">
          {items.map((a) => (
            <div className="artwork-card" key={a.id}>
              <Link to={`/artwork/${a.id}`}>
                <img src={a.image} alt={a.title} className="artwork-thumb" />
              </Link>
              <div className="artwork-meta">
                <strong className="artwork-title">{a.title}</strong>
                <span className="artwork-sub">
                  {a.author} · {a.createdAtText} · 赞 {a.likes}
                </span>
                <div className="my-card-actions">
                  <Link to={`/artwork/${a.id}`} className="btn btn-ghost btn-sm">查看</Link>
                  <button className="btn btn-danger btn-sm" onClick={() => handleDelete(a.id)}>
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
