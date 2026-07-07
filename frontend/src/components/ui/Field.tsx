import { type ReactNode } from 'react';

/** A labelled form row: small grey label above its control. */
export default function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
