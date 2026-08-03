import type { ReactNode } from 'react';
import clsx from 'clsx';

type Tone = 'neutral' | 'forest' | 'sage' | 'terracotta' | 'slate';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-sand-100 text-forest-700',
  forest: 'bg-forest-50 text-forest-700',
  sage: 'bg-sage-50 text-sage-700',
  terracotta: 'bg-clay text-terracotta',
  slate: 'bg-slate-50 text-slate',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        toneClasses[tone],
      )}
    >
      {children}
    </span>
  );
}
