import { useEffect, useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Gauge, Zap } from 'lucide-react'
import { Pokeball } from '@/components/Pokeball'
import { SpeciesPicker } from '@/components/SpeciesPicker'
import { Sprite } from '@/components/Sprite'
import { TypeChip } from '@/components/challenge/DexPanel'
import { Field, Input, Select } from '@/components/ui/input'
import { capLevel, versionGroupFor } from '@/data/levelCaps'
import type { ChallengeData } from '@/hooks/useChallenge'
import {
  compute,
  emptyField,
  emptySide,
  generation,
  label,
  loadNames,
  STATS,
  type CalcGen,
  type FieldConfig,
  type MoveResult,
  type SideConfig,
  type StatKey,
} from '@/lib/calc'
import { TYPES, typeName, useDex, type DexData } from '@/lib/dex'
import { locale, useT } from '@/lib/i18n'
import { speciesLabel, type SpeciesIndex } from '@/lib/species'
import type { Encounter } from '@/lib/types'
import { cn } from '@/lib/utils'

type Names = Awaited<ReturnType<typeof loadNames>>

const STAT_SHORT: Record<StatKey, string> = { hp: 'KP', atk: 'Ang', def: 'Vert', spa: 'SpAng', spd: 'SpVert', spe: 'Init' }
const typeIdByEnglish = Object.fromEntries(Object.entries(TYPES).map(([id, t]) => [t.en, Number(id)]))

// Werte bleiben nur auf diesem Gerät (localStorage), getrennt pro eigenem Pokémon
const storageKey = (key: string) => `soullink.calc.${key}`
function loadSide(key: string): SideConfig | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    return raw ? { ...emptySide(), ...(JSON.parse(raw) as SideConfig) } : null
  } catch {
    return null
  }
}
function saveSide(key: string, side: SideConfig) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(side))
  } catch {
    // Speicher voll oder gesperrt: dann eben nur für diese Sitzung
  }
}

/** Letzte Level-Attacken bis zum Level aus den Editionsdaten (Startwert; bei Randomizern anpassen) */
function defaultMoves(dex: DexData, speciesId: number, level: number, gen: CalcGen): string[] {
  const learned = (dex.learn[speciesId] ?? []).filter(([lvl]) => lvl <= level).map(([, id]) => dex.moves[id]?.[6])
  const damaging = learned.filter((name): name is string => !!name && (gen.moveInfo(name)?.basePower ?? 0) > 0)
  const unique = [...new Set(damaging.reverse())].slice(0, 4)
  return [...unique, '', '', '', ''].slice(0, 4)
}

/**
 * Schadensrechner wie im Showdown-Calc, mit der Generation des gespielten Spiels. Links ein eigenes
 * Pokémon (Werte bleiben auf dem Gerät gespeichert), rechts der Gegner. Für Randomizer lassen sich
 * Typen und Basiswerte überschreiben.
 */
