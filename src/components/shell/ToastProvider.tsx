"use client";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  autoExpires,
  dismissToast,
  pauseTimer,
  pushToast,
  resumeTimer,
  startTimer,
  timeLeft,
  type QueuedToast,
  type ToastTimer,
  type ToastTone,
} from "@/lib/toast/toast";

export type ToastAction =
  { label: string; href: string } | { label: string; run: () => void };

export type ToastOptions = {
  body?: string;
  action?: ToastAction;
  /** Behind a "Details" disclosure, for the full receipt that would crowd the toast. */
  details?: ReactNode;
};

type ToastContent = ToastOptions & { title: string };
type Show = (title: string, options?: ToastOptions) => number;

export type ToastApi = {
  success: Show;
  warning: Show;
  error: Show;
  dismiss: (id: number) => void;
};

// Ids only need to be unique for the life of the page.
let nextToastId = 1;

const ToastContext = createContext<ToastApi | null>(null);

/**
 * The app-wide surface for the outcome of an action whose own surface does not show it. See
 * "Feedback" in `agent-os/standards/components/ux-principles.md` for when to use it.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() must be used inside <ToastProvider>");
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<readonly QueuedToast<ToastContent>[]>([]);

  const dismiss = useCallback((id: number) => {
    setQueue((q) => dismissToast(q, id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const show =
      (tone: ToastTone): Show =>
      (title, options) => {
        const id = nextToastId++;
        setQueue((q) => pushToast(q, { id, tone, content: { title, ...options } }));
        return id;
      };
    return {
      success: show("success"),
      warning: show("warning"),
      error: show("error"),
      dismiss,
    };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastOutlet queue={queue} dismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/**
 * z-40 keeps it above page content and below `ModalShell` (z-50), so a dialog still covers it.
 * On phone the bottom nav is two tap-target rows plus the home-indicator inset and is in flow,
 * so the outlet is lifted clear of it.
 */
function ToastOutlet({
  queue,
  dismiss,
}: {
  queue: readonly QueuedToast<ToastContent>[];
  dismiss: (id: number) => void;
}) {
  if (queue.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(2*var(--tap-target)+env(safe-area-inset-bottom,0px)+0.75rem)] z-40 flex flex-col items-center gap-2 px-3 md:inset-x-auto md:right-4 md:bottom-4 md:items-end md:px-0">
      {queue.map((toast) => (
        <ToastCard key={toast.id} toast={toast} dismiss={dismiss} />
      ))}
    </div>
  );
}

const TONE_STRIPE: Record<ToastTone, string> = {
  success: "border-l-[var(--chart-income)]",
  warning: "border-l-[var(--chart-spend)]",
  error: "border-l-[var(--chart-spend)]",
};

function ToastCard({
  toast,
  dismiss,
}: {
  toast: QueuedToast<ToastContent>;
  dismiss: (id: number) => void;
}) {
  const { id, tone, content } = toast;
  const timer = useRef<ToastTimer | null>(null);
  const handle = useRef<ReturnType<typeof setTimeout> | null>(null);

  const arm = useCallback(() => {
    if (!timer.current) return;
    if (handle.current) clearTimeout(handle.current);
    handle.current = setTimeout(() => dismiss(id), timeLeft(timer.current, Date.now()));
  }, [dismiss, id]);

  useEffect(() => {
    if (!autoExpires(tone)) return;
    timer.current = startTimer(Date.now());
    arm();
    return () => {
      if (handle.current) clearTimeout(handle.current);
    };
  }, [tone, arm]);

  const pause = () => {
    if (!timer.current) return;
    if (handle.current) clearTimeout(handle.current);
    timer.current = pauseTimer(timer.current, Date.now());
  };
  const resume = () => {
    if (!timer.current) return;
    timer.current = resumeTimer(timer.current, Date.now());
    arm();
  };

  const linkClass =
    "underline decoration-rule underline-offset-2 hover:text-ink text-ink-muted";

  return (
    <div
      role={tone === "success" ? "status" : "alert"}
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocus={pause}
      onBlur={resume}
      className={`pointer-events-auto w-full max-w-sm rounded border border-rule border-l-4 bg-surface-raised px-3 py-2 text-[0.8125rem] text-ink shadow-[var(--elev-1)] ${TONE_STRIPE[tone]}`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{content.title}</p>
          {content.body && <p className="mt-0.5 text-ink-muted">{content.body}</p>}
          {content.action && (
            <p className="mt-1">
              {"href" in content.action ? (
                <Link href={content.action.href} className={linkClass}>
                  {content.action.label}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={content.action.run}
                  className={linkClass}
                >
                  {content.action.label}
                </button>
              )}
            </p>
          )}
          {content.details && (
            <details className="mt-1 text-ink-muted">
              <summary className="cursor-pointer">Details</summary>
              <div className="mt-1">{content.details}</div>
            </details>
          )}
        </div>
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss"
          onClick={() => dismiss(id)}
          className="-mr-1 flex min-h-tap min-w-tap flex-none items-center justify-center text-ink-muted hover:text-ink md:min-h-0 md:min-w-0 md:px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}
