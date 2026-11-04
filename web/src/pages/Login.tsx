import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { admin, isUnauthorized } from "../lib/admin";
import { ThemeToggle } from "../components/ThemeToggle";
import { useToast } from "../components/Toast";
import { cx } from "../lib/cx";

type Status = "idle" | "busy" | "success";

export function Login({ onDone, onHome }: { onDone: () => void; onHome: () => void }) {
  const toast = useToast();
  const [token, setToken] = useState("");
  const [reveal, setReveal] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [capsLock, setCapsLock] = useState(false);

  useEffect(() => {
    admin.session().then(onDone).catch((cause) => {
      if (!isUnauthorized(cause)) setError(cause instanceof Error ? cause.message : "Cannot reach the API");
    });
  }, [onDone]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status !== "idle" || token.trim() === "") return;
    setStatus("busy");
    setError(null);
    try {
      await admin.login(token.trim());
      setStatus("success");
      toast("Signed in");
      setTimeout(onDone, 780);
    } catch (cause) {
      setStatus("idle");
      setError(cause instanceof Error ? cause.message : "Sign in failed");
      setAttempt((value) => value + 1);
    }
  };

  const readModifiers = (event: KeyboardEvent<HTMLInputElement>) => {
    if (typeof event.getModifierState === "function") setCapsLock(event.getModifierState("CapsLock"));
  };

  return (
    <div className="auth-shell">
      <header className="auth-topbar">
        <button type="button" onClick={onHome} className="auth-top-brand" aria-label="Back to AgentMail home">
          <span className="brand-mark"><Mail size={17} /></span>
          <span>AgentMail<small>inbox infrastructure</small></span>
        </button>
        <ThemeToggle />
      </header>
      <main className="auth-main">
        <section className="auth-intro">
          <div className="section-eyebrow"><span className="status-pulse" /> ADMIN CONSOLE</div>
          <h1>Run your inboxes from one place.</h1>
          <p>Manage inbound domains, provision mailboxes, and review incoming messages through the AgentMail dashboard.</p>
          <div className="auth-points">
            <span><ShieldCheck size={14} /> Scoped mailbox access</span>
            <span><Mail size={14} /> One place for inboxes</span>
            <span><KeyRound size={14} /> API-first workflows</span>
          </div>
        </section>

        <div className="auth-card animate-rise">
          {status === "success" ? (
            <div className="flex min-h-[315px] flex-col items-center justify-center py-6 text-center">
              <span className="animate-pop relative flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="size-8" strokeWidth={2.6} />
                <span className="animate-ring absolute inset-0 rounded-full border border-success/40" />
              </span>
              <div className="mt-5 text-[19px] font-semibold tracking-tight">Signed in</div>
              <div className="mt-1 text-[13px] text-secondary">Opening dashboard…</div>
              <div className="mt-6 h-1 w-36 overflow-hidden rounded-full bg-hairline">
                <div className="login-progress h-full w-full origin-left rounded-full bg-success" />
              </div>
            </div>
          ) : (
            <form onSubmit={submit}>
              <div className="flex items-start justify-between">
                <span className="brand-mark !size-11 !rounded-[13px]"><Lock size={19} /></span>
                <span className="inline-flex items-center gap-1 rounded-full border border-hairline bg-canvas px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.1em] text-secondary">
                  <ShieldCheck className="size-3" /> Admin access
                </span>
              </div>
              <h2>Sign in</h2>
              <p className="auth-card-copy">Use your admin token to open the management dashboard.</p>

              <label className="auth-token-label block">
                <span className="mb-1.5 block px-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">Admin token</span>
                <div className={cx(
                  "flex items-center rounded-xl border bg-canvas transition-all duration-200",
                  error ? "border-danger/60" : "border-hairline focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/10",
                )}>
                  <KeyRound className="ml-3 size-4 shrink-0 text-tertiary" />
                  <input
                    value={token}
                    onChange={(event) => setToken(event.target.value)}
                    onKeyDown={readModifiers}
                    onKeyUp={readModifiers}
                    type={reveal ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="Paste admin token"
                    spellCheck={false}
                    className="min-w-0 flex-1 bg-transparent px-2.5 py-3 font-mono text-[12px] outline-none placeholder:font-sans placeholder:text-tertiary"
                  />
                  <button type="button" aria-label={reveal ? "Hide token" : "Show token"} onClick={() => setReveal((value) => !value)} className="mr-1 rounded-full p-1.5 text-secondary transition hover:text-label">
                    {reveal ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </label>

              <div className="min-h-[24px] px-1 pt-1.5">
                {error ? <p key={attempt} className="animate-shake text-[11px] text-danger">{error}</p> : capsLock ? <p className="text-[11px] text-warning">Caps Lock is on</p> : null}
              </div>

              <button type="submit" disabled={status === "busy" || token.trim() === ""} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[13px] font-semibold text-[#08111e] shadow-[0_12px_28px_-16px_var(--accent)] transition-all active:scale-[0.99] disabled:opacity-50">
                {status === "busy" ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {status === "busy" ? "Signing in…" : "Sign in to dashboard"}
              </button>
              <div className="mt-4 flex items-center justify-center gap-1.5 text-[9px] text-tertiary">
                <Lock className="size-3" /> Session lasts 7 days
              </div>
            </form>
          )}
        </div>
      </main>
      <footer className="auth-footer">
        <button type="button" onClick={onHome} className="inline-flex items-center gap-1.5"><ArrowLeft size={12} /> Back to AgentMail</button>
      </footer>
    </div>
  );
}