export function CalcPanel({ data, species }: { data: ChallengeData; species: SpeciesIndex | null }) {
  const t = useT()
  const dex = useDex(versionGroupFor(data.challenge))
  const [names, setNames] = useState<Names | null>(null)
  const cap = capLevel(data.challenge, data.stats.current_run) ?? 50
  const team = data.encounters.filter((e) => (e.state === 'team' || e.state === 'box') && (!data.me || e.member_id === data.me.id))
  const [ownId, setOwnId] = useState<string | null>(() => team.find((e) => e.state === 'team')?.encounter_id ?? null)
  const own = team.find((e) => e.encounter_id === ownId) ?? null
  const opponentKey = `opponent.${data.challenge.id}`
  // Bearbeitete Werte pro eigenem Pokémon; sonst gespeicherte Werte oder Vorbelegung
  const [edits, setEdits] = useState<Record<string, SideConfig>>({})
  const [right, setRight] = useState<SideConfig>(() => loadSide(opponentKey) ?? emptySide(cap))
  const [field, setField] = useState<FieldConfig>(emptyField)

  useEffect(() => {
    loadNames().then(setNames).catch(() => undefined)
  }, [])

  const gen = dex ? generation(dex.generation) : null

  const ownKey = own?.encounter_id
  const ownSpecies = own?.species_id
  const left = useMemo(() => {
    if (!ownKey || ownSpecies === undefined || !dex || !gen) return null
    const base = edits[ownKey] ?? loadSide(ownKey) ?? { ...emptySide(cap), moves: defaultMoves(dex, ownSpecies, cap, gen) }
    return { ...base, speciesId: ownSpecies }
  }, [ownKey, ownSpecies, dex, gen, cap, edits])

  const updateLeft = (next: SideConfig) => {
    if (!ownKey) return
    setEdits((all) => ({ ...all, [ownKey]: next }))
    saveSide(ownKey, next)
  }
  const updateRight = (next: SideConfig) => {
    setRight(next)
    saveSide(opponentKey, next)
  }

  const nameOf = (id: number | null) => {
    const entry = id ? species?.byId.get(id) : undefined
    return entry && gen ? gen.speciesName(entry.name_en) : null
  }
  const leftName = left ? nameOf(left.speciesId) : null
  const rightName = nameOf(right.speciesId)

  const outcome = useMemo(() => {
    if (!gen || !left || !leftName || !rightName) return null
    try {
      return compute(gen, leftName, left, rightName, right, field)
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  }, [gen, left, leftName, right, rightName, field])

  if (!species || !dex || !gen) return <Pokeball className="py-16" />

  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">
        {t('Rechnet wie der Showdown-Calc (Generation {gen}). Deine Werte bleiben nur auf diesem Gerät gespeichert.', { gen: gen.num })}
      </p>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        <section className="soft-card grid content-start gap-4 rounded-2xl p-5">
          <h3 className="label text-muted-foreground">{t('Dein Pokémon')}</h3>
          {team.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('Noch keine eigenen Pokémon in diesem Run.')}</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {team.map((e: Encounter) => (
                <button
                  key={e.encounter_id}
                  type="button"
                  onClick={() => setOwnId(e.encounter_id)}
                  className={cn('rounded-lg p-1 transition-colors hover:bg-secondary', ownId === e.encounter_id && 'bg-secondary ring-2 ring-primary/40')}
                  title={speciesLabel(species.byId.get(e.species_id) ?? { name_de: '?', name_en: '?' })}
                  aria-pressed={ownId === e.encounter_id}
                >
                  <Sprite id={e.species_id} name="" size="sm" idle={false} state={e.state} />
                </button>
              ))}
            </div>
          )}
          {left && leftName && <SideEditor side={left} name={leftName} gen={gen} names={names} onChange={updateLeft} />}
        </section>

        <section className="grid content-start gap-4">
          <FieldEditor field={field} gen={gen} onChange={setField} />
          {outcome instanceof Error ? (
            <p className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{outcome.message}</p>
          ) : outcome && left && leftName && rightName ? (
            <>
              <Speed left={leftName} right={rightName} leftSpeed={outcome.leftSpeed} rightSpeed={outcome.rightSpeed} />
              <Results title={t('{a} gegen {b}', { a: displaySpecies(species, left.speciesId), b: displaySpecies(species, right.speciesId) })} results={outcome.leftToRight} gen={gen} names={names} />
              <Results title={t('{a} gegen {b}', { a: displaySpecies(species, right.speciesId), b: displaySpecies(species, left.speciesId) })} results={outcome.rightToLeft} gen={gen} names={names} />
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center text-muted-foreground">
              <Gauge className="size-6" />
              <p>{t('Wähle links dein Pokémon und rechts den Gegner.')}</p>
            </div>
          )}
        </section>

        <section className="soft-card grid content-start gap-4 rounded-2xl p-5">
          <h3 className="label text-muted-foreground">{t('Gegner')}</h3>
          <SpeciesPicker
            index={species}
            value={right.speciesId}
            onChange={(id) =>
              updateRight({
                ...right,
                speciesId: id,
                ability: '',
                moves: id && dex ? defaultMoves(dex, id, right.level, gen) : right.moves,
                override: { ...right.override, enabled: false },
              })
            }
          />
          {rightName && <SideEditor side={right} name={rightName} gen={gen} names={names} onChange={updateRight} />}
        </section>
      </div>
    </div>
  )
}

