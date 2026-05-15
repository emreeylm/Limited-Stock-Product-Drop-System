interface Props {
  state: 'idle' | 'loading' | 'reserved' | 'soldout';
  onClick: () => void;
}

const LABEL: Record<Props['state'], string> = {
  idle:     'Reserve Now',
  loading:  '',
  reserved: 'Reserved',
  soldout:  'Sold Out',
};

export function ReserveButton({ state, onClick }: Props) {
  const disabled = state !== 'idle';
  const isSoldOut = state === 'soldout';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="btn-yellow w-full font-mono uppercase tracking-wide2 text-sm flex items-center justify-center select-none"
      style={{
        height: 56,
        backgroundColor: isSoldOut || state === 'reserved' ? '#222222' : '#E8FF00',
        color: isSoldOut || state === 'reserved' ? '#555555' : '#000000',
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {state === 'loading' ? (
        <span
          className="spin inline-block w-4 h-4 border-2 border-black border-t-transparent"
        />
      ) : (
        LABEL[state]
      )}
    </button>
  );
}
