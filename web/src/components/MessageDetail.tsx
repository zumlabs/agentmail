import {
  Check,
  ChevronLeft,
  Download,
  ExternalLink,
  FileText,
  ImageOff,
  Loader2,
  Paperclip,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { ApiError, AttachmentDto, MailboxClient, MailIntent, MessageDetailDto, MessageSummaryDto } from "../lib/api";
import { cx } from "../lib/cx";
import { formatBytes, fullDate, hostOf, truncateMiddle } from "../lib/format";
import { hasRemoteImages, MessageBody } from "./MessageBody";
import { useToast } from "./Toast";
import { Avatar, CopyButton, IconButton, Segmented } from "./ui";

type ViewMode = "html" | "text";

const INTENT_LABELS: Record<MailIntent, string> = {
  verification: "Verification",
  password_reset: "Password reset",
  receipt: "Receipt",
  newsletter: "Newsletter",
  notification: "Notification",
  other: "Other",
};

function AuthChip({ label, value }: { label: string; value: string | null }) {
  const ok = value === "pass";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        ok ? "bg-success/10 text-success" : "bg-hairline/60 text-secondary",
      )}
    >
      {ok ? <Check className="size-3" /> : null}
      {label}
    </span>
  );
}

function AttachmentChip({
  attachment,
  client,
}: {
  attachment: AttachmentDto;
  client: MailboxClient;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        setBusy(true);
        try {
          await client.downloadAttachment(attachment);
        } catch (error) {
          toast(error instanceof Error ? error.message : "Download failed", "error");
        } finally {
          setBusy(false);
        }
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-hairline bg-surface px-3 py-2.5 text-left transition hover:border-accent/40"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
        <FileText className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{attachment.filename ?? "attachment"}</span>
        <span className="block text-[11px] text-secondary">
          {attachment.mime ?? "file"} · {formatBytes(attachment.size)}
        </span>
      </span>
      {busy ? <Loader2 className="size-4 animate-spin text-secondary" /> : <Download className="size-4 text-secondary" />}
    </button>
  );
}

