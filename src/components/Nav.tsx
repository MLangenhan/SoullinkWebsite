import { motion } from 'motion/react'
import { setLang, useLang, useT } from '@/lib/i18n'
import { linkProps, withBase } from '@/lib/router'

/** Kopfzeile, die immer sichtbar bleibt. */
export function Nav() {
  const lang = useLang()
  const t = useT()

  return (
    <header
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-background/70 px-4 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur-md md:px-8"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between py-4">
        <a {...linkProps('/')} className="group flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
          <img src={withBase('/favicon.svg')} alt="" className="size-7" />
          Soul Link
        </a>
        <div className="flex items-center gap-4">
          <span className="label hidden items-center gap-2 text-muted-foreground sm:flex">
            <span className="size-2 rounded-full bg-ok" />
            Live
          </span>
          <div role="group" aria-label={t('Sprache')} className="relative flex rounded-full border bg-card/70 p-0.5 text-xs font-medium">
            {(['de', 'en'] as const).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
                aria-pressed={lang === code}
                title={code === 'de' ? t('Deutsch') : t('Englisch')}
                className={lang === code ? 'relative rounded-full px-2.5 py-1 text-primary-foreground' : 'relative rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground'}
              >
                {lang === code && (
                  <motion.span layoutId="lang-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 420, damping: 32 }} />
                )}
                <span className="relative">{code.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </header>
  )
}
