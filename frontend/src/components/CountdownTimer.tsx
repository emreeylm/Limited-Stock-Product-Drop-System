import { useEffect, useRef, useState } from 'react';

interface Props {
  expiresAt: string;
  onExpire?: () => void;
}

function parts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return { h: pad(h), m: pad(m), s: pad(s), total };
}

export function CountdownTimer({ expiresAt, onExpire }: Props) {
  const target = new Date(expiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  const [shakeKey, setShakeKey] = useState(0);
  const lastSec = useRef(-1);

  useEffect(() => {
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const remaining = target - t;
      const sec = Math.floor(remaining / 1000);

      // Shake once per tick when <10s left
      if (sec >= 0 && sec <= 10 && sec !== lastSec.current) {
        lastSec.current = sec;
        setShakeKey((k) => k + 1);
      }

      if (remaining <= 0) {
        window.clearInterval(id);
        onExpire?.();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [target, onExpire]);

  const remaining = target - now;
  const { h, m, s, total } = parts(remaining);
  const crit = total < 60;
  const violent = total <= 10;

  return (
    <div className="border border-line p-4 bg-surface">
      <div className="font-mono text-[10px] uppercase tracking-wide2 text-muted mb-2">
        Reservation expires in
      </div>
      <div
        key={shakeKey}
        className={[
          'font-mono tabular-nums text-4xl md:text-5xl tracking-wider',
          crit ? 'text-bad crit-pulse' : 'text-yellow',
          violent ? 'tick-shake' : '',
        ].join(' ')}
        aria-live="polite"
      >
        {h !== '00' ? `${h} : ${m} : ${s}` : `${m} : ${s}`}
      </div>
    </div>
  );
}
