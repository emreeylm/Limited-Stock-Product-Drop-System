import { useEffect } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
}

interface Props {
  toasts: ToastData[];
  dismiss: (id: number) => void;
}

const BORDERS: Record<ToastKind, string> = {
  success: '#00FF88',
  error:   '#FF3B3B',
  info:    '#E8FF00',
};

export function Toasts({ toasts, dismiss }: Props) {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 w-[min(420px,90vw)]">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} dismiss={dismiss} />
      ))}
    </div>
  );
}

function Toast({ toast, dismiss }: { toast: ToastData; dismiss: (id: number) => void }) {
  useEffect(() => {
    const id = window.setTimeout(() => dismiss(toast.id), 3000);
    return () => window.clearTimeout(id);
  }, [toast.id, dismiss]);

  return (
    <div
      role="status"
      className="slide-up bg-surface text-white font-mono text-xs uppercase tracking-wide px-4 py-3 flex items-center justify-between"
      style={{ borderLeft: `3px solid ${BORDERS[toast.kind]}` }}
    >
      <span className="text-white/85">{toast.message}</span>
      <button
        onClick={() => dismiss(toast.id)}
        className="text-muted hover:text-white transition-colors duration-150 ease-linear"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
