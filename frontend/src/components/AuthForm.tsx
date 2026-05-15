import { FormEvent, useState } from 'react';
import { api, HttpError, tokenStorage } from '../api/client';
import type { AuthUser } from '../types';

interface Props {
  initialMode?: 'login' | 'register';
  onAuthed: (user: AuthUser) => void;
  onError: (msg: string) => void;
}

export function AuthForm({ initialMode = 'login', onAuthed, onError }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = mode === 'login'
        ? await api.login(email, password)
        : await api.register(email, password);
      tokenStorage.set(res.token);
      onAuthed(res.user);
    } catch (err) {
      const message = err instanceof HttpError ? err.message : 'Auth failed.';
      onError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="border border-line bg-surface p-5 space-y-4">
      <div className="flex font-mono text-[11px] uppercase tracking-wide">
        <button
          type="button"
          onClick={() => setMode('login')}
          className={`relative flex-1 py-2 border transition-colors duration-150 ease-linear ${
            mode === 'login'
              ? 'border-yellow text-yellow bg-ink z-10'
              : 'border-line text-muted hover:text-white'
          }`}
        >
          Login
        </button>
        <button
          type="button"
          onClick={() => setMode('register')}
          className={`relative flex-1 py-2 border -ml-px transition-colors duration-150 ease-linear ${
            mode === 'register'
              ? 'border-yellow text-yellow bg-ink z-10'
              : 'border-line text-muted hover:text-white'
          }`}
        >
          Register
        </button>
      </div>

      <div className="space-y-2">
        <label className="block font-mono text-[10px] uppercase tracking-wide2 text-muted">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-ink border border-line focus:border-yellow outline-none px-3 py-2 font-mono text-sm transition-colors duration-150 ease-linear"
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label className="block font-mono text-[10px] uppercase tracking-wide2 text-muted">Password</label>
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full bg-ink border border-line focus:border-yellow outline-none px-3 py-2 font-mono text-sm transition-colors duration-150 ease-linear"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
        />
      </div>

      <button
        type="submit"
        disabled={busy}
        className="btn-yellow w-full font-mono uppercase tracking-wide2 text-xs flex items-center justify-center"
        style={{
          height: 44,
          backgroundColor: busy ? '#222222' : '#E8FF00',
          color: busy ? '#555555' : '#000000',
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? (
          <span className="spin inline-block w-3 h-3 border-2 border-muted border-t-transparent" />
        ) : mode === 'login' ? 'Sign In' : 'Create Account'}
      </button>
    </form>
  );
}
