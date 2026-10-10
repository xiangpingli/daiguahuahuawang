import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { deleteArtwork, getArtwork, likeArtwork } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ArtworkDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [artwork, setArtwork] = useState(null);
  const [error, setError] = useState("");
  const [liked, setLiked] = useState(false);
  const [tip, setTip] = useState("");

  useEffect(() => {
    getArtwork(id)
      .then(setArtwork)
      .catch((err) => setError(err.message));
  }, [id]);

  const handleLike = async () => {
    if (liked) return;
    try {
      const res = await likeArtwork(id);
      setArtwork((prev) => ({ ...prev, likes: res.likes }));
      setLiked(true);
      setTip("谢谢你的赞");
    } catch (err) {
      setTip(err.message);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("确定要删除这幅画作吗？删除后无法恢复。")) return;
    try {
      await deleteArtwork(id);
      navigate("/gallery");
    } catch (err) {
      setTip(err.message);
    }
  };

  if (error) {
    return (
      <div className="container detail">
        <div className="empty-tip error">{error}</div>
      </div>
    );
  }

  if (!artwork) {
    return (
      <div className="container detail">
        <div className="empty-tip">画作装载中...</div>
      </div>
    );
  }

  return (
    <div className="container detail">
      <div className="detail-layout">
        <div className="detail-art">
          <img src={artwork.image} alt={artwork.title} />
        </div>
        <div className="detail-info">
          <h1 className="detail-title">{artwork.title}</h1>
          <p className="detail-author">
            作者：{artwork.author} · {artwork.createdAtText}
          </p>
          {artwork.description && <p className="detail-desc">{artwork.description}</p>}
          <div className="detail-stats">
            <span>赞 {artwork.likes}</span>
            <span>浏览 {artwork.views}</span>
          </div>
          <div className="detail-actions">
            <button
              className={liked ? "btn btn-liked" : "btn btn-primary"}
              onClick={handleLike}
            >
              {liked ? "已点赞" : "点个赞"}
            </button>
            <button className="btn btn-ghost" onClick={() => navigate("/gallery")}>
              返回画展
            </button>
            {isLoggedIn && artwork.userId === user.id && (
              <button className="btn btn-danger" onClick={handleDelete}>
                删除我的画作
              </button>
            )}
          </div>
          {tip && <p className="publish-message">{tip}</p>}
        </div>
      </div>
    </div>
  );
}
