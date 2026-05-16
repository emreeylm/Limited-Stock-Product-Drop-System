import { useEffect, useState } from 'react';
import { AuthForm } from './AuthForm';
import type { AuthUser } from '../types';

interface Props {
  open: boolean;
    initialMode?: 'login' | 'register';
  onClose: () => void;
  onAuthed: (user: AuthUser) => void;
  onError: (msg: string) => void;
}

export function AuthModal({ open, initialMode = 'login', onClose, onAuthed, onError }: Props) {
  
  
  const [mountKey, setMountKey] = useState(0);
  useEffect(() => {
    if (open) setMountKey((k) => k + 1);
  }, [open, initialMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onMouseDown={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative w-full max-w-sm slide-up"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {}
        <div className="flex items-center justify-between border border-line border-b-0 bg-surface px-4 py-2">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wide2 text-muted">
            <span className="inline-block w-1.5 h-1.5 bg-yellow dot-pulse" />
            <span>Authenticate</span>
          </div>
          <button
            onClick={onClose}
            className="font-mono text-xs text-muted hover:text-bad transition-colors duration-150 ease-linear"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <AuthForm
          key={mountKey}
          initialMode={initialMode}
          onAuthed={(u) => { onAuthed(u); onClose(); }}
          onError={onError}
        />
      </div>
    </div>
  );
}
