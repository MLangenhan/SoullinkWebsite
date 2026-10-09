import { useEffect, useRef } from 'react'
import { animate, useInView, useReducedMotion } from 'motion/react'
import { locale, useLang } from '@/lib/i18n'

/** Zahl, die beim Einscrollen hochzählt und bei Live-Änderungen vom alten zum neuen Wert läuft. */
export function Counter({ to, className, suffix = '' }: { to: number; className?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-15% 0px' })
  const reduce = useReducedMotion()
  const shown = useRef(0)
  const lang = useLang()

  useEffect(() => {
    const el = ref.current
    if (!el || !inView) return
    if (reduce) {
      shown.current = to
      el.textContent = to.toLocaleString(locale()) + suffix
      return
    }
    const controls = animate(shown.current, to, {
      duration: shown.current === 0 ? 1.6 : 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v
        el.textContent = Math.round(v).toLocaleString(locale()) + suffix
      },
    })
    return () => controls.stop()
  }, [inView, to, suffix, reduce, lang])

  // Startwert ist die Endzahl, damit ohne JavaScript bzw. vor dem Einblenden das Ergebnis dasteht
  return (
    <span ref={ref} className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {to.toLocaleString(locale()) + suffix}
    </span>
  )
}
