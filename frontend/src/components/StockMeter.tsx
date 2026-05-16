import { useEffect, useRef, useState } from 'react';

interface Props {
  remaining: number;
  total: number;
  segments?: number;
}

export function StockMeter({ remaining, total, segments = 20 }: Props) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const lit = Math.ceil(ratio * segments);

  const [flipKey, setFlipKey] = useState(0);
  const prev = useRef(remaining);
  useEffect(() => {
    if (prev.current !== remaining) {
      setFlipKey((k) => k + 1);
      prev.current = remaining;
    }
  }, [remaining]);

  const gone = remaining <= 0;

  return (
    <div className="space-y-2">
      <div className="flex gap-[3px]" aria-label="Stock meter">
        {Array.from({ length: segments }).map((_, i) => {
          
          
          const filled = segments - i <= lit;
          return (
            <span
              key={i}
              className="h-3 flex-1"
              style={{ backgroundColor: filled ? '#E8FF00' : '#222222' }}
            />
          );
        })}
      </div>
      <div className="flex items-baseline justify-between font-mono text-xs uppercase tracking-wide">
        <span className="overflow-hidden inline-block">
          <span key={flipKey} className="inline-block odo-flip tabular-nums">
            <span className={gone ? 'text-bad' : 'text-white'}>{remaining}</span>
            <span className="text-muted"> / {total} remaining</span>
          </span>
        </span>
        {gone && <span className="text-bad">Gone.</span>}
      </div>
    </div>
  );
}
