import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getStats, listArtworks } from "../api";

export default function Home() {
  const [stats, setStats] = useState({ artworks: 0, likes: 0, views: 0 });
  const [latest, setLatest] = useState([]);

  useEffect(() => {
    getStats().then(setStats).catch(() => {});
    listArtworks("latest")
      .then((res) => setLatest(res.items.slice(0, 6)))
      .catch(() => {});
  }, []);

  return (
    <div>
      <section className="hero">
        <div className="container hero-inner">
          <h1 className="hero-title">呆瓜画画网</h1>
          <p className="hero-slogan">不用学画画，画得开心就好</p>
          <div className="hero-actions">
            <Link to="/studio" className="btn btn-primary btn-lg">拿起画笔去创作</Link>
            <Link to="/gallery" className="btn btn-ghost btn-lg">先去逛逛画展</Link>
          </div>
        </div>
      </section>

      <section className="container stats-bar">
        <div className="stat-card">
          <strong>{stats.artworks}</strong>
          <span>幅画作</span>
        </div>
        <div className="stat-card">
          <strong>{stats.likes}</strong>
          <span>次点赞</span>
        </div>
        <div className="stat-card">
          <strong>{stats.views}</strong>
          <span>次浏览</span>
        </div>
      </section>

      <section className="container section">
        <h2 className="section-title">最新画作</h2>
        {latest.length === 0 ? (
          <div className="empty-tip">
            画展还空着呢，<Link to="/studio" className="link">去画第一幅</Link>？
          </div>
        ) : (
          <div className="artwork-grid">
            {latest.map((a) => (
              <Link to={`/artwork/${a.id}`} className="artwork-card" key={a.id}>
                <img src={a.image} alt={a.title} className="artwork-thumb" />
                <div className="artwork-meta">
                  <strong className="artwork-title">{a.title}</strong>
                  <span className="artwork-sub">{a.author} · {a.createdAtText}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="container section">
        <h2 className="section-title">怎么玩</h2>
        <div className="steps">
          <div className="step-card">
            <div className="step-num">1</div>
            <h3>打开画板</h3>
            <p>选颜色、调粗细，想画啥画啥，画错了还能撤销。</p>
          </div>
          <div className="step-card">
            <div className="step-num">2</div>
            <h3>发布到画展</h3>
            <p>起个响亮的标题，写上你的大名，一键发布。</p>
          </div>
          <div className="step-card">
            <div className="step-num">3</div>
            <h3>收获点赞</h3>
            <p>大家都能在画展看到你的大作，为你点赞。</p>
          </div>
        </div>
      </section>
    </div>
  );
}
