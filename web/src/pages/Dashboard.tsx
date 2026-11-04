import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Globe,
  HardDrive,
  Inbox as InboxIcon,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  MailOpen,
  Plus,
  Power,
  RefreshCw,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CopyButton, IconButton } from "../components/ui";
import { ThemeToggle } from "../components/ThemeToggle";
import { useToast } from "../components/Toast";
import {
  admin,
  isUnauthorized,
  type AdminDomain,
  type AdminMailbox,
  type AdminStats,
} from "../lib/admin";
import type { CreatedMailboxDto } from "../lib/api";
import { cx } from "../lib/cx";
import { expiryLabel, formatBytes, fullDate, relativeTime } from "../lib/format";

const TTL_OPTIONS = [
  { value: "never", label: "Never expires" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "24 hours" },
  { value: "604800", label: "7 days" },
];

function slugOf(accessUrl: string): string {
  const index = accessUrl.indexOf("/m/");
  return index === -1 ? "" : accessUrl.slice(index + 3);
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof InboxIcon;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-ios border border-hairline bg-surface p-3.5 card-shadow">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary">{label}</span>
        <Icon className="size-3.5 text-tertiary" />
      </div>
      <div className="mt-1.5 text-[23px] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="mt-1 truncate text-[10.5px] text-tertiary">{hint}</div> : null}
    </div>
  );
}

