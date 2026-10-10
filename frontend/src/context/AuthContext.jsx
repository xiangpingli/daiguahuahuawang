import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getToken, setToken, me as apiMe, logout as apiLogout, login as apiLogin, register as apiRegister } from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await apiMe();
      setUser(res.user);
    } catch {
      setToken("");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const applyAuth = (res) => {
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isLoggedIn: !!user,
      async login(payload) {
        const res = await apiLogin(payload);
        return applyAuth(res);
      },
      async register(payload) {
        const res = await apiRegister(payload);
        return applyAuth(res);
      },
      async logout() {
        try {
          await apiLogout();
        } catch {
          // 本地登出优先
        }
        setToken("");
        setUser(null);
      },
      refresh,
    }),
    [user, loading, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
