import type { AuthUser } from '../types';

interface Props {
  dropLabel: string;
  viewers: number;
  user: AuthUser | null;
  cartCount: number;
  onSignIn: () => void;
  onRegister: () => void;
  onSignOut: () => void;
  onOpenCart: () => void;
}

export function StatusBar({
  dropLabel, viewers, user, cartCount,
  onSignIn, onRegister, onSignOut, onOpenCart,
}: Props) {
  return (
    <div className="fixed top-0 inset-x-0 z-40 h-9 bg-ink border-b border-line">
      <div className="h-full px-4 flex items-center justify-between font-mono text-[11px] tracking-wide uppercase">
        {}
        <div className="flex items-center gap-2 text-yellow min-w-0">
          <span className="inline-block w-1.5 h-1.5 bg-yellow dot-pulse shrink-0" />
          <span>Drop Live</span>
          <span className="text-muted hidden sm:inline">·</span>
          <span className="text-white/70 hidden sm:inline truncate">{dropLabel}</span>
        </div>

        {}
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden md:flex items-center gap-2 text-white/70">
            <span className="inline-block w-1.5 h-1.5 bg-good dot-pulse" />
            <span className="tabular-nums">{viewers.toLocaleString()} watching</span>
          </div>

          <span className="text-line hidden md:inline">|</span>

          {}
          {user && (
            <>
              <button
                onClick={onOpenCart}
                className={`flex items-center gap-1.5 transition-colors duration-150 ease-linear ${
                  cartCount > 0 ? 'text-yellow hover:text-white' : 'text-muted hover:text-white'
                }`}
                aria-label="Open cart"
              >
                <span>Cart</span>
                <span className={`tabular-nums px-1.5 py-px border ${cartCount > 0 ? 'border-yellow text-yellow' : 'border-line text-muted'}`}>
                  {cartCount}
                </span>
              </button>
              <span className="text-line">·</span>
            </>
          )}

          {user ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden sm:inline-block w-1.5 h-1.5 bg-yellow dot-pulse shrink-0" />
              <span className="text-white/70 truncate max-w-[180px] normal-case lowercase">
                {user.email}
              </span>
              <span className="text-line">·</span>
              <button
                onClick={onSignOut}
                className="text-muted hover:text-bad transition-colors duration-150 ease-linear"
              >
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={onSignIn}
                className="text-yellow hover:text-white transition-colors duration-150 ease-linear"
              >
                Sign in
              </button>
              <span className="text-line">·</span>
              <button
                onClick={onRegister}
                className="text-muted hover:text-yellow transition-colors duration-150 ease-linear"
              >
                Register
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
