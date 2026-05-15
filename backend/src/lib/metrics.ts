type Counter = { value: number };

const counters: Record<string, Counter> = {
  http_requests_total:      { value: 0 },
  http_errors_total:        { value: 0 },
  reservations_created:     { value: 0 },
  reservations_completed:   { value: 0 },
  reservations_expired:     { value: 0 },
  oversell_attempts_blocked:{ value: 0 },
};

export function inc(name: keyof typeof counters, by = 1) {
  counters[name]!.value += by;
}

export function snapshot() {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(counters)) out[k] = v.value;
  return out;
}

export const startedAt = Date.now();