function displaySpecies(species: SpeciesIndex, id: number | null) {
  const entry = id ? species.byId.get(id) : undefined
  return entry ? speciesLabel(entry) : '?'
}

/** Datalist-Eingabe: zeigt deutsche oder englische Namen, speichert den englischen */
function NameInput({
  value,
  options,
  names,
  kind,
  placeholder,
  onChange,
  ariaLabel,
}: {
  value: string
  options: string[]
  names: Names | null
  kind: keyof Names
  placeholder: string
  onChange: (english: string) => void
  ariaLabel: string
}) {
  const id = useId()
  const display = useMemo(() => new Map(options.map((o) => [label(names, kind, o), o])), [options, names, kind])
  const shown = label(names, kind, value)
  const [text, setText] = useState(shown)
  // Wert von außen geändert (oder Sprache/Namen geladen): Eingabe nachziehen
  const [synced, setSynced] = useState(shown)
  if (synced !== shown) {
    setSynced(shown)
    setText(shown)
  }
  return (
    <>
      <Input
        list={id}
        value={text}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => {
          setText(e.target.value)
          const english = display.get(e.target.value) ?? options.find((o) => o.toLowerCase() === e.target.value.toLowerCase())
          if (english) onChange(english)
          if (!e.target.value) onChange('')
        }}
        className="h-9"
      />
      <datalist id={id}>
        {[...display.keys()].map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>
    </>
  )
}

