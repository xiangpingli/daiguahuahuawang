import { NavLink, Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Navbar() {
  const { user, isLoggedIn, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <header className="navbar">
      <div className="container navbar-inner">
        <Link to="/" className="brand">
          <img src="/logo.svg" alt="呆瓜画画网" className="brand-logo" />
          <span className="brand-name">呆瓜画画网</span>
        </Link>
        <nav className="nav-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            首页
          </NavLink>
          <NavLink to="/studio" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            画板创作
          </NavLink>
          <NavLink to="/gallery" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
            画展
          </NavLink>
          {isLoggedIn && (
            <NavLink to="/my" className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}>
              我的画作
            </NavLink>
          )}
        </nav>
        <div className="nav-user">
          {isLoggedIn ? (
            <>
              <span className="nav-nickname" title={user.username}>{user.nickname}</span>
              <button className="nav-btn" onClick={handleLogout}>退出</button>
            </>
          ) : (
            <>
              <Link to="/auth" className="nav-link">登录</Link>
              <Link to="/auth?mode=register" className="nav-btn nav-btn-primary">注册</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
