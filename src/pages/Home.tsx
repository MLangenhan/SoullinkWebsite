import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowUpRight, Lock, Radio } from 'lucide-react'
import { CreateChallengeDialog } from '@/components/CreateChallengeDialog'
import { SplitReveal } from '@/components/fx/SplitReveal'
import { Magnetic } from '@/components/fx/Magnetic'
import { Pokeball } from '@/components/Pokeball'
import { SpriteParade } from '@/components/SpriteParade'
import { useSessionUserId } from '@/hooks/useSession'
import { linkProps } from '@/lib/router'
import { db } from '@/lib/supabase'
import type { Challenge, ChallengeStats, Member } from '@/lib/types'

// Sinnoh-Starter, Legenden und ein paar alte Bekannte
const PARADE = [387, 390, 393, 483, 484, 487, 25, 448, 445, 133, 94, 6, 9, 3, 150, 249, 250, 384, 491, 493]

interface MyChallenge {
  challenge: Challenge
  stats: ChallengeStats | undefined
  me: Member | undefined
  players: Member[]
}

function useMyChallenges(userId: string | null | undefined) {
  const [state, setState] = useState<MyChallenge[] | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    void (async () => {
      const client = db()
      const devices = await client.from('member_devices').select('challenge_id, member_id').eq('user_id', userId)
      const ids = (devices.data ?? []).map((d) => d.challenge_id as string)
      if (ids.length === 0) {
        if (active) setState([])
        return
      }
      const [challenges, stats, members] = await Promise.all([
        client.from('challenges').select('*').in('id', ids).order('created_at', { ascending: false }),
        client.from('challenge_stats').select('*').in('challenge_id', ids),
        client.from('challenge_members').select('*').in('challenge_id', ids).order('seat'),
      ])
      if (!active) return
      const myMemberIds = new Set((devices.data ?? []).map((d) => d.member_id as string))
      setState(
        ((challenges.data ?? []) as Challenge[]).map((challenge) => {
          const own = ((members.data ?? []) as Member[]).filter((m) => m.challenge_id === challenge.id)
          return {
            challenge,
            stats: ((stats.data ?? []) as ChallengeStats[]).find((s) => s.challenge_id === challenge.id),
            me: own.find((m) => myMemberIds.has(m.id)),
            players: own.filter((m) => m.role !== 'viewer'),
          }
        }),
      )
    })()
    return () => {
      active = false
    }
  }, [userId])

  return userId === null ? [] : state
}

/** Weiche, langsam treibende Farbflächen im Hero (Pokémon-Blau, -Gelb und -Rot) */
function Blobs() {
  const reduce = useReducedMotion()
  const blobs = [
    { className: 'left-[-10%] top-[5%] size-[42vw] bg-primary/20', x: [0, 40, 0], y: [0, 30, 0] },
    { className: 'right-[-8%] top-[20%] size-[34vw] bg-highlight/35', x: [0, -30, 0], y: [0, 40, 0] },
    { className: 'left-[30%] bottom-[-15%] size-[30vw] bg-pokeball/10', x: [0, 20, 0], y: [0, -25, 0] },
  ]
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {blobs.map((b, i) => (
        <motion.div
          key={i}
          className={`absolute rounded-full blur-3xl ${b.className}`}
          animate={reduce ? undefined : { x: b.x, y: b.y }}
          transition={{ duration: 14 + i * 3, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  )
}

export function Home() {
  const userId = useSessionUserId()
  const mine = useMyChallenges(userId)

  return (
    <main>
      <section className="dot-bg relative flex min-h-[92svh] flex-col justify-end overflow-hidden pt-28 pb-10">
        <Blobs />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_30%,var(--background)_80%)]" />
        <div className="relative mx-auto w-full max-w-7xl px-4 md:px-8">
          <p className="label mb-4 text-primary">Nuzlocke · Soul Link · Live</p>
          <h1 className="font-display text-[19vw] leading-[0.82] font-extrabold tracking-tight md:text-[12rem]">
            <SplitReveal text="Soul" by="chars" />
            <br />
            <SplitReveal text="Link" by="chars" delay={0.15} className="text-primary" />
            <motion.span
              aria-hidden
              className="ml-[0.08em] inline-block size-[0.18em] rounded-full bg-highlight align-baseline"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.6, type: 'spring', stiffness: 300, damping: 12 }}
            />
          </h1>
          <motion.div
            className="mt-8"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <Magnetic>
              <CreateChallengeDialog />
            </Magnetic>
          </motion.div>
        </div>
        <SpriteParade ids={PARADE} className="relative mt-14 overflow-hidden py-2" />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 md:px-8">
        <div className="mb-8 flex items-end justify-between gap-4">
          <h2 className="font-display tracking-tight text-5xl font-extrabold md:text-6xl">
            <SplitReveal text="Meine Challenges" />
          </h2>
          <span className="label hidden text-muted-foreground md:block">auf diesem Gerät</span>
        </div>

        {mine === null ? (
          <Pokeball className="py-16" />
        ) : mine.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed p-10 text-center text-muted-foreground">
            <p className="text-lg text-foreground">Noch keine Challenge auf diesem Gerät.</p>
            <p className="mt-2">Starte eine neue oder öffne den Einladungslink, den du bekommen hast.</p>
          </div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {mine.map(({ challenge, stats, me, players }, i) => (
              <motion.a
                key={challenge.id}
                {...linkProps(`/c/${challenge.slug}`)}
                className="soft-card group relative flex flex-col gap-5 overflow-hidden rounded-2xl p-6 transition-colors hover:border-primary/50"
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-10% 0px' }}
                transition={{ duration: 0.6, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
                whileHover={{ y: -4 }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="label text-muted-foreground">
                      Run {stats?.current_run ?? 1} · {stats?.wipes_total ?? 0} Wipes · {stats?.wins_total ?? 0} Siege
                    </p>
                    <h3 className="mt-2 font-display tracking-tight text-3xl font-extrabold">{challenge.name}</h3>
                  </div>
                  <ArrowUpRight className="size-6 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:-translate-y-1 group-hover:text-primary" />
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 text-sm text-muted-foreground">
                  <span className="truncate">{players.map((p) => p.display_name).join(' · ')}</span>
                  <span className="label flex shrink-0 items-center gap-1.5">
                    {challenge.visibility === 'public' ? <Radio className="size-3.5" /> : <Lock className="size-3.5" />}
                    {me?.role === 'owner' ? 'Leitung' : me?.role === 'viewer' ? 'Zuschauer' : 'Spieler'}
                  </span>
                </div>
              </motion.a>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