function CreateMailboxSheet({
  domains,
  onClose,
  onCreated,
}: {
  domains: AdminDomain[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [domain, setDomain] = useState("random");
  const [local, setLocal] = useState("");
  const [ttl, setTtl] = useState("never");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedMailboxDto | null>(null);
  const [revealed, setRevealed] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const mailbox = await admin.createMailbox({
        domain,
        local: local.trim() || undefined,
        label: label.trim() || undefined,
        ttl: ttl === "never" ? undefined : Number(ttl),
      });
      setCreated(mailbox);
      setRevealed(false);
      onCreated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the mailbox");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade sm:items-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-[520px] animate-sheet rounded-t-[28px] border border-hairline bg-surface p-5 pb-safe card-shadow sm:rounded-ios">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">New mailbox</h2>
            <p className="mt-0.5 text-[12px] text-secondary">Provisioned through POST /api/v1/mailboxes</p>
          </div>
          <IconButton aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        </div>

        {created ? (
          <div className="mt-4 animate-fade">
            <div className="rounded-2xl border border-accent/25 bg-accent-soft p-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Mailbox ready</div>
              <div className="mt-1.5 flex items-center gap-1">
                <code className="min-w-0 truncate font-mono text-[15px] font-semibold">{created.address}</code>
                <CopyButton value={created.address} />
              </div>
            </div>

            <div className="mt-3 rounded-2xl border border-hairline bg-canvas p-3">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="size-3.5" /> API key
                </span>
                <span className="font-normal normal-case tracking-normal text-tertiary">shown once</span>
              </div>
              <div className="mt-1.5 flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate font-mono text-[12px]">
                  {revealed ? created.apiKey : `${created.apiKeyPrefix}${"•".repeat(16)}`}
                </code>
                <button
                  type="button"
                  aria-label={revealed ? "Hide API key" : "Show API key"}
                  onClick={() => setRevealed((value) => !value)}
                  className="rounded-full p-1.5 text-secondary transition hover:text-label"
                >
                  {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
                <CopyButton value={created.apiKey} label="API key copied" />
              </div>
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="flex items-stretch gap-2">
                <button
                  type="button"
                  onClick={() => window.open(created.accessUrl, "_blank", "noopener")}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition active:scale-[0.99]"
                >
                  Open inbox <ArrowUpRight className="size-4" />
                </button>
                <CopyButton
                  value={created.accessUrl}
                  label="Link copied"
                  text="Copy link"
                  className="rounded-xl border border-hairline bg-canvas px-3.5"
                />
              </div>
              <div className="flex items-center justify-between px-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setCreated(null);
                    setLocal("");
                    setLabel("");
                  }}
                  className="rounded-full px-2 py-1 text-[12.5px] font-medium text-secondary"
                >
                  Create another
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full px-2 py-1 text-[12.5px] font-semibold text-accent"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">
                  Domain
                </span>
                <div className="relative">
                  <select
                    value={domain}
                    onChange={(event) => setDomain(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-hairline bg-canvas px-3 py-2.5 pr-9 text-[14px] outline-none focus:border-accent"
                  >
                    <option value="random">Random domain</option>
                    {domains
                      .filter((entry) => entry.active)
                      .map((entry) => (
                        <option key={entry.domain} value={entry.domain}>
                          {entry.domain}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">
                  Address <span className="font-normal normal-case tracking-normal text-tertiary">· optional</span>
                </span>
                <input
                  value={local}
                  onChange={(event) => setLocal(event.target.value)}
                  placeholder="qa-run"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-[14px] outline-none placeholder:text-tertiary focus:border-accent"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">
                  Lifetime
                </span>
                <div className="relative">
                  <select
                    value={ttl}
                    onChange={(event) => setTtl(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-hairline bg-canvas px-3 py-2.5 pr-9 text-[14px] outline-none focus:border-accent"
                  >
                    {TTL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-secondary" />
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-secondary">
                  Label <span className="font-normal normal-case tracking-normal text-tertiary">· optional</span>
                </span>
                <input
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  placeholder="qa-run-42"
                  className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2.5 text-[14px] outline-none placeholder:text-tertiary focus:border-accent"
                />
              </label>
            </div>

            {error ? <p className="px-1 text-[13px] text-danger">{error}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-4 py-3 text-[15px] font-semibold text-white transition active:scale-[0.99] disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {busy ? "Provisioning…" : "Create mailbox"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function MailboxSheet({
  mailbox,
  onClose,
  onChanged,
  onOpenInbox,
}: {
  mailbox: AdminMailbox;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
  onOpenInbox: (slug: string) => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState(mailbox.label ?? "");
  const [link, setLink] = useState(mailbox.accessUrl);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmKey, setConfirmKey] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revealKey, setRevealKey] = useState(true);

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
      await onChanged();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Action failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const saveLabel = () =>
    run("label", async () => {
      await admin.updateMailbox(mailbox.id, { label: label.trim() || null });
      toast("Label saved");
    });

  const extend = (ttl: number | null) =>
    run("ttl", async () => {
      await admin.updateMailbox(mailbox.id, { ttl });
      const human = ttl === null ? null : ttl >= 86400 ? `${Math.round(ttl / 86400)}d` : `${Math.round(ttl / 3600)}h`;
      toast(ttl === null ? "Expiry cleared" : `Extended by ${human}`);
    });

  const rotate = () =>
    run("rotate", async () => {
      const rotated = await admin.rotateMailboxToken(mailbox.id);
      setLink(rotated.accessUrl);
      setConfirmRotate(false);
      toast("New link issued");
    });

  const rotateKey = () =>
    run("key", async () => {
      const rotated = await admin.rotateMailboxKey(mailbox.id);
      setNewKey(rotated.apiKey);
      setRevealKey(true);
      setConfirmKey(false);
      toast("New API key issued");
    });

  const toggleStatus = () =>
    run("status", async () => {
      const next = mailbox.status === "active" ? "paused" : "active";
      await admin.updateMailbox(mailbox.id, { status: next });
      toast(next === "paused" ? "Mailbox paused" : "Mailbox resumed");
    });

  const remove = () =>
    run("delete", async () => {
      await admin.deleteMailbox(mailbox.id);
      toast("Mailbox deleted");
      onClose();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center animate-fade sm:items-center">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] dark:bg-black/60" onClick={onClose} aria-hidden />
      <div className="relative max-h-[92dvh] w-full max-w-[520px] animate-sheet overflow-y-auto overscroll-contain rounded-t-[28px] border border-hairline bg-surface p-5 pb-safe card-shadow sm:rounded-ios">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <code className="block truncate font-mono text-[15px] font-semibold">{mailbox.address}</code>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-tertiary">
              <span>{mailbox.domain}</span>
              {mailbox.label ? (
                <span className="rounded-full bg-hairline/60 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide">
                  {mailbox.label}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex items-center">
            <CopyButton value={mailbox.address} />
            <IconButton aria-label="Close" onClick={onClose}>
              <X className="size-4" />
            </IconButton>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-hairline bg-canvas px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-tertiary">Messages</div>
            <div className="text-[16px] font-semibold tabular-nums">{mailbox.messageCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-hairline bg-canvas px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-tertiary">Unread</div>
            <div className="text-[16px] font-semibold tabular-nums text-accent">{mailbox.unreadCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-hairline bg-canvas px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-tertiary">Created</div>
            <div className="text-[11.5px] font-medium">{fullDate(mailbox.createdAt)}</div>
          </div>
          <div className="rounded-xl border border-hairline bg-canvas px-3 py-2">
            <div className="text-[10px] uppercase tracking-[0.1em] text-tertiary">Expires</div>
            <div className="text-[11.5px] font-medium">{expiryLabel(mailbox.expiresAt)}</div>
          </div>
        </div>

        <div className="mt-4 flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => onOpenInbox(slugOf(link))}
            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white transition active:scale-[0.99]"
          >
            Open inbox <ArrowUpRight className="size-4" />
          </button>
          <CopyButton value={link} label="Link copied" text="Copy link" className="rounded-xl border border-hairline bg-canvas px-3.5" />
        </div>

        <div className="mt-4 rounded-2xl border border-hairline bg-canvas p-3">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary">Label</div>
          <div className="mt-1.5 flex gap-2">
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="add a label"
              className="min-w-0 flex-1 rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={saveLabel}
              disabled={busy === "label" || label.trim() === (mailbox.label ?? "")}
              className="rounded-lg bg-surface px-3 py-1.5 text-[12px] font-semibold text-accent disabled:opacity-40"
            >
              {busy === "label" ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
            </button>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-hairline bg-canvas p-3">
          <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-secondary">
            <Clock className="size-3.5" /> Lifetime
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={busy === "ttl"}
              onClick={() => extend(86400)}
              className="rounded-lg border border-hairline bg-surface py-1.5 text-[12px] font-medium"
            >
              +24h
            </button>
            <button
              type="button"
              disabled={busy === "ttl"}
              onClick={() => extend(7 * 86400)}
              className="rounded-lg border border-hairline bg-surface py-1.5 text-[12px] font-medium"
            >
              +7d
            </button>
            <button
              type="button"
              disabled={busy === "ttl"}
              onClick={() => extend(null)}
              className="rounded-lg border border-hairline bg-surface py-1.5 text-[12px] font-medium"
            >
              Never
            </button>
          </div>
          <p className="mt-1.5 text-[10.5px] text-tertiary">{expiryLabel(mailbox.expiresAt)}</p>
        </div>

        <div className="mt-3 divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-canvas">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <KeyRound className="size-4 shrink-0 text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium">API key</div>
              <div className="truncate font-mono text-[10.5px] text-tertiary">{mailbox.apiKeyPrefix}…</div>
            </div>
            {confirmKey ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={rotateKey}
                  disabled={busy === "key"}
                  className="rounded-full bg-warning px-2.5 py-1 text-[10.5px] font-semibold text-white"
                >
                  {busy === "key" ? "…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmKey(false)}
                  className="rounded-full px-1.5 py-1 text-[10.5px] text-secondary"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmKey(true)}
                className="rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-semibold text-accent"
              >
                Rotate
              </button>
            )}
          </div>

          {newKey ? (
            <div className="px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-[0.1em] text-tertiary">New key · shown once</div>
              <div className="mt-1 flex items-center gap-1">
                <code className="min-w-0 flex-1 truncate font-mono text-[11.5px]">
                  {revealKey ? newKey : `am_live_${"•".repeat(16)}`}
                </code>
                <button
                  type="button"
                  aria-label={revealKey ? "Hide key" : "Show key"}
                  onClick={() => setRevealKey((value) => !value)}
                  className="rounded-full p-1.5 text-secondary"
                >
                  {revealKey ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <CopyButton value={newKey} label="API key copied" iconClassName="size-3.5" />
              </div>
            </div>
          ) : null}

          <div className="flex items-center gap-2 px-3 py-2.5">
            <Power className={cx("size-4 shrink-0", mailbox.status === "active" ? "text-success" : "text-warning")} />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium">
                {mailbox.status === "active" ? "Receiving" : "Paused"}
              </div>
              <div className="text-[10.5px] text-tertiary">
                {mailbox.status === "active"
                  ? "Inbound mail is accepted and readable"
                  : "Inbound mail is dropped, API and link blocked"}
              </div>
            </div>
            <button
              type="button"
              onClick={toggleStatus}
              disabled={busy === "status"}
              className={cx(
                "rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-semibold",
                mailbox.status === "active" ? "text-warning" : "text-success",
              )}
            >
              {busy === "status" ? "…" : mailbox.status === "active" ? "Pause" : "Resume"}
            </button>
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5">
            <RotateCw className="size-4 shrink-0 text-secondary" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium">Rotate link</div>
              <div className="truncate text-[10.5px] text-tertiary">{slugOf(link)}</div>
            </div>
            {confirmRotate ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={rotate}
                  disabled={busy === "rotate"}
                  className="rounded-full bg-warning px-2.5 py-1 text-[10.5px] font-semibold text-white"
                >
                  {busy === "rotate" ? "…" : "Confirm"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRotate(false)}
                  className="rounded-full px-1.5 py-1 text-[10.5px] text-secondary"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmRotate(true)}
                className="rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-semibold text-accent"
              >
                Rotate
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-2.5">
            <Trash2 className="size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-danger">Delete mailbox</div>
              <div className="text-[10.5px] text-tertiary">Removes every message and attachment</div>
            </div>
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy === "delete"}
                  className="rounded-full bg-danger px-2.5 py-1 text-[10.5px] font-semibold text-white"
                >
                  {busy === "delete" ? "…" : "Delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-full px-1.5 py-1 text-[10.5px] text-secondary"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="rounded-full bg-surface px-2.5 py-1 text-[10.5px] font-semibold text-danger"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({
  onLogin,
  onOpenInbox,
  onHome,
}: {
  onLogin: () => void;
  onOpenInbox: (slug: string) => void;
  onHome: () => void;
}) {
  const toast = useToast();
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [mailboxes, setMailboxes] = useState<AdminMailbox[]>([]);
  const [query, setQuery] = useState("");
  const [domainFilter, setDomainFilter] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<AdminMailbox | null>(null);
  const [domainDraft, setDomainDraft] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);
  const [domainError, setDomainError] = useState<string | null>(null);
  const [confirmDomain, setConfirmDomain] = useState<string | null>(null);
  const [busyDomain, setBusyDomain] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [statsData, domainData, mailboxData] = await Promise.all([
        admin.stats(),
        admin.domains(),
        admin.mailboxes({ limit: 200 }),
      ]);
      setStats(statsData);
      setDomains(domainData.data);
      setMailboxes(mailboxData.data);
      setPhase("ready");
      setError(null);
    } catch (cause) {
      if (isUnauthorized(cause)) {
        onLogin();
        return;
      }
      setError(cause instanceof Error ? cause.message : "Failed to load the dashboard");
      setPhase((previous) => (previous === "loading" ? "error" : previous));
    }
  }, [onLogin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected || phase !== "ready") return;
    const fresh = mailboxes.find((mailbox) => mailbox.id === selected.id);
    if (!fresh) {
      setSelected(null);
      return;
    }
    if (fresh !== selected) setSelected(fresh);
  }, [mailboxes, phase, selected]);

  const refresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), new Promise((resolve) => setTimeout(resolve, 400))]);
    setRefreshing(false);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return mailboxes.filter((mailbox) => {
      if (domainFilter !== "all" && mailbox.domain !== domainFilter) return false;
      if (unreadOnly && (mailbox.unreadCount ?? 0) === 0) return false;
      if (needle === "") return true;
      return (
        mailbox.address.toLowerCase().includes(needle) ||
        (mailbox.label ?? "").toLowerCase().includes(needle)
      );
    });
  }, [mailboxes, query, domainFilter, unreadOnly]);

  const addDomain = async (event: FormEvent) => {
    event.preventDefault();
    if (domainBusy || domainDraft.trim() === "") return;
    setDomainBusy(true);
    setDomainError(null);
    try {
      await admin.addDomain(domainDraft.trim().toLowerCase());
      setDomainDraft("");
      toast("Domain added");
      await load();
    } catch (cause) {
      setDomainError(cause instanceof Error ? cause.message : "Could not add the domain");
    } finally {
      setDomainBusy(false);
    }
  };

  const toggleDomain = async (entry: AdminDomain) => {
    setBusyDomain(entry.domain);
    try {
      await admin.setDomainActive(entry.domain, !entry.active);
      await load();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Update failed", "error");
    } finally {
      setBusyDomain(null);
    }
  };

  const removeDomain = async (domain: string) => {
    setBusyDomain(domain);
    try {
      await admin.removeDomain(domain);
      setConfirmDomain(null);
      toast("Domain removed");
      await load();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Delete failed", "error");
    } finally {
      setBusyDomain(null);
    }
  };

  const logout = async () => {
    try {
      await admin.logout();
    } catch {
      // Clearing the cookie server-side can fail offline; navigate away regardless.
    }
    onLogin();
  };

  const totals = stats?.totals;

  return (
      <div className="dashboard-shell min-h-dvh pb-safe">
      <header className="dashboard-header glass sticky top-0 z-20 border-b border-hairline">
        <div
          className="mx-auto flex max-w-[960px] items-center gap-2 px-4"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.6rem)", paddingBottom: "0.6rem" }}
        >
          <button type="button" onClick={onHome} className="flex items-center gap-2" aria-label="Home">
            <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-white">
              <Mail className="size-4" strokeWidth={2.2} />
            </span>
            <span className="text-[14px] font-semibold tracking-tight">AgentMail</span>
          </button>
          <span className="rounded-full bg-hairline/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-secondary">
            Dashboard
          </span>
          <div className="flex-1" />
          <ThemeToggle />
          <IconButton aria-label="Refresh" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cx("size-4", refreshing && "animate-spin")} />
          </IconButton>
          <IconButton aria-label="Sign out" onClick={logout}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </header>

      <main className="dashboard-main mx-auto w-full max-w-[960px] space-y-4 px-4 py-4">
        <section className="dashboard-intro">
          <div>
            <div className="section-eyebrow"><span className="status-pulse" /> AGENTMAIL / ADMIN</div>
            <h1>Operations overview</h1>
            <p>Manage inbound domains and mailboxes from one place.</p>
          </div>
        </section>
        {phase === "error" ? (
          <div className="rounded-ios border border-danger/30 bg-danger/5 p-4 text-[13px] text-danger">
            {error}
            <button type="button" onClick={() => void load()} className="ml-2 font-semibold underline">
              Retry
            </button>
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <StatCard
            icon={InboxIcon}
            label="Mailboxes"
            value={totals?.mailboxes ?? 0}
            hint={`${domains.filter((entry) => entry.active).length} active domains`}
          />
          <StatCard
            icon={Mail}
            label="Messages"
            value={totals?.messages ?? 0}
            hint={`${totals?.recentMessages ?? 0} in 24h`}
          />
          <StatCard
            icon={MailOpen}
            label="Unread"
            value={totals?.unread ?? 0}
            hint={`${totals?.attachments ?? 0} attachments`}
          />
          <StatCard icon={HardDrive} label="Storage" value={formatBytes(totals?.storedBytes ?? 0)} hint="D1 + R2" />
        </section>

        <section className="rounded-ios border border-hairline bg-surface card-shadow">
          <div className="flex items-center justify-between px-4 pt-4">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
              <Globe className="size-4 text-accent" /> Domains
            </h2>
            <span className="text-[11px] text-tertiary">
              {domains.filter((entry) => entry.active).length}/{domains.length} active
            </span>
          </div>

          <div className="mt-2 divide-y divide-hairline">
            {domains.length === 0 ? (
              <p className="px-4 py-4 text-[12.5px] text-secondary">
                No domain yet. Add one below, then point its Email Routing catch-all at this Worker.
              </p>
            ) : (
              domains.map((entry) => (
                <div key={entry.domain} className="flex items-center gap-2 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13.5px] font-medium">{entry.domain}</div>
                    <div className="text-[11px] text-tertiary">{entry.mailboxes ?? 0} mailboxes</div>
                  </div>
                  {confirmDomain === entry.domain ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void removeDomain(entry.domain)}
                        disabled={busyDomain === entry.domain}
                        className="rounded-full bg-danger px-2.5 py-1 text-[11px] font-semibold text-white"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDomain(null)}
                        className="rounded-full px-2 py-1 text-[11px] text-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={entry.active}
                        aria-label={`${entry.active ? "Deactivate" : "Activate"} ${entry.domain}`}
                        onClick={() => void toggleDomain(entry)}
                        disabled={busyDomain === entry.domain}
                        className={cx(
                          "relative h-6 w-10 shrink-0 rounded-full transition",
                          entry.active ? "bg-success" : "bg-hairline",
                        )}
                      >
                        <span
                          className={cx(
                            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                            entry.active ? "left-[18px]" : "left-0.5",
                          )}
                        />
                      </button>
                      <IconButton
                        aria-label={`Remove ${entry.domain}`}
                        onClick={() => setConfirmDomain(entry.domain)}
                        disabled={(entry.mailboxes ?? 0) > 0}
                        className="text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </IconButton>
                    </>
                  )}
                </div>
              ))
            )}
          </div>

          <form onSubmit={addDomain} className="flex gap-2 border-t border-hairline p-3">
            <input
              value={domainDraft}
              onChange={(event) => setDomainDraft(event.target.value)}
              placeholder="mail.example.com"
              autoCapitalize="none"
              spellCheck={false}
              className="min-w-0 flex-1 rounded-xl border border-hairline bg-canvas px-3 py-2 text-[13px] outline-none placeholder:text-tertiary focus:border-accent"
            />
            <button
              type="submit"
              disabled={domainBusy || domainDraft.trim() === ""}
              className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            >
              {domainBusy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Add
            </button>
          </form>
          {domainError ? <p className="px-4 pb-3 text-[12px] text-danger">{domainError}</p> : null}
        </section>

        <section className="rounded-ios border border-hairline bg-surface card-shadow">
          <div className="flex flex-wrap items-center gap-2 px-4 pt-4">
            <h2 className="flex items-center gap-1.5 text-[15px] font-semibold tracking-tight">
              <InboxIcon className="size-4 text-accent" /> Mailboxes
            </h2>
            <span className="text-[11px] text-tertiary">{mailboxes.length}</span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[12.5px] font-semibold text-white transition active:scale-95"
            >
              <Plus className="size-3.5" /> New mailbox
            </button>
          </div>

          <div className="space-y-2 px-4 py-3">
            <div className="flex items-center gap-2 rounded-xl border border-hairline bg-canvas px-3">
              <Search className="size-3.5 shrink-0 text-tertiary" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search address or label"
                spellCheck={false}
                className="min-w-0 flex-1 bg-transparent py-2 text-[13px] outline-none placeholder:text-tertiary"
              />
              {query ? (
                <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="p-1 text-tertiary">
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative min-w-0 flex-1">
                <select
                  value={domainFilter}
                  onChange={(event) => setDomainFilter(event.target.value)}
                  aria-label="Filter by domain"
                  className="w-full appearance-none rounded-xl border border-hairline bg-canvas px-3 py-1.5 pr-8 text-[12px] outline-none focus:border-accent"
                >
                  <option value="all">All domains</option>
                  {domains.map((entry) => (
                    <option key={entry.domain} value={entry.domain}>
                      {entry.domain}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-secondary" />
              </div>

              <button
                type="button"
                onClick={() => setUnreadOnly((value) => !value)}
                aria-pressed={unreadOnly}
                className={cx(
                  "shrink-0 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition",
                  unreadOnly
                    ? "border-accent/40 bg-accent-soft text-accent"
                    : "border-hairline bg-canvas text-secondary",
                )}
              >
                Unread only
              </button>
            </div>
          </div>

          <div className="divide-y divide-hairline border-t border-hairline">
            {phase === "loading" ? (
              <div className="space-y-2 p-4">
                <div className="skeleton h-4 w-1/2 rounded-full" />
                <div className="skeleton h-3 w-2/3 rounded-full" />
              </div>
            ) : visible.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12.5px] text-secondary">
                {mailboxes.length === 0
                  ? "No mailboxes yet. Create one to start receiving mail."
                  : "No mailbox matches these filters."}
              </p>
            ) : (
              visible.map((mailbox) => {
                const unread = mailbox.unreadCount ?? 0;
                return (
                  <div key={mailbox.id} className="flex items-center gap-2 px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(mailbox)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="flex items-center gap-1">
                        <code className="truncate font-mono text-[12.5px] font-medium">{mailbox.address}</code>
                        {mailbox.label ? (
                          <span className="shrink-0 rounded-full bg-hairline/60 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-secondary">
                            {mailbox.label}
                          </span>
                        ) : null}
                        {mailbox.status !== "active" ? (
                          <span className="shrink-0 rounded-full bg-warning/10 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-wide text-warning">
                            paused
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-tertiary">
                        <span>{mailbox.messageCount ?? 0} messages</span>
                        {unread > 0 ? <span className="font-medium text-accent">· {unread} unread</span> : null}
                        <span>·</span>
                        <span>{mailbox.lastMessageAt ? relativeTime(mailbox.lastMessageAt) : "no mail yet"}</span>
                        <span>·</span>
                        <span>{expiryLabel(mailbox.expiresAt)}</span>
                      </div>
                    </button>

                    <CopyButton value={mailbox.accessUrl} label="Link copied" iconClassName="size-3.5" />
                    <button
                      type="button"
                      onClick={() => setSelected(mailbox)}
                      aria-label={`Manage ${mailbox.address}`}
                      className="rounded-full p-1.5 text-tertiary transition hover:text-label"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </main>

      {creating ? (
        <CreateMailboxSheet
          domains={domains}
          onClose={() => setCreating(false)}
          onCreated={() => {
            void load();
          }}
        />
      ) : null}

      {selected ? (
        <MailboxSheet
          mailbox={selected}
          onClose={() => setSelected(null)}
          onChanged={load}
          onOpenInbox={(slug) => onOpenInbox(slug)}
        />
      ) : null}
    </div>
  );
}
