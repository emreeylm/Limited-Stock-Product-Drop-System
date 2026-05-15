import { useEffect, useMemo, useState } from 'react';
import { useProduct } from '../hooks/useProduct';
import { StockMeter } from './StockMeter';
import { CountdownTimer } from './CountdownTimer';
import { ReserveButton } from './ReserveButton';
import { Breadcrumb } from './Breadcrumb';
import { api, HttpError } from '../api/client';
import { reservationStorage } from '../lib/reservationStorage';
import type { AuthUser, Reservation } from '../types';

interface Props {
  productId: string;
  user: AuthUser | null;
  onRequireAuth: () => void;
  pushToast: (kind: 'success' | 'error' | 'info', message: string) => void;
  onOpenCart: () => void;
}

export function DropPage({
  productId, user, onRequireAuth, pushToast, onOpenCart,
}: Props) {
  const state = useProduct(productId, 5000);
  const product = state.product;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [reserving, setReserving]     = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);

  // Hydrate from local cache when we know the user and product.
  // Backend remains authoritative — cache is silently invalidated on TTL,
  // and any stale id will fail checkout with 410/404 (handled below).
  useEffect(() => {
    if (!user) { setReservation(null); return; }
    const cached = reservationStorage.get(user.id, productId);
    setReservation(cached);
  }, [user, productId]);

  // Meter total comes straight from the server snapshot — accurate regardless
  // of when the client arrives in the drop's lifecycle.
  const total = product?.initialStock ?? 0;

  // Quantity selector (1..min(10, stock)). Reset to 1 when product changes.
  const [quantity, setQuantity] = useState(1);
  useEffect(() => { setQuantity(1); }, [productId]);
  const maxQuantity = Math.min(10, Math.max(1, product?.stock ?? 1));

  const onReserve = async () => {
    if (!product) return;
    if (!user) { onRequireAuth(); return; }
    const q = Math.min(quantity, product.stock);
    if (q <= 0) return;
    setReserving(true);
    try {
      const { reservation: r } = await api.reserve(product.id, q);
      setReservation(r);
      reservationStorage.set(user.id, product.id, r);
      pushToast('success', q === 1 ? 'Reserved.' : `Reserved ×${q}.`);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'INSUFFICIENT_STOCK') {
        pushToast('error', 'Gone.');
      } else if (err instanceof HttpError && err.code === 'DUPLICATE_RESERVATION') {
        const d = err.details as { reservationId: string; expiresAt: string } | undefined;
        if (d?.reservationId) {
          const r: Reservation = {
            id: d.reservationId,
            userId: user.id,
            productId: product.id,
            quantity: q,
            status: 'PENDING',
            expiresAt: d.expiresAt,
            createdAt: new Date().toISOString(),
          };
          setReservation(r);
          reservationStorage.set(user.id, product.id, r);
        }
        pushToast('info', 'You already have an active hold.');
      } else {
        pushToast('error', err instanceof HttpError ? err.message : 'Failed.');
      }
    } finally {
      setReserving(false);
    }
  };

  const onCheckout = async () => {
    if (!reservation || !user) return;
    setCheckingOut(true);
    try {
      const res = await api.checkout(reservation.id);
      reservationStorage.clear(user.id, reservation.productId);
      setReservation(null);
      pushToast('success', `Order ${res.order.id.slice(0, 6)}. Locked in.`);
    } catch (err) {
      // 410 GONE or 404 NOT_FOUND => stale cached reservation; drop it so the UI recovers.
      if (err instanceof HttpError && (err.status === 410 || err.status === 404)) {
        reservationStorage.clear(user.id, reservation.productId);
        setReservation(null);
      }
      pushToast('error', err instanceof HttpError ? err.message : 'Failed.');
    } finally {
      setCheckingOut(false);
    }
  };

  const onExpired = () => {
    if (user && reservation) reservationStorage.clear(user.id, reservation.productId);
    setReservation(null);
    pushToast('info', 'Expired. Stock returned.');
  };

  const reserveState: 'idle' | 'loading' | 'reserved' | 'soldout' = useMemo(() => {
    if (reserving) return 'loading';
    if (reservation) return 'reserved';
    if (!product || product.stock <= 0) return 'soldout';
    return 'idle';
  }, [reserving, reservation, product]);

  const lastUpdated = state.status === 'ready' ? new Date(state.lastUpdated) : null;

  return (
    <div className="min-h-screen bg-ink text-white">
      <div className="pt-9 min-h-screen flex">
        {/* LEFT 55% */}
        <section className="relative hidden md:block w-[55%] border-r border-line overflow-hidden">
          <div className="absolute inset-0 reveal" style={{ animationDelay: '0ms' }}>
            <ProductCanvas name={product?.name ?? ''} imageUrl={product?.imageUrl} />
          </div>
          <div className="pointer-events-none absolute inset-0 scanlines" />
          <div className="pointer-events-none absolute inset-0 noise" />

          <div className="absolute left-4 top-12 font-mono text-[10px] uppercase tracking-wide2 text-yellow reveal" style={{ animationDelay: '80ms' }}>
            // Unit 01
          </div>
          <div className="absolute left-4 bottom-4 font-mono text-[10px] uppercase tracking-wide2 text-muted reveal" style={{ animationDelay: '160ms' }}>
            {lastUpdated && `Sync ${lastUpdated.toLocaleTimeString('en-GB')}`}
          </div>
          <div className="absolute right-4 bottom-4 font-mono text-[10px] uppercase tracking-wide2 text-muted reveal" style={{ animationDelay: '160ms' }}>
            Dropzone / 2026
          </div>
        </section>

        {/* RIGHT 45% */}
        <section className="w-full md:w-[45%] p-6 md:p-10 flex flex-col gap-6">
          {state.status === 'loading' && !product && (
            <div className="font-mono text-xs text-muted uppercase tracking-wide2 reveal">
              Connecting…
            </div>
          )}

          {state.status === 'error' && !product && (
            <div className="border-l-[3px] border-bad bg-surface px-4 py-3 font-mono text-xs uppercase text-white/85 reveal">
              {state.error}
            </div>
          )}

          {product && (
            <>
              <div className="reveal" style={{ animationDelay: '40ms' }}>
                <Breadcrumb crumbs={[
                  { label: `drop-${product.id.slice(0, 6).toLowerCase()}` },
                ]} />
              </div>

              <div className="reveal" style={{ animationDelay: '80ms' }}>
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-[10px] uppercase tracking-wide2 text-yellow border border-yellow/40 px-2 py-0.5">
                    Drop
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-wide2 text-muted">
                    {product.id.slice(0, 6).toUpperCase()}
                  </span>
                </div>
                <h1 className="font-head text-5xl md:text-6xl leading-none uppercase">
                  {product.name}
                </h1>
                <p className="mt-3 text-sm text-white/70 max-w-lg leading-relaxed">{product.description}</p>
              </div>

              <div className="reveal flex items-baseline justify-between gap-3 border-b border-line pb-4" style={{ animationDelay: '160ms' }}>
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-wide2 text-muted">Price</span>
                  <span className="font-mono text-2xl text-yellow tabular-nums">${product.price}</span>
                </div>
                {lastUpdated && (
                  <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 bg-good dot-pulse" />
                    <span>Sync {lastUpdated.toLocaleTimeString('en-GB')}</span>
                  </div>
                )}
              </div>

              <div className="reveal mt-6" style={{ animationDelay: '200ms' }}>
                <div className="mb-2 flex justify-between items-end">
                  <h4 className="font-mono text-[10px] uppercase tracking-wide2 text-yellow">// inventory status</h4>
                </div>
                <StockMeter remaining={product.stock} total={total} />
              </div>

              {!reservation && product.stock > 0 && (
                <div className="reveal flex items-center justify-between gap-3 mt-4" style={{ animationDelay: '300ms' }}>
                  <span className="font-mono text-[10px] uppercase tracking-wide2 text-muted">Quantity</span>
                  <div className="flex items-center font-mono text-sm">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1 || reserving}
                      aria-label="Decrease quantity"
                      className="w-9 h-9 border border-line hover:border-yellow hover:text-yellow disabled:opacity-30 disabled:hover:border-line disabled:hover:text-white transition-colors duration-150 ease-linear"
                    >
                      −
                    </button>
                    <span className="w-12 h-9 border-y border-line flex items-center justify-center tabular-nums">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                      disabled={quantity >= maxQuantity || reserving}
                      aria-label="Increase quantity"
                      className="w-9 h-9 border border-line hover:border-yellow hover:text-yellow disabled:opacity-30 disabled:hover:border-line disabled:hover:text-white transition-colors duration-150 ease-linear"
                    >
                      +
                    </button>
                    <span className="ml-3 text-muted text-[10px] uppercase tracking-wide2 tabular-nums">
                      max {maxQuantity}
                    </span>
                  </div>
                </div>
              )}

              <div className="reveal mt-8" style={{ animationDelay: '320ms' }}>
                <ReserveButton state={reserveState} onClick={onReserve} />
              </div>

              {reservation && (
                <div className="reveal space-y-3">
                  <CountdownTimer expiresAt={reservation.expiresAt} onExpire={onExpired} />
                  <button
                    onClick={onCheckout}
                    disabled={checkingOut}
                    className="w-full h-12 border border-yellow text-yellow font-mono uppercase tracking-wide2 text-xs hover:bg-yellow hover:text-black transition-colors duration-150 ease-linear disabled:border-line disabled:text-muted disabled:hover:bg-transparent flex items-center justify-center"
                  >
                    {checkingOut ? <span className="spin inline-block w-3 h-3 border-2 border-yellow border-t-transparent" /> : 'Checkout'}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      <footer className="border-t border-line px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-2 font-mono text-[11px] uppercase tracking-wide text-muted">
        <span>Dropzone · 2026</span>
        <span>Node.js · Prisma · PostgreSQL · React</span>
      </footer>
    </div>
  );
}

// Local fallback image for the product if not provided by backend.
const PRODUCT_IMAGE_URL = '/product-image.png';

function ProductCanvas({ name, imageUrl }: { name: string; imageUrl?: string }) {
  const initial = name.trim().charAt(0).toUpperCase() || '◼';
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="absolute inset-0 bg-ink flex items-center justify-center overflow-hidden">
      {/* Crosshair guides */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-line" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-line" />
        <div className="absolute left-8 top-8 w-3 h-px bg-yellow" />
        <div className="absolute left-8 top-8 h-3 w-px bg-yellow" />
        <div className="absolute right-8 bottom-8 w-3 h-px bg-yellow" />
        <div className="absolute right-8 bottom-8 h-3 w-px bg-yellow" />
      </div>

      {imgFailed ? (
        // Fallback when the image can't be reached — keeps the page intact.
        <div className="relative">
          <div
            className="font-head text-white/90 select-none"
            style={{
              fontSize: 'clamp(12rem, 28vw, 26rem)',
              lineHeight: 0.8,
              letterSpacing: '-0.04em',
              textShadow: '0 0 60px rgba(232,255,0,0.18)',
            }}
          >
            {initial}
          </div>
        </div>
      ) : (
        <img
          src={imageUrl || PRODUCT_IMAGE_URL}
          alt={name}
          onError={() => setImgFailed(true)}
          className="relative max-w-[78%] max-h-[78%] object-contain select-none pointer-events-none"
          draggable={false}
          style={{
            // Soft yellow glow tying the subject to the brand colour
            boxShadow: '0 0 120px 0 rgba(232,255,0,0.08)',
          }}
        />
      )}

      {/* Caption pinned to bottom */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-wide2 text-muted whitespace-nowrap">
        Scarcity is the product.
      </div>
    </div>
  );
}
