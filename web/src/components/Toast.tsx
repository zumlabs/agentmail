import { AlertCircle, Check } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "default" | "error";

interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

type PushToast = (message: string, tone?: Tone) => void;

const ToastContext = createContext<PushToast>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const push = useCallback<PushToast>((message, tone = "default") => {
    counter.current += 1;
    const id = counter.current;
    setItems((previous) => [...previous.slice(-2), { id, message, tone }]);
    setTimeout(() => setItems((previous) => previous.filter((item) => item.id !== id)), 2400);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className="animate-toast glass card-shadow flex items-center gap-2 rounded-full border border-hairline px-4 py-2.5 text-[13px] font-medium"
          >
            {item.tone === "error" ? (
              <AlertCircle className="size-4 text-danger" />
            ) : (
              <Check className="size-4 text-success" />
            )}
            <span className="max-w-[70vw] truncate">{item.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): PushToast {
  return useContext(ToastContext);
}
