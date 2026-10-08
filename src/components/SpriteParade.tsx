import { useRef } from 'react'
import {
  motion,
  useAnimationFrame,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
} from 'motion/react'
import { Sprite } from '@/components/Sprite'

/**
 * Endlos-Laufband aus Pokémon, dessen Tempo und Richtung der Scroll-Geschwindigkeit folgen
 * (gleiches Prinzip wie das Laufband im Portfolio).
 */
export function SpriteParade({ ids, baseVelocity = -1.5, className }: { ids: number[]; baseVelocity?: number; className?: string }) {
  const reduce = useReducedMotion()
  const base = useMotionValue(0)
  const { scrollY } = useScroll()
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 })
  const factor = useTransform(velocity, [0, 1000], [0, 5], { clamp: false })
  const x = useTransform(base, (v) => `${wrap(-25, -50, v)}%`)
  const dir = useRef(1)

  useAnimationFrame((_, delta) => {
    if (reduce) return
    let move = dir.current * baseVelocity * (delta / 1000)
    const f = factor.get()
    if (f < 0) dir.current = -1
    else if (f > 0) dir.current = 1
    move += dir.current * move * f
    base.set(base.get() + move)
  })

  const row = (copy: number) => (
    <span className="flex shrink-0 items-end gap-6 px-3">
      {ids.map((id) => (
        <Sprite key={`${copy}-${id}`} id={id} name={`#${id}`} size="lg" />
      ))}
    </span>
  )

  return (
    <div className={className} aria-hidden>
      <motion.div style={{ x }} className="flex whitespace-nowrap">
        {row(0)}
        {row(1)}
        {row(2)}
        {row(3)}
      </motion.div>
    </div>
  )
}
