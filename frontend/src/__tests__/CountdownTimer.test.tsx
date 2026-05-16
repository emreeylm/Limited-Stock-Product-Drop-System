import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CountdownTimer } from '../components/CountdownTimer';

describe('CountdownTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function expiresInMs(ms: number) {
    return new Date(Date.now() + ms).toISOString();
  }

  it('renders remaining time in MM : SS format', () => {
    render(<CountdownTimer expiresAt={expiresInMs(5 * 60_000)} />);
    
    const el = document.querySelector('[aria-live="polite"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toMatch(/\d{2}\s*:\s*\d{2}/);
  });

  it('shows hours when remaining time exceeds 1 hour', () => {
    render(<CountdownTimer expiresAt={expiresInMs(90 * 60_000)} />);
    
    const el = document.querySelector('[aria-live="polite"]');
    expect(el?.textContent).toMatch(/\d{2}\s*:\s*\d{2}\s*:\s*\d{2}/);
  });

  it('hides hours when remaining time is under 1 hour', () => {
    render(<CountdownTimer expiresAt={expiresInMs(5 * 60_000)} />);
    const el = document.querySelector('[aria-live="polite"]');
    
    const colons = (el?.textContent?.match(/:/g) ?? []).length;
    expect(colons).toBe(1);
  });

  it('calls onExpire when the timer reaches zero', () => {
    const onExpire = vi.fn();
    render(<CountdownTimer expiresAt={expiresInMs(500)} onExpire={onExpire} />);

    expect(onExpire).not.toHaveBeenCalled();

    
    act(() => { vi.advanceTimersByTime(1000); });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not call onExpire before expiry', () => {
    const onExpire = vi.fn();
    render(<CountdownTimer expiresAt={expiresInMs(10_000)} onExpire={onExpire} />);

    act(() => { vi.advanceTimersByTime(5_000); });

    expect(onExpire).not.toHaveBeenCalled();
  });

  it('shows 00 : 00 when expiresAt is already in the past', () => {
    render(<CountdownTimer expiresAt={expiresInMs(-5000)} />);
    const el = document.querySelector('[aria-live="polite"]');
    expect(el?.textContent).toContain('00');
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(window, 'clearInterval');
    const { unmount } = render(<CountdownTimer expiresAt={expiresInMs(60_000)} />);

    unmount();

    expect(clearSpy).toHaveBeenCalled();
  });
});
