import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { addComment, deleteArtwork, deleteComment, getArtwork, likeArtwork, updateArtwork } from "../api";
import { useAuth } from "../context/AuthContext";

export default function ArtworkDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isLoggedIn } = useAuth();
  const [artwork, setArtwork] = useState(null);
  const [error, setError] = useState("");
  const [liked, setLiked] = useState(false);
  const [tip, setTip] = useState("");

  // 评论
  const [commentText, setCommentText] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);

  // 编辑画作信息（标题/简介）
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editBusy, setEditBusy] = useState(false);

  useEffect(() => {
    getArtwork(id)
      .then(setArtwork)
      .catch((err) => setError(err.message));
  }, [id]);

  const isOwner = isLoggedIn && artwork && artwork.userId === user.id;
  const comments = (artwork && artwork.comments) || [];

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

  const startEdit = () => {
    setEditTitle(artwork.title);
    setEditDesc(artwork.description || "");
    setEditing(true);
    setTip("");
  };

  const handleSaveEdit = async () => {
    if (editBusy) return;
    try {
      setEditBusy(true);
      const res = await updateArtwork(id, { title: editTitle, description: editDesc });
      setArtwork(res.artwork);
      setEditing(false);
      setTip("画作信息已更新");
    } catch (err) {
      setTip(err.message);
    } finally {
      setEditBusy(false);
    }
  };

  const handleComment = async () => {
    if (commentBusy) return;
    const content = commentText.trim();
    if (!content) {
      setTip("评论内容不能为空");
      return;
    }
    try {
      setCommentBusy(true);
      const res = await addComment(id, content);
      setArtwork((prev) => ({ ...prev, comments: [...(prev.comments || []), res.comment] }));
      setCommentText("");
      setTip("");
    } catch (err) {
      setTip(err.message);
    } finally {
      setCommentBusy(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("确定删除这条评论吗？")) return;
    try {
      await deleteComment(id, commentId);
      setArtwork((prev) => ({
        ...prev,
        comments: (prev.comments || []).filter((c) => c.id !== commentId),
      }));
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
          {editing ? (
            <div className="edit-form">
              <label className="field">
                画作标题
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  maxLength={50}
                />
              </label>
              <label className="field">
                画作简介
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  maxLength={200}
                />
              </label>
              <div className="edit-actions">
                <button className="btn btn-primary" onClick={handleSaveEdit} disabled={editBusy}>
                  {editBusy ? "保存中..." : "保存修改"}
                </button>
                <button className="btn btn-ghost" onClick={() => setEditing(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="detail-title">{artwork.title}</h1>
              <p className="detail-author">
                作者：{artwork.author} · {artwork.createdAtText}
              </p>
              {artwork.description && <p className="detail-desc">{artwork.description}</p>}
            </>
          )}
          <div className="detail-stats">
            <span>赞 {artwork.likes}</span>
            <span>浏览 {artwork.views}</span>
            <span>评论 {comments.length}</span>
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
            {isOwner && !editing && (
              <>
                <button className="btn btn-ghost" onClick={startEdit}>
                  编辑信息
                </button>
                <Link className="btn btn-ghost" to={`/studio?artworkId=${artwork.id}`}>
                  重画这幅画
                </Link>
                <button className="btn btn-danger" onClick={handleDelete}>
                  删除
                </button>
              </>
            )}
          </div>
          {tip && <p className="publish-message">{tip}</p>}
        </div>
      </div>

      <div className="comments-panel">
        <h2 className="panel-title">评论区（{comments.length}）</h2>
        {isLoggedIn ? (
          <div className="comment-composer">
            <textarea
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder={`说说你对《${artwork.title}》的看法...`}
              rows={3}
              maxLength={200}
            />
            <div className="composer-foot">
              <span className="composer-count">{commentText.length}/200</span>
              <button
                className="btn btn-primary"
                onClick={handleComment}
                disabled={commentBusy || !commentText.trim()}
              >
                {commentBusy ? "发布中..." : "发表评论"}
              </button>
            </div>
          </div>
        ) : (
          <p className="comment-login-tip">
            <Link to="/auth" className="link">登录</Link> 后就能评论交流啦
          </p>
        )}
        <div className="comment-list">
          {comments.length === 0 ? (
            <p className="empty-tip">还没有评论，来抢沙发！</p>
          ) : (
            comments.map((c) => (
              <div className="comment-item" key={c.id}>
                <div className="comment-head">
                  <strong>{c.author}</strong>
                  <span className="comment-time">{c.createdAtText}</span>
                  {isLoggedIn && c.userId === user.id && (
                    <button
                      className="comment-del"
                      onClick={() => handleDeleteComment(c.id)}
                      title="删除我的评论"
                    >
                      删除
                    </button>
                  )}
                </div>
                <p className="comment-content">{c.content}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
