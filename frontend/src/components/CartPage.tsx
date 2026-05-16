import { useState } from 'react';
import { useReservations, type ReservationsState } from '../hooks/useReservations';
import { Breadcrumb } from './Breadcrumb';
import { CountdownTimer } from './CountdownTimer';
import { api, HttpError } from '../api/client';
import { reservationStorage } from '../lib/reservationStorage';
import type { AuthUser, ReservationWithProduct } from '../types';

interface Props {
  user: AuthUser | null;
  onBack: () => void;
  onOpenDrop: () => void;

  onRequireAuth: () => void;
  pushToast: (kind: 'success' | 'error' | 'info', message: string) => void;
}

export function CartPage({ user, onBack, onOpenDrop, onRequireAuth, pushToast }: Props) {
  const state = useReservations(user, 5000);

  return (
    <div className="min-h-screen bg-ink text-white">
      <button
        onClick={onBack}
        className="fixed top-12 left-4 z-40 group border border-line bg-ink hover:border-yellow text-white hover:text-yellow px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide2 transition-colors duration-150 ease-linear flex items-center gap-2"
      >
        <span className="text-yellow group-hover:translate-x-[-2px] transition-transform duration-150 ease-linear">←</span>
        Drop
      </button>

      <div className="pt-20 px-6 md:px-10 max-w-4xl mx-auto pb-16">
        <div className="mb-4 reveal" style={{ animationDelay: '0ms' }}>
          <Breadcrumb crumbs={[
            { label: 'drop', onClick: onBack },
            { label: 'cart' },
          ]} />
        </div>

        <header className="mb-8 reveal" style={{ animationDelay: '60ms' }}>
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="font-mono text-[10px] uppercase tracking-wide2 text-yellow border border-yellow/40 px-2 py-0.5">Cart</span>
                <span className="font-mono text-[10px] uppercase tracking-wide2 text-muted">Active holds</span>
              </div>
              <h1 className="font-head text-5xl md:text-6xl uppercase leading-none">Your Reservations</h1>
            </div>
            {state.status === 'ready' && (
              <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted flex items-center gap-2">
                <span className="inline-block w-1.5 h-1.5 bg-good dot-pulse" />
                <span>Sync {new Date(state.lastUpdated).toLocaleTimeString('en-GB')}</span>
              </div>
            )}
          </div>
        </header>

        <Body state={state} user={user} onBack={onBack} onOpenDrop={onOpenDrop ?? onBack} onRequireAuth={onRequireAuth} pushToast={pushToast} />
      </div>
    </div>
  );
}

function Body({ state, user, onBack, onOpenDrop, onRequireAuth, pushToast }: {
  state: ReservationsState;
  user: AuthUser | null;
  onBack: () => void;
  onOpenDrop: () => void;
  onRequireAuth: () => void;
  pushToast: (kind: 'success' | 'error' | 'info', message: string) => void;
}) {
  if (!user) {
    return (
      <div className="relative border border-line bg-surface p-12 text-center">
        <span className="bracket bracket-tl" />
        <span className="bracket bracket-tr" />
        <span className="bracket bracket-bl" />
        <span className="bracket bracket-br" />
        <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted mb-3">
        <div className="font-head text-3xl uppercase text-white mb-2">Sign in first.</div>
        <p className="font-mono text-[11px] uppercase tracking-wide2 text-muted mb-6">
          Reservations live behind your account.
        </p>
        <button
          onClick={onRequireAuth}
          className="btn-yellow px-8 py-3 bg-yellow text-black font-mono text-xs uppercase tracking-wide2 font-bold"
        >
          Sign in
        </button>
      </div>
    );
  }

  if (state.status === 'loading' && state.reservations.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-28 border border-line bg-surface animate-pulse" />
        ))}
      </div>
    );
  }

  if (state.status === 'error' && state.reservations.length === 0) {
    return (
      <div className="border-l-[3px] border-bad bg-surface px-4 py-3 font-mono text-xs uppercase text-white/85">
        {state.error}
      </div>
    );
  }

  if (state.reservations.length === 0) {
    return (
      <div className="relative border border-line bg-surface p-12 text-center">
        <span className="bracket bracket-tl" />
        <span className="bracket bracket-tr" />
        <span className="bracket bracket-bl" />
        <span className="bracket bracket-br" />
        <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted mb-3">
        <div className="font-head text-3xl uppercase text-white mb-2">No holds.</div>
        <p className="font-mono text-[11px] uppercase tracking-wide2 text-muted mb-6">
          Reserve something before it slips.
        </p>
        <button
          onClick={onBack}
          className="border border-line text-white px-6 py-2 font-mono text-xs uppercase tracking-wide2 hover:border-yellow hover:text-yellow transition-colors duration-150 ease-linear"
        >
          Browse drops →
        </button>
      </div>
    );
  }

  const subtotal = state.reservations.reduce(
    (sum, r) => sum + Number(r.product.price) * r.quantity,
    0,
  );

  return (
    <>
      <ul className="space-y-3">
        {state.reservations.map((r, i) => (
          <li key={r.id} className="reveal" style={{ animationDelay: `${i * 60}ms` }}>
            <ReservationRow
              reservation={r}
              user={user}
              onOpenDrop={onOpenDrop}
              pushToast={pushToast}
            />
          </li>
        ))}
      </ul>

      <div className="mt-6 border-t border-line pt-4 flex items-center justify-between font-mono text-xs uppercase tracking-wide2">
        <span className="text-muted">Subtotal · {state.reservations.length} item{state.reservations.length === 1 ? '' : 's'}</span>
        <span className="text-yellow tabular-nums text-lg">${subtotal.toFixed(2)}</span>
      </div>
    </>
  );
}

