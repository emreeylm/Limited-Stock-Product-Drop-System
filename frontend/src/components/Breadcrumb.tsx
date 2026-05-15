interface Crumb {
  label: string;
  onClick?: () => void;
}

interface Props {
  crumbs: Crumb[];
}

/**
 * Terminal-style breadcrumb: `>_ /home / catalogue / drop-abc123_`
 * Last crumb is unclickable and gets a blinking caret.
 */
export function Breadcrumb({ crumbs }: Props) {
  return (
    <nav className="font-mono text-[11px] uppercase tracking-wide2 flex flex-wrap items-center gap-1.5">
      <span className="text-yellow">{'>_'}</span>
      {crumbs.map((c, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-line">/</span>}
            {isLast || !c.onClick ? (
              <span className={isLast ? 'text-yellow caret' : 'text-muted'}>{c.label}</span>
            ) : (
              <button
                onClick={c.onClick}
                className="text-muted hover:text-white transition-colors duration-150 ease-linear"
              >
                {c.label}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
