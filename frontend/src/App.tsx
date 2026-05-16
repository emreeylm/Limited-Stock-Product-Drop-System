import { useCallback, useEffect, useState } from 'react';
import { DropPage } from './components/DropPage';
import { CartPage } from './components/CartPage';
import { StatusBar } from './components/StatusBar';
import { AuthModal } from './components/AuthModal';
import { Toasts, type ToastData, type ToastKind } from './components/Toast';
import { useReservations } from './hooks/useReservations';
import { api, tokenStorage } from './api/client';
import { decodeJwt } from './lib/jwt';
import { reservationStorage } from './lib/reservationStorage';
import type { AuthUser } from './types';

const DROP_LABEL = '23 Mar 2026 · 14:00 UTC';

type Page = 'drop' | 'cart';

export default function App() {
  const [page, setPage] = useState<Page>('drop');

  
  const [productId, setProductId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    api.products({ limit: 1 })
      .then(({ products }) => {
        const first = products[0];
        if (first) setProductId(first.id);
        else setLoadError(true);
      })
      .catch(() => setLoadError(true));
  }, []);

  const [user, setUser] = useState<AuthUser | null>(() => {
    const t = tokenStorage.get();
    return t ? decodeJwt(t) : null;
  });

  
  const [authModal, setAuthModal] = useState<{ open: boolean; mode: 'login' | 'register' }>({
    open: false, mode: 'login',
  });
  const openAuth  = useCallback((mode: 'login' | 'register') => setAuthModal({ open: true, mode }), []);
  const closeAuth = useCallback(() => setAuthModal((m) => ({ ...m, open: false })), []);

  
  const reservationsState = useReservations(user, 5000);
  const cartCount = reservationsState.reservations.length;

  
  const [viewers, setViewers] = useState(847);
  useEffect(() => {
    const id = window.setInterval(() => {
      setViewers((v) => Math.max(120, v + Math.floor((Math.random() - 0.5) * 8)));
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const pushToast = useCallback((kind: ToastKind, message: string) => {
    setToasts((t) => [...t, { id: Date.now() + Math.random(), kind, message }]);
  }, []);
  const dismissToast = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'auto' }); }, [page]);

  const signOut = useCallback(() => {
    tokenStorage.clear();
    reservationStorage.clearAll();
    setUser(null);
    pushToast('info', 'Signed out.');
  }, [pushToast]);

  return (
    <>
      <StatusBar
        dropLabel={DROP_LABEL}
        viewers={viewers}
        user={user}
        cartCount={cartCount}
        onSignIn={() => openAuth('login')}
        onRegister={() => openAuth('register')}
        onSignOut={signOut}
        onOpenCart={() => setPage('cart')}
      />

      {page === 'drop' && (
        loadError ? (
          <div className="min-h-screen bg-ink text-white flex items-center justify-center">
            <div className="text-center">
              <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted mb-3">
              <div className="font-head text-3xl uppercase mb-2">No product found.</div>
              <p className="font-mono text-[11px] text-muted">Check backend connection.</p>
            </div>
          </div>
        ) : !productId ? (
          <div className="min-h-screen bg-ink text-white flex items-center justify-center">
            <div className="font-mono text-xs text-muted uppercase tracking-wide2">
              Connecting…
            </div>
          </div>
        ) : (
          <DropPage
            productId={productId}
            user={user}
            onRequireAuth={() => openAuth('login')}
            pushToast={pushToast}
            onOpenCart={() => setPage('cart')}
          />
        )
      )}

      {page === 'cart' && (
        <CartPage
          user={user}
          onBack={() => setPage('drop')}
          onOpenDrop={() => setPage('drop')}
          onRequireAuth={() => openAuth('login')}
          pushToast={pushToast}
        />
      )}

      <AuthModal
        open={authModal.open}
        initialMode={authModal.mode}
        onClose={closeAuth}
        onAuthed={(u) => { setUser(u); pushToast('success', 'Signed in.'); }}
        onError={(m) => pushToast('error', m)}
      />

      <Toasts toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