function ReservationRow({ reservation, user, onOpenDrop, pushToast }: {
  reservation: ReservationWithProduct;
  user: AuthUser;
  onOpenDrop: () => void;
  pushToast: (kind: 'success' | 'error' | 'info', message: string) => void;
}) {
  const [checkingOut, setCheckingOut] = useState(false);
  
  
  
  const [expired, setExpired] = useState(false);

  const initial = reservation.product.name.trim().charAt(0).toUpperCase() || '·';
  const lineTotal = (Number(reservation.product.price) * reservation.quantity).toFixed(2);

  const onCheckout = async () => {
    setCheckingOut(true);
    try {
      const res = await api.checkout(reservation.id);
      reservationStorage.clear(user.id, reservation.productId);
      pushToast('success', `Order ${res.order.id.slice(0, 6)}. Locked in.`);
    } catch (err) {
      if (err instanceof HttpError && (err.status === 410 || err.status === 404)) {
        reservationStorage.clear(user.id, reservation.productId);
        setExpired(true);
      }
      pushToast('error', err instanceof HttpError ? err.message : 'Failed.');
    } finally {
      setCheckingOut(false);
    }
  };

  const [imgError, setImgError] = useState(false);

  return (
    <article className="relative border border-line bg-surface flex flex-col md:flex-row">
      {}
      <button
        onClick={() => onOpenDrop()}
        className="relative w-full md:w-32 h-32 md:h-auto md:aspect-square border-b md:border-b-0 md:border-r border-line shrink-0 overflow-hidden flex items-center justify-center group"
        aria-label={`Open ${reservation.product.name}`}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line opacity-50" />
          <div className="absolute top-1/2 left-0 right-0 h-px bg-line opacity-50" />
        </div>
        {reservation.product.imageUrl && !imgError ? (
          <img
            src={reservation.product.imageUrl}
            alt={reservation.product.name}
            onError={() => setImgError(true)}
            className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300 ease-in-out relative z-10"
            draggable={false}
          />
        ) : (
          <span
            className="font-head text-white/85 group-hover:text-yellow transition-colors duration-150 ease-linear leading-none select-none relative z-10"
            style={{ fontSize: '4rem', letterSpacing: '-0.04em' }}
          >
            {initial}
          </span>
        )}
        <div className="absolute inset-0 scanlines pointer-events-none" />
        <div className="absolute inset-0 noise pointer-events-none" />
      </button>

      {}
      <div className="flex-1 p-4 flex flex-col md:flex-row md:items-stretch gap-4">
        <div className="flex-1 min-w-0">
          <button
            onClick={() => onOpenDrop()}
            className="text-left group"
          >
            <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted mb-1">
              Drop {reservation.product.id.slice(0, 6).toUpperCase()}
            </div>
            <h3 className="font-head text-2xl uppercase leading-none group-hover:text-yellow transition-colors duration-150 ease-linear truncate">
              {reservation.product.name}
            </h3>
            <p className="mt-1 text-sm text-white/60 line-clamp-2">
              {reservation.product.description}
            </p>
          </button>

          <div className="mt-3 font-mono text-[11px] uppercase tracking-wide2 text-muted flex flex-wrap items-center gap-2">
            <span>Qty <span className="text-white tabular-nums">×{reservation.quantity}</span></span>
            <span className="text-line">·</span>
            <span>Unit <span className="text-white tabular-nums">${reservation.product.price}</span></span>
            <span className="text-line">·</span>
            <span>Line <span className="text-yellow tabular-nums">${lineTotal}</span></span>
          </div>
        </div>

        {}
        <div className="md:w-64 shrink-0 flex flex-col gap-2">
          {expired ? (
            <div className="border border-bad/40 bg-bad/10 text-bad font-mono text-[11px] uppercase tracking-wide2 px-3 py-2 flex items-center justify-center text-center">
              Expired. Refresh.
            </div>
          ) : (
            <CountdownTimer
              expiresAt={reservation.expiresAt}
              onExpire={() => setExpired(true)}
            />
          )}

          <button
            onClick={onCheckout}
            disabled={checkingOut || expired}
            className="h-10 border border-yellow text-yellow font-mono uppercase tracking-wide2 text-xs hover:bg-yellow hover:text-black transition-colors duration-150 ease-linear disabled:border-line disabled:text-muted disabled:hover:bg-transparent disabled:hover:text-muted flex items-center justify-center"
          >
            {checkingOut ? <span className="spin inline-block w-3 h-3 border-2 border-yellow border-t-transparent" /> : 'Checkout'}
          </button>
        </div>
      </div>
    </article>
  );
}
