import type { ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const variantClasses: Record<Variant, string> = {
  primary: 'bg-forest text-white hover:bg-forest-600',
  secondary: 'bg-sand-100 text-forest-700 hover:bg-sand-200',
  ghost: 'text-forest-700 hover:bg-sand-100',
  danger: 'bg-terracotta text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={clsx(
        'rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-60',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
