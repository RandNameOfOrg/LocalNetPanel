import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'danger' | 'warning' | 'success' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-blue-600 hover:bg-blue-500 text-white',
  danger: 'bg-red-900 hover:bg-red-800 text-white',
  warning: 'bg-yellow-900 hover:bg-yellow-800 text-white',
  success: 'bg-green-700 hover:bg-green-600 text-white',
  secondary: 'bg-gray-800 hover:bg-gray-700 text-gray-200',
  ghost: 'text-gray-400 hover:text-white',
};

const SIZES: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
