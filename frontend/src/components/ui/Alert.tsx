import { type ReactNode } from 'react';

type Kind = 'error' | 'success' | 'info';

const STYLES: Record<Kind, string> = {
  error: 'text-red-400 bg-red-950 border-red-800',
  success: 'text-green-400 bg-green-950 border-green-800',
  info: 'text-gray-300 bg-gray-900 border-gray-700',
};

/** Inline status banner (error / success / info). */
export default function Alert({ kind = 'info', children }: { kind?: Kind; children: ReactNode }) {
  return <div className={`text-sm border rounded-md px-3 py-2 ${STYLES[kind]}`}>{children}</div>;
}
