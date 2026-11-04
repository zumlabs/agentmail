import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { copyToClipboard } from "../lib/clipboard";
import { cx } from "../lib/cx";

export function CodeBlock({
  code,
  label,
  className,
}: {
  code: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <div className={cx("min-w-0 max-w-full overflow-hidden rounded-xl border border-white/10 bg-[#0b0b0f]", className)}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <span className="truncate font-mono text-[10px] uppercase tracking-[0.12em] text-white/40">
          {label ?? "code"}
        </span>
        <button
          type="button"
          onClick={async () => {
            await copyToClipboard(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-white/50 transition hover:text-white"
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="max-w-full overflow-x-auto px-3.5 py-3 font-mono text-[11.5px] leading-relaxed text-[#e5e5ea]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export function MethodPill({ method, className }: { method: string; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex w-14 shrink-0 justify-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold",
        method === "GET" && "bg-success/10 text-success",
        method === "POST" && "bg-accent-soft text-accent",
        method === "PATCH" && "bg-warning/10 text-warning",
        method === "DELETE" && "bg-danger/10 text-danger",
        className,
      )}
    >
      {method}
    </span>
  );
}
