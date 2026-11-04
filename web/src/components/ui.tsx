import { Check, Copy, Loader2, Trash2 } from "lucide-react";
import {
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { avatarGradient, initials } from "../lib/format";
import { copyToClipboard } from "../lib/clipboard";
import { cx } from "../lib/cx";
import { useToast } from "./Toast";

export function CopyButton({
  value,
  label = "Copied to clipboard",
  className,
  iconClassName = "size-4",
  text,
}: {
  value: string;
  label?: string;
  className?: string;
  iconClassName?: string;
  text?: string;
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      aria-label={text ?? "Copy"}
      onClick={async (event) => {
        event.stopPropagation();
        if (value === "") return;
        await copyToClipboard(value);
        setCopied(true);
        toast(label);
        setTimeout(() => setCopied(false), 1600);
      }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full text-secondary transition-colors hover:text-accent active:scale-95",
        text ? "px-3 py-1.5" : "p-1.5",
        className,
      )}
    >
      {copied ? <Check className={cx(iconClassName, "text-success")} /> : <Copy className={iconClassName} />}
      {text ? <span className="text-[12.5px] font-medium">{copied ? "Copied" : text}</span> : null}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "plain" | "tinted";
  loading?: boolean;
};

export function IconButton({ variant = "plain", loading, className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition active:scale-95 disabled:opacity-40",
        variant === "tinted" ? "bg-accent-soft text-accent" : "text-secondary hover:text-label",
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : children}
    </button>
  );
}

export function Avatar({ name, address, size = 36 }: { name: string | null; address: string; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{
        width: size,
        height: size,
        background: avatarGradient(address || name || "?"),
        fontSize: Math.round(size * 0.34),
      }}
    >
      {initials(name, address)}
    </span>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
}) {
  return (
    <div className="flex rounded-xl bg-segment-track p-1" role="tablist" aria-label="Filter">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[9px] px-3 py-1.5 text-[13px] font-medium transition-all",
              active ? "card-shadow bg-segment-active text-label" : "text-secondary",
            )}
          >
            {option.label}
            {typeof option.count === "number" && option.count > 0 ? (
              <span
                className={cx(
                  "rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
                  active ? "bg-accent-soft text-accent" : "text-tertiary",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-ios border border-hairline bg-surface card-shadow">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex items-start gap-3 border-b border-hairline px-4 py-4 last:border-b-0">
          <div className="skeleton size-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3 w-1/3 rounded-full" />
            <div className="skeleton h-3 w-3/4 rounded-full" />
            <div className="skeleton h-2.5 w-1/2 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** iOS-style swipe-to-delete row: drag left to reveal the delete action. */
export function SwipeRow({
  onDelete,
  onActivate,
  children,
}: {
  onDelete: () => void;
  onActivate: () => void;
  children: ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const suppressClick = useRef(false);

  const endGesture = () => {
    const current = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!current?.active) return;
    suppressClick.current = true;
    setOffset((value) => (value < -48 ? -96 : 0));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    gesture.current = { x: event.clientX, y: event.clientY, base: offset, active: false };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) <= Math.abs(dy)) return;
      current.active = true;
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    setOffset(Math.max(-96, Math.min(0, current.base + dx)));
  };

  return (
    <div className="relative overflow-hidden">
      <button
        type="button"
        aria-label="Delete message"
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        onClick={onDelete}
        className={cx(
          "absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-danger text-white transition-opacity",
          offset < 0 ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <Trash2 className="size-5" />
      </button>
      <div
        className={cx("relative bg-surface", dragging && "select-none")}
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 240ms cubic-bezier(0.32, 0.72, 0, 1)",
          touchAction: "pan-y",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onClick={() => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (offset !== 0) {
            setOffset(0);
            return;
          }
          onActivate();
        }}
      >
        {children}
      </div>
    </div>
  );
}
