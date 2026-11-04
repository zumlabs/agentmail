import { useCallback, useEffect, useState } from "react";
import { ToastProvider } from "./components/Toast";
import { Dashboard } from "./pages/Dashboard";
import { Inbox } from "./pages/Inbox";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo({ top: 0 });
  }, []);

  const inboxMatch = /^\/m\/([^/]+)\/?$/.exec(path);
  const token = inboxMatch?.[1] ? decodeURIComponent(inboxMatch[1]) : null;
  const isLogin = path === "/login" || path === "/login/";
  const isDashboard = path === "/dashboard" || path === "/dashboard/";

  return (
    <ToastProvider>
      {token ? (
        <Inbox key={token} token={token} onHome={() => navigate("/")} />
      ) : isLogin ? (
        <Login onDone={() => navigate("/dashboard")} onHome={() => navigate("/")} />
      ) : isDashboard ? (
        <Dashboard
          onLogin={() => navigate("/login")}
          onHome={() => navigate("/")}
          onOpenInbox={(slug) => navigate(`/m/${encodeURIComponent(slug)}`)}
        />
      ) : (
        <Landing onSignIn={() => navigate("/login")} />
      )}
    </ToastProvider>
  );
}
