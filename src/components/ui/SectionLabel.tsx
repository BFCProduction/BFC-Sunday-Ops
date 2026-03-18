import type { ReactNode } from 'react'

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-gray-400 text-[11px] font-semibold uppercase tracking-widest mb-2.5">
      {children}
    </p>
  )
}
