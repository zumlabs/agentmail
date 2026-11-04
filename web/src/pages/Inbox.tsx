import { ChevronLeft, Inbox as InboxIcon, MailOpen, Paperclip, RefreshCw, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageDetail } from "../components/MessageDetail";
import { ThemeToggle } from "../components/ThemeToggle";
import { useToast } from "../components/Toast";
import { Avatar, CopyButton, IconButton, Segmented, SkeletonList, SwipeRow } from "../components/ui";
import { ApiError, MailboxClient, type MailboxDto, type MessageSummaryDto } from "../lib/api";
import { cx } from "../lib/cx";
import { expiryLabel, relativeTime, sleep } from "../lib/format";

const POLL_MS = 4000;

export function Inbox({ token, onHome }: { token: string; onHome: () => void }) {
  const toast = useToast();
  const client = useMemo(() => new MailboxClient({ token }), [token]);

  const [mailbox, setMailbox] = useState<MailboxDto | null>(null);
  const [messages, setMessages] = useState<MessageSummaryDto[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState(true);
  const [fatal, setFatal] = useState<ApiError | null>(null);
  const [openMessage, setOpenMessage] = useState<MessageSummaryDto | null>(null);

  const load = useCallback(
    async (quiet = false) => {
      try {
        const [mailboxData, list] = await Promise.all([client.mailbox(), client.messages({ limit: 50 })]);
        setMailbox(mailboxData);
        setMessages(list.data);
        setFatal(null);
        setOnline(true);
      } catch (cause) {
        setOnline(false);
        const apiError = cause instanceof ApiError ? cause : new ApiError(0, "network_error", "Network error");
        if (apiError.status === 401 || apiError.status === 404 || apiError.status === 410) setFatal(apiError);
        else if (!quiet) toast(apiError.message, "error");
      } finally {
        setLoading(false);
      }
    },
    [client, toast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(true), sleep(420)]);
    setRefreshing(false);
  };

  const handleSeen = useCallback((id: string) => {
    setMessages((previous) => previous.map((message) => (message.id === id ? { ...message, seen: true } : message)));
  }, []);

  const handleDeleted = useCallback((id: string) => {
    setMessages((previous) => previous.filter((message) => message.id !== id));
    setOpenMessage(null);
  }, []);

  const unreadCount = messages.filter((message) => !message.seen).length;
  const visible = filter === "all" ? messages : messages.filter((message) => !message.seen);
  const address = mailbox?.address ?? "";

  if (fatal) {
    const expired = fatal.status === 410;
    const invalid = fatal.status === 401 || fatal.status === 404;
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-10">
        <div className="w-full max-w-[420px] rounded-ios border border-hairline bg-surface p-6 text-center card-shadow">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <TriangleAlert className="size-6" />
          </span>
          <h1 className="mt-4 text-[19px] font-semibold tracking-tight">
            {expired ? "This mailbox expired" : invalid ? "Link not valid" : "Something went wrong"}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-secondary">
            {expired
              ? "Its messages were purged. Create a new inbox to keep going."
              : invalid
                ? "The access link was rotated or never existed. Ask the owner for a fresh link."
                : fatal.message}
          </p>
          <div className="mt-5 flex flex-col gap-2">
            {!expired && !invalid ? (
              <button
                type="button"
                onClick={() => {
                  setFatal(null);
                  setLoading(true);
                  void load(true);
                }}
                className="rounded-xl bg-accent px-4 py-2.5 text-[14px] font-semibold text-white"
              >
                Try again
              </button>
            ) : null}
            <button
              type="button"
              onClick={onHome}
              className={cx(
                "rounded-xl px-4 py-2.5 text-[14px] font-semibold",
                expired || invalid ? "bg-accent text-white" : "border border-hairline text-secondary",
              )}
            >
              Back to AgentMail
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="inbox-shell flex h-dvh flex-col">
      <header className="inbox-header glass sticky top-0 z-20 border-b border-hairline">
        <div
          className="mx-auto flex max-w-[760px] items-center gap-1 px-2"
          style={{ paddingTop: "max(env(safe-area-inset-top), 0.5rem)" }}
        >
          <button
            type="button"
            onClick={onHome}
            className="flex items-center rounded-full py-2 pl-0.5 pr-2 text-accent transition active:opacity-60"
            aria-label="Back to home"
          >
            <ChevronLeft className="size-6" strokeWidth={2.4} />
            <span className="text-[15px] font-medium">Home</span>
          </button>

          <div className="min-w-0 flex-1 text-center">
            <div className="flex items-center justify-center gap-0.5">
              <span className="truncate font-mono text-[13.5px] font-semibold tracking-tight">
                {address || "Inbox"}
              </span>
              {address ? <CopyButton value={address} label="Address copied" iconClassName="size-3.5" /> : null}
            </div>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-tertiary">
              <span
                className={cx("size-1.5 rounded-full", online ? "bg-success" : "bg-warning")}
                aria-hidden
              />
              <span>{online ? "Live" : "Offline"}</span>
              <span>·</span>
              <span>{expiryLabel(mailbox?.expiresAt ?? null)}</span>
            </div>
          </div>

          <ThemeToggle />
          <IconButton
            aria-label="Refresh"
            onClick={handleRefresh}
            disabled={refreshing}
            className="mr-1"
          >
            <RefreshCw className={cx("size-4", refreshing && "animate-spin")} />
          </IconButton>
        </div>

        <div className="mx-auto max-w-[760px] px-3 pb-2 pt-2">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: messages.length },
              { value: "unread", label: "Unread", count: unreadCount },
            ]}
          />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-[760px] px-3 py-3 pb-safe">
          {loading && messages.length === 0 ? (
            <SkeletonList rows={4} />
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center rounded-ios border border-hairline bg-surface px-6 py-14 text-center card-shadow">
              <div className="relative flex size-16 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                {filter === "unread" && messages.length > 0 ? (
                  <MailOpen className="size-7" />
                ) : (
                  <InboxIcon className="size-7" />
                )}
                <span className="absolute inset-0 -z-10 rounded-2xl bg-accent-soft blur-xl" />
              </div>
              <h2 className="mt-4 text-[16px] font-semibold tracking-tight">
                {filter === "unread" && messages.length > 0 ? "No unread mail" : "Waiting for mail"}
              </h2>
              <p className="mt-1 max-w-[36ch] text-[13px] leading-relaxed text-secondary">
                {filter === "unread" && messages.length > 0
                  ? "Everything in this inbox has been opened."
                  : "Messages appear here within a few seconds. Use the address below anywhere you need a throwaway inbox."}
              </p>
              {address ? (
                <div className="mt-4 flex items-center gap-1 rounded-full border border-hairline bg-canvas px-3 py-1.5">
                  <code className="font-mono text-[12px]">{address}</code>
                  <CopyButton value={address} label="Address copied" iconClassName="size-3.5" />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="divide-y divide-hairline overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
              {visible.map((message) => (
                <SwipeRow
                  key={message.id}
                  onActivate={() => setOpenMessage(message)}
                  onDelete={async () => {
                    try {
                      await client.deleteMessage(message.id);
                      handleDeleted(message.id);
                      toast("Message deleted");
                    } catch (cause) {
                      toast(cause instanceof Error ? cause.message : "Delete failed", "error");
                    }
                  }}
                >
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <div className="pt-0.5">
                      <Avatar name={message.from.name} address={message.from.address} size={40} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className={cx("truncate text-[14.5px]", message.seen ? "text-label" : "font-semibold")}>
                          {message.from.name ?? message.from.address}
                        </span>
                        <span className="ml-auto shrink-0 text-[11.5px] text-tertiary">
                          {relativeTime(message.receivedAt)}
                        </span>
                      </div>
                      <div
                        className={cx(
                          "mt-0.5 truncate text-[13.5px]",
                          message.seen ? "text-secondary" : "font-medium text-label",
                        )}
                      >
                        {message.subject || "(no subject)"}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-tertiary">
                        {message.snippet || "No preview"}
                      </div>
                      {message.hasAttachments ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-secondary">
                          <Paperclip className="size-3" /> {message.attachmentCount} attachment
                          {message.attachmentCount === 1 ? "" : "s"}
                        </div>
                      ) : null}
                    </div>
                    {!message.seen ? (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />
                    ) : null}
                  </div>
                </SwipeRow>
              ))}
            </div>
          )}

          <p className="mt-4 text-center text-[11px] text-tertiary">
            Swipe a message left to delete · refreshes every 4 seconds
          </p>
        </div>
      </main>

      {openMessage ? (
        <MessageDetail
          client={client}
          summary={openMessage}
          onClose={() => setOpenMessage(null)}
          onDeleted={handleDeleted}
          onSeen={handleSeen}
        />
      ) : null}
    </div>
  );
}
