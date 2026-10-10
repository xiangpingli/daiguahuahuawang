import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listArtworks } from "../api";

export default function Gallery() {
  const [items, setItems] = useState([]);
  const [sort, setSort] = useState("latest");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await listArtworks(sort, keyword);
      setItems(res.items);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort]);

  return (
    <div className="container gallery">
      <h1 className="page-title">画展</h1>
      <p className="page-sub">大家的大作都在这里，点开看大图、点赞</p>

      <div className="gallery-toolbar">
        <div className="sort-tabs">
          <button
            className={sort === "latest" ? "sort-tab active" : "sort-tab"}
            onClick={() => setSort("latest")}
          >
            最新
          </button>
          <button
            className={sort === "popular" ? "sort-tab active" : "sort-tab"}
            onClick={() => setSort("popular")}
          >
            最热
          </button>
        </div>
        <div className="search-box">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜标题或作者"
            onKeyDown={(e) => e.key === "Enter" && load()}
          />
          <button className="btn btn-primary" onClick={load}>搜索</button>
        </div>
      </div>

      {loading ? (
        <div className="empty-tip">画展布置中...</div>
      ) : error ? (
        <div className="empty-tip error">{error}</div>
      ) : items.length === 0 ? (
        <div className="empty-tip">
          这里还没有画作，<Link to="/studio" className="link">去创作第一幅</Link>？
        </div>
      ) : (
        <div className="artwork-grid">
          {items.map((a) => (
            <Link to={`/artwork/${a.id}`} className="artwork-card" key={a.id}>
              <img src={a.image} alt={a.title} className="artwork-thumb" />
              <div className="artwork-meta">
                <strong className="artwork-title">{a.title}</strong>
                <span className="artwork-sub">
                  {a.author} · {a.createdAtText}
                </span>
                <span className="artwork-likes">赞 {a.likes}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