export function MessageDetail({
  client,
  summary,
  onClose,
  onDeleted,
  onSeen,
}: {
  client: MailboxClient;
  summary: MessageSummaryDto;
  onClose: () => void;
  onDeleted: (id: string) => void;
  onSeen: (id: string) => void;
}) {
  const toast = useToast();
  const [detail, setDetail] = useState<MessageDetailDto | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [view, setView] = useState<ViewMode>("html");
  const [allowImages, setAllowImages] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    client
      .message(summary.id)
      .then((payload) => {
        if (cancelled) return;
        setDetail(payload);
        if (!payload.html) setView("text");
      })
      .catch((cause: ApiError) => {
        if (!cancelled) setError(cause);
      });
    client
      .markSeen(summary.id)
      .then(() => onSeen(summary.id))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, summary.id, onSeen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const blockedImages = useMemo(
    () => !allowImages && hasRemoteImages(detail?.html ?? null),
    [allowImages, detail?.html],
  );

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await client.deleteMessage(summary.id);
      toast("Message deleted");
      onDeleted(summary.id);
      onClose();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Delete failed", "error");
      setDeleting(false);
    }
  };

  const orderedLinks = useMemo(() => {
    if (!detail) return [];
    const primary = detail.extracted.primaryLink;
    const urls: string[] = [];
    const seen = new Set<string>();
    if (primary) {
      urls.push(primary);
      seen.add(primary);
    }
    for (const url of detail.extracted.links) {
      if (seen.has(url)) continue;
      urls.push(url);
      seen.add(url);
    }
    return urls.slice(0, 8).map((url) => ({
      url,
      primary: url === primary,
      title: url === primary && detail.extracted.actionText ? detail.extracted.actionText : hostOf(url),
    }));
  }, [detail]);

  const sender = detail?.from ?? summary.from;
  const subject = detail?.subject ?? summary.subject;
  const receivedAt = detail?.receivedAt ?? summary.receivedAt;

  return createPortal(
    <div className="fixed inset-0 z-50 animate-fade" role="dialog" aria-modal="true" aria-label={subject || "Message"}>
      <div className="absolute inset-0 bg-black/25 dark:bg-black/60" onClick={onClose} aria-hidden />
      <div className="animate-sheet relative mx-auto flex h-dvh w-full max-w-[760px] flex-col border-x border-hairline bg-canvas sm:shadow-2xl">
        <header className="glass z-10 border-b border-hairline">
          <div className="flex items-center gap-1 px-2" style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center rounded-full py-2 pl-0.5 pr-2 text-accent transition active:opacity-60"
            >
              <ChevronLeft className="size-6" strokeWidth={2.4} />
              <span className="text-[15px] font-medium">Inbox</span>
            </button>
            <div className="flex-1" />
            <IconButton
              aria-label="Download raw message"
              onClick={async () => {
                try {
                  await client.downloadRaw(summary.id, subject);
                } catch (cause) {
                  toast(cause instanceof Error ? cause.message : "Download failed", "error");
                }
              }}
            >
              <Download className="size-4" />
            </IconButton>
            <IconButton aria-label="Delete message" onClick={handleDelete} disabled={deleting} className="text-danger">
              {deleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            </IconButton>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto w-full max-w-[680px] space-y-4 px-4 py-4 pb-safe">
            <div className="flex items-start gap-3">
              <Avatar name={sender.name} address={sender.address} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[15px] font-semibold">{sender.name ?? sender.address}</span>
                  <span className="ml-auto shrink-0 text-[12px] text-tertiary">{fullDate(receivedAt)}</span>
                </div>
                <div className="truncate text-[13px] text-secondary">{sender.address}</div>
                {detail && detail.to.length > 0 ? (
                  <div className="mt-0.5 truncate text-[12px] text-tertiary">to {detail.to.map((entry) => entry.address).join(", ")}</div>
                ) : null}
              </div>
            </div>

            <div>
              <h1 className="text-[22px] font-semibold leading-snug tracking-tight">{subject || "(no subject)"}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {detail?.extracted.intent && detail.extracted.intent !== "other" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent">
                    <Sparkles className="size-3" /> {INTENT_LABELS[detail.extracted.intent]}
                  </span>
                ) : null}
                <AuthChip label="SPF" value={detail?.authentication.spf ?? null} />
                <AuthChip label="DKIM" value={detail?.authentication.dkim ?? null} />
                <AuthChip label="DMARC" value={detail?.authentication.dmarc ?? null} />
                <span className="inline-flex items-center gap-1 rounded-full bg-hairline/60 px-2 py-0.5 text-[11px] text-secondary">
                  <ShieldCheck className="size-3" /> {formatBytes(detail?.size ?? summary.size)}
                </span>
              </div>
            </div>

            {detail && detail.extracted.otp.length > 0 ? (
              <div className="rounded-ios border border-accent/25 bg-accent-soft p-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-accent">Verification code</div>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  {detail.extracted.otp.map((code) => (
                    <div key={code} className="flex items-center gap-2 rounded-xl bg-surface px-3 py-2 card-shadow">
                      <span className="font-mono text-[22px] font-semibold tracking-[0.12em]">{code}</span>
                      <CopyButton value={code} label="Code copied" />
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
              {detail?.html && detail.text ? (
                <div className="border-b border-hairline px-3 py-2">
                  <Segmented
                    value={view}
                    onChange={setView}
                    options={[
                      { value: "html", label: "Formatted" },
                      { value: "text", label: "Plain text" },
                    ]}
                  />
                </div>
              ) : null}

              <div className={cx("px-4 py-4", view === "html" && detail?.html ? "email-surface" : "")}>
                {error ? (
                  <div className="py-6 text-center">
                    <p className="text-[14px] text-secondary">{error.message}</p>
                    <button
                      type="button"
                      onClick={onClose}
                      className="mt-3 rounded-full bg-accent px-4 py-2 text-[13px] font-medium text-white"
                    >
                      Back to inbox
                    </button>
                  </div>
                ) : !detail ? (
                  <div className="space-y-2.5 py-2">
                    <div className="skeleton h-3 w-3/4 rounded-full" />
                    <div className="skeleton h-3 w-full rounded-full" />
                    <div className="skeleton h-3 w-5/6 rounded-full" />
                    <div className="skeleton h-3 w-2/3 rounded-full" />
                  </div>
                ) : view === "html" && detail.html ? (
                  <MessageBody html={detail.html} allowImages={allowImages} />
                ) : (
                  <pre className="whitespace-pre-wrap break-words font-sans text-[15px] leading-relaxed text-label">
                    {detail.text ?? "(no text content)"}
                  </pre>
                )}
              </div>

              {blockedImages ? (
                <button
                  type="button"
                  onClick={() => setAllowImages(true)}
                  className="flex w-full items-center justify-center gap-2 border-t border-hairline px-4 py-3 text-[13px] font-medium text-accent transition hover:bg-accent-soft"
                >
                  <ImageOff className="size-4" /> Remote images blocked · Load images
                </button>
              ) : null}
            </div>

            {detail && detail.attachments.length > 0 ? (
              <section className="space-y-2">
                <h2 className="flex items-center gap-1.5 px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-secondary">
                  <Paperclip className="size-3.5" /> {detail.attachments.length} attachment
                  {detail.attachments.length === 1 ? "" : "s"}
                </h2>
                <div className="space-y-2">
                  {detail.attachments.map((attachment) => (
                    <AttachmentChip key={attachment.id} attachment={attachment} client={client} />
                  ))}
                </div>
              </section>
            ) : null}

            {detail && detail.extracted.links.length > 0 ? (
              <section className="space-y-2">
                <h2 className="px-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-secondary">Links</h2>
                <div className="divide-y divide-hairline overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
                  {orderedLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="flex items-center gap-2 px-4 py-3 transition hover:bg-accent-soft/40"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-accent">{link.title}</span>
                        <span className="block truncate text-[12px] text-tertiary">
                          {link.primary && detail?.extracted.actionText
                            ? hostOf(link.url)
                            : truncateMiddle(link.url, 56)}
                        </span>
                      </span>
                      <ExternalLink className="size-4 shrink-0 text-tertiary" />
                    </a>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
