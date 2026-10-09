import { lazy, Suspense } from 'react'
import { MotionConfig, motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { ReactLenis } from 'lenis/react'
import { Nav } from '@/components/Nav'
import { Toaster } from '@/components/Toaster'
import { useT } from '@/lib/i18n'
import { supabase } from '@/lib/supabase'
import { linkProps, usePage } from '@/lib/router'
import { Home } from '@/pages/Home'
import { Join } from '@/pages/Join'
import { Pokeball } from '@/components/Pokeball'
import { Setup } from '@/pages/Setup'

// Die Challenge-Seite (Board, Dialoge, Einstellungen) erst laden, wenn sie gebraucht wird
const ChallengePage = lazy(() => import('@/pages/ChallengePage').then((m) => ({ default: m.ChallengePage })))

function ScrollProgress() {
  const { scrollYProgress } = useScroll()
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30 })
  return <motion.div style={{ scaleX }} className="fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-primary" aria-hidden />
}

function NotFound() {
  const t = useT()
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="label text-primary">404</p>
      <h1 className="font-display tracking-tight text-5xl font-extrabold">{t('Hier ist nur hohes Gras')}</h1>
      <a {...linkProps('/')} className="text-primary underline-offset-4 hover:underline">
        {t('Zur Startseite')}
      </a>
    </main>
  )
}

export default function App() {
  const reduce = useReducedMotion()
  const page = usePage()

  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: !reduce }}>
      <MotionConfig reducedMotion="user">
        <ScrollProgress />
        <Nav />
        {!supabase ? (
          <Setup />
        ) : page.name === 'home' ? (
          <Home />
        ) : page.name === 'join' ? (
          <Join />
        ) : page.name === 'challenge' ? (
          <Suspense fallback={<Pokeball className="min-h-svh justify-center" />}>
            <ChallengePage key={page.slug} slug={page.slug} />
          </Suspense>
        ) : (
          <NotFound />
        )}
        <Toaster />
      </MotionConfig>
    </ReactLenis>
  )
}
