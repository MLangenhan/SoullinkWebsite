import { useState } from 'react'
import { motion, useMotionValueEvent, useScroll } from 'motion/react'
import { linkProps, withBase } from '@/lib/router'

/** Kopfzeile, die beim Runterscrollen verschwindet und beim Hochscrollen zurückkommt. */
export function Nav() {
  const { scrollY } = useScroll()
  const [hidden, setHidden] = useState(false)

  useMotionValueEvent(scrollY, 'change', (v) => {
    const previous = scrollY.getPrevious() ?? 0
    setHidden(v > previous && v > 160)
  })

  return (
    <motion.header
      className="fixed inset-x-0 top-0 z-50 border-b border-transparent bg-background/70 px-4 pt-[max(env(safe-area-inset-top),0px)] backdrop-blur-md md:px-8"
      animate={{ y: hidden ? '-110%' : '0%' }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between py-4">
        <a {...linkProps('/')} className="group flex items-center gap-2.5 font-display text-xl font-extrabold tracking-tight">
          <motion.img
            src={withBase('/favicon.svg')}
            alt=""
            className="size-7"
            whileHover={{ rotate: [0, -20, 20, -10, 0] }}
            transition={{ duration: 0.6 }}
          />
          Soul Link
        </a>
        <span className="label hidden items-center gap-2 text-muted-foreground sm:flex">
          <span className="size-2 animate-pulse rounded-full bg-ok" />
          Live
        </span>
      </div>
    </motion.header>
  )
}