function SideEditor({
  side,
  name,
  gen,
  names,
  onChange,
}: {
  side: SideConfig
  name: string
  gen: CalcGen
  names: Names | null
  onChange: (side: SideConfig) => void
}) {
  const t = useT()
  const [more, setMore] = useState(false)
  const info = gen.species(name)
  const types = side.override.enabled && side.override.types.filter(Boolean).length ? side.override.types.filter(Boolean) : (info?.types ?? [])
  const set = (patch: Partial<SideConfig>) => onChange({ ...side, ...patch })
  const abilities = info ? [...new Set([...info.abilities, ...gen.abilities])] : gen.abilities

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3">
        <Sprite id={side.speciesId ?? 0} name={name} size="lg" />
        <div className="grid gap-1.5">
          <div className="flex flex-wrap gap-1">
            {types.map((type) => (
              <TypeChip key={type} type={typeIdByEnglish[type] ?? 1} small />
            ))}
          </div>
          {info && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {STATS.map((s) => `${t(STAT_SHORT[s])} ${(side.override.enabled ? side.override.stats : info.baseStats)[s]}`).join(' · ')}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t('Level')}>
          <Input type="number" min={1} max={100} value={side.level} onChange={(e) => set({ level: clamp(Number(e.target.value), 1, 100) })} className="h-9" />
        </Field>
        {gen.num >= 3 ? (
          <Field label={t('Wesen')}>
            <Select value={side.nature} onChange={(e) => set({ nature: e.target.value })} className="h-9">
              {gen.natures.map((n) => (
                <option key={n.name} value={n.name}>
                  {label(names, 'natures', n.name)}
                  {n.plus && n.plus !== n.minus ? ` (+${t(STAT_SHORT[n.plus as StatKey])} −${t(STAT_SHORT[n.minus as StatKey])})` : ''}
                </option>
              ))}
            </Select>
          </Field>
        ) : (
          <span />
        )}
        {gen.num >= 3 && (
          <Field label={t('Fähigkeit')}>
            <NameInput value={side.ability} options={abilities} names={names} kind="abilities" placeholder={info?.abilities[0] ? label(names, 'abilities', info.abilities[0]) : ''} onChange={(ability) => set({ ability })} ariaLabel={t('Fähigkeit')} />
          </Field>
        )}
        {gen.num >= 2 && (
          <Field label={t('Item')}>
            <NameInput value={side.item} options={gen.items} names={names} kind="items" placeholder={t('kein Item')} onChange={(item) => set({ item })} ariaLabel={t('Item')} />
          </Field>
        )}
      </div>

      <div className="grid gap-2">
        <span className="label text-muted-foreground">{t('Attacken')}</span>
        {side.moves.map((move, i) => {
          const moveInfo = move ? gen.moveInfo(move) : null
          return (
            <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <NameInput
                value={move}
                options={gen.moves}
                names={names}
                kind="moves"
                placeholder={t('Attacke {n}', { n: i + 1 })}
                ariaLabel={t('Attacke {n}', { n: i + 1 })}
                onChange={(name) => set({ moves: side.moves.map((m, j) => (j === i ? name : m)) })}
              />
              {moveInfo ? <TypeChip type={typeIdByEnglish[moveInfo.type] ?? 1} small /> : <span className="w-12" />}
            </div>
          )
        })}
      </div>

      <button type="button" onClick={() => setMore((v) => !v)} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronDown className={cn('size-4 transition-transform', more && 'rotate-180')} />
        {t('Mehr: Werte, Status, Randomizer')}
      </button>
      <AnimatePresence initial={false}>
        {more && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="grid gap-3 overflow-hidden">
            {gen.num >= 3 && (
              <StatGrid
                rows={[
                  { label: t('DVs/IVs'), values: side.ivs, max: 31, onChange: (ivs) => set({ ivs }) },
                  { label: t('EVs'), values: side.evs, max: 252, onChange: (evs) => set({ evs }) },
                ]}
              />
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('Status')}>
                <Select value={side.status} onChange={(e) => set({ status: e.target.value as SideConfig['status'] })} className="h-9">
                  <option value="">{t('keiner')}</option>
                  <option value="brn">{t('Verbrennung')}</option>
                  <option value="par">{t('Paralyse')}</option>
                  <option value="psn">{t('Vergiftung')}</option>
                  <option value="tox">{t('Schwere Vergiftung')}</option>
                  <option value="slp">{t('Schlaf')}</option>
                  <option value="frz">{t('Eingefroren')}</option>
                </Select>
              </Field>
              <Field label={t('KP in %')}>
                <Input type="number" min={1} max={100} value={side.hpPercent} onChange={(e) => set({ hpPercent: clamp(Number(e.target.value), 1, 100) })} className="h-9" />
              </Field>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {(['atk', 'def', 'spa', 'spd', 'spe'] as const).map((s) => (
                <Field key={s} label={`${t(STAT_SHORT[s])} ±`}>
                  <Input type="number" min={-6} max={6} value={side.boosts[s]} onChange={(e) => set({ boosts: { ...side.boosts, [s]: clamp(Number(e.target.value), -6, 6) } })} className="h-9 px-2" />
                </Field>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4 accent-[var(--primary)]"
                checked={side.override.enabled}
                onChange={(e) =>
                  set({
                    override: {
                      enabled: e.target.checked,
                      types: side.override.types.length ? side.override.types : (info?.types ?? []),
                      stats: side.override.enabled ? side.override.stats : (info?.baseStats ?? side.override.stats),
                    },
                  })
                }
              />
              {t('Typen und Basiswerte anpassen (Randomizer)')}
            </label>
            {side.override.enabled && (
              <div className="grid gap-3 rounded-xl border border-dashed p-3">
                <div className="grid grid-cols-2 gap-3">
                  {[0, 1].map((i) => (
                    <Field key={i} label={i === 0 ? t('Typ 1') : t('Typ 2')}>
                      <Select
                        value={side.override.types[i] ?? ''}
                        onChange={(e) => {
                          const next = [...side.override.types]
                          next[i] = e.target.value
                          set({ override: { ...side.override, types: next.filter((x, j) => x || j === 0) } })
                        }}
                        className="h-9"
                      >
                        {i === 1 && <option value="">{t('keiner')}</option>}
                        {Object.entries(TYPES)
                          .filter(([, type]) => gen.num >= 6 || type.en !== 'Fairy')
                          .map(([id, type]) => (
                            <option key={type.en} value={type.en}>
                              {typeName(Number(id))}
                            </option>
                          ))}
                      </Select>
                    </Field>
                  ))}
                </div>
                <StatGrid rows={[{ label: t('Basiswerte'), values: side.override.stats, max: 255, onChange: (stats) => set({ override: { ...side.override, stats } }) }]} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StatGrid({ rows }: { rows: { label: string; values: Record<StatKey, number>; max: number; onChange: (v: Record<StatKey, number>) => void }[] }) {
  const t = useT()
  return (
    <div className="grid gap-1.5 overflow-x-auto">
      <div className="grid grid-cols-[4.5rem_repeat(6,minmax(2.6rem,1fr))] gap-1 text-[0.6rem]">
        <span />
        {STATS.map((s) => (
          <span key={s} className="label text-center text-muted-foreground">
            {t(STAT_SHORT[s])}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[4.5rem_repeat(6,minmax(2.6rem,1fr))] items-center gap-1">
          <span className="text-xs text-muted-foreground">{row.label}</span>
          {STATS.map((s) => (
            <Input
              key={s}
              type="number"
              min={0}
              max={row.max}
              aria-label={`${row.label} ${t(STAT_SHORT[s])}`}
              value={row.values[s]}
              onChange={(e) => row.onChange({ ...row.values, [s]: clamp(Number(e.target.value), 0, row.max) })}
              className="h-8 px-1 text-center"
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function FieldEditor({ field, gen, onChange }: { field: FieldConfig; gen: CalcGen; onChange: (f: FieldConfig) => void }) {
  const t = useT()
  const toggle = (on: boolean, text: string, change: (v: boolean) => void) => (
    <label className="flex items-center gap-1.5 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={on} onChange={(e) => change(e.target.checked)} />
      {text}
    </label>
  )
  return (
    <div className="soft-card flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl px-5 py-3">
      {gen.num >= 2 && (
        <label className="flex items-center gap-2 text-sm">
          {t('Wetter')}
          <Select value={field.weather} onChange={(e) => onChange({ ...field, weather: e.target.value as FieldConfig['weather'] })} className="h-8 w-auto">
            <option value="">{t('keins')}</option>
            <option value="Sun">{t('Sonne')}</option>
            <option value="Rain">{t('Regen')}</option>
            {gen.num >= 2 && <option value="Sand">{t('Sandsturm')}</option>}
            {gen.num >= 3 && <option value="Hail">{t('Hagel')}</option>}
          </Select>
        </label>
      )}
      {toggle(field.crit, t('Volltreffer'), (crit) => onChange({ ...field, crit }))}
      {toggle(field.screens.left.reflect, t('Reflektor (dein)'), (v) => onChange({ ...field, screens: { ...field.screens, left: { ...field.screens.left, reflect: v } } }))}
      {toggle(field.screens.left.lightScreen, t('Lichtschild (dein)'), (v) => onChange({ ...field, screens: { ...field.screens, left: { ...field.screens.left, lightScreen: v } } }))}
      {toggle(field.screens.right.reflect, t('Reflektor (Gegner)'), (v) => onChange({ ...field, screens: { ...field.screens, right: { ...field.screens.right, reflect: v } } }))}
      {toggle(field.screens.right.lightScreen, t('Lichtschild (Gegner)'), (v) => onChange({ ...field, screens: { ...field.screens, right: { ...field.screens.right, lightScreen: v } } }))}
    </div>
  )
}

function Speed({ left, right, leftSpeed, rightSpeed }: { left: string; right: string; leftSpeed: number; rightSpeed: number }) {
  const t = useT()
  const text =
    leftSpeed === rightSpeed
      ? t('Gleich schnell ({speed} Init): Zufall entscheidet', { speed: leftSpeed })
      : t('{name} ist schneller ({fast} gegen {slow} Init)', {
          name: leftSpeed > rightSpeed ? left : right,
          fast: Math.max(leftSpeed, rightSpeed),
          slow: Math.min(leftSpeed, rightSpeed),
        })
  return (
    <p className="flex items-center gap-2 rounded-xl bg-secondary/70 px-4 py-2 text-sm">
      <Zap className="size-4 shrink-0 text-highlight" /> {text}
    </p>
  )
}

function koText(t: ReturnType<typeof useT>, result: MoveResult) {
  if (result.status) return t('kein Schaden')
  const { n, chance } = result.ko
  if (!n) return t('mehr als 4 Treffer')
  const hits = n === 1 ? t('OHKO') : t('{n}HKO', { n })
  if (chance === undefined || chance >= 1) return t('sicherer {ko}', { ko: hits })
  return t('{p} % Chance auf {ko}', { p: percent(chance * 100), ko: hits })
}

function Results({ title, results, gen, names }: { title: string; results: MoveResult[]; gen: CalcGen; names: Names | null }) {
  const t = useT()
  return (
    <section className="soft-card rounded-2xl p-5">
      <h4 className="label mb-3 text-muted-foreground">{title}</h4>
      {results.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('Keine Attacken eingetragen.')}</p>
      ) : (
        <ul className="grid gap-3">
          {results.map((r) => {
            const info = gen.moveInfo(r.move)
            const hpPercent = (r.hp / r.maxHp) * 100
            const ko = r.ko.n === 1 && (r.ko.chance ?? 1) >= 1
            return (
              <li key={r.move} className="grid gap-1.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {info && <TypeChip type={typeIdByEnglish[info.type] ?? 1} small />}
                  <span className="font-medium">{label(names, 'moves', r.move)}</span>
                  <span className="ml-auto tabular-nums text-muted-foreground">
                    {r.status ? '–' : `${percent(r.minPercent)} – ${percent(r.maxPercent)} %`}
                  </span>
                </div>
                {/* Balken: KP des Verteidigers, darin der mögliche Schaden (hell = Zufallsspanne) */}
                <div className="relative h-2.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
                  <motion.div
                    className="absolute inset-y-0 left-0 rounded-full bg-ok/25"
                    initial={false}
                    animate={{ width: `${hpPercent}%` }}
                  />
                  <motion.div
                    className="absolute inset-y-0 rounded-full bg-destructive/40"
                    initial={false}
                    animate={{ left: `${Math.max(0, hpPercent - Math.min(hpPercent, r.maxPercent))}%`, width: `${Math.min(hpPercent, r.maxPercent) - Math.min(hpPercent, r.minPercent)}%` }}
                  />
                  <motion.div
                    className="absolute inset-y-0 rounded-r-full bg-destructive"
                    initial={false}
                    animate={{ left: `${Math.max(0, hpPercent - Math.min(hpPercent, r.minPercent))}%`, width: `${Math.min(hpPercent, r.minPercent)}%` }}
                  />
                </div>
                <span className={cn('text-xs', ko ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                  {r.status ? koText(t, r) : `${r.min}–${r.max} ${t('KP')} · ${koText(t, r)}`}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function percent(value: number) {
  return value.toLocaleString(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

function clamp(value: number, min: number, max: number) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min
}

export default CalcPanel
