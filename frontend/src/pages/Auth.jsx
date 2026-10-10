import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Auth() {
  const [params] = useSearchParams();
  const [mode, setMode] = useState(params.get("mode") === "register" ? "register" : "login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const switchMode = (m) => {
    setMode(m);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submitting) return;
    try {
      setSubmitting(true);
      setError("");
      if (mode === "register") {
        await register({ username, password, nickname });
      } else {
        await login({ username, password });
      }
      navigate("/studio");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="container auth-page">
      <div className="auth-card">
        <div className="auth-tabs">
          <button
            className={mode === "login" ? "auth-tab active" : "auth-tab"}
            onClick={() => switchMode("login")}
          >
            登录
          </button>
          <button
            className={mode === "register" ? "auth-tab active" : "auth-tab"}
            onClick={() => switchMode("register")}
          >
            注册
          </button>
        </div>

        <h1 className="auth-title">
          {mode === "login" ? "欢迎回来，小画家" : "加入呆瓜画画网"}
        </h1>
        <p className="auth-sub">
          {mode === "login"
            ? "登录后就能发布画作、管理你的作品啦"
            : "注册一个账号，画作会署你的大名"}
        </p>

        <form onSubmit={handleSubmit} className="auth-form">
          <label className="field">
            用户名
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="3-20 位中英文、数字或下划线"
              maxLength={20}
              autoComplete="username"
            />
          </label>
          {mode === "register" && (
            <label className="field">
              昵称（可不填，默认同用户名）
              <input
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="画作上署这个名字"
                maxLength={20}
              />
            </label>
          )}
          <label className="field">
            密码
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位"
              maxLength={64}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? "请稍候..." : mode === "login" ? "登录" : "注册并开始画画"}
          </button>
        </form>

        <p className="auth-switch-tip">
          {mode === "login" ? (
            <>还没有账号？<button className="link-btn" onClick={() => switchMode("register")}>去注册</button></>
          ) : (
            <>已经有账号了？<button className="link-btn" onClick={() => switchMode("login")}>去登录</button></>
          )}
        </p>
      </div>
    </div>
  );
}
