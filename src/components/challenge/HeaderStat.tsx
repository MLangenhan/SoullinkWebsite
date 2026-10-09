import type { ReactNode } from 'react'

/** Kennzahl im Kopf: Beschriftung, Wert und Unterzeile stehen bei allen Kennzahlen auf derselben Höhe */
export function HeaderStat({ label, caption, children }: { label: string; caption?: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-w-0 grid-rows-[1rem_4.25rem_1rem] items-center">
      <p className="label text-muted-foreground">{label}</p>
      <div className="flex items-center">{children}</div>
      <p className="label max-w-[16rem] truncate text-[0.6rem] text-muted-foreground">{caption}</p>
    </div>
  )
}
