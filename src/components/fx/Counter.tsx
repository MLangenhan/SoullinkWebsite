import { locale, useLang } from '@/lib/i18n'

/** Zahl im Format der aktuellen Sprache – ohne Hochzähl-Animation, damit sie sofort lesbar ist. */
export function Counter({ to, className, suffix = '' }: { to: number; className?: string; suffix?: string }) {
  useLang()
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {to.toLocaleString(locale()) + suffix}
    </span>
  )
}
