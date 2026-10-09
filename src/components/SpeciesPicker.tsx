import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { Sprite } from '@/components/Sprite'
import { Input } from '@/components/ui/input'
import { useT } from '@/lib/i18n'
import { speciesLabel, type SpeciesIndex } from '@/lib/species'
import { cn } from '@/lib/utils'

/** Suchfeld für Pokémon (deutscher oder englischer Name, Dex-Nummer) mit Sprite-Vorschau. */
export function SpeciesPicker({
  index,
  value,
  onChange,
  placeholder,
  restrictTo,
  autoFocus,
}: {
  index: SpeciesIndex
  value: number | null
  onChange: (id: number | null) => void
  placeholder?: string
  /** Nur diese Arten anbieten (z. B. Entwicklungsreihe) */
  restrictTo?: number[]
  autoFocus?: boolean
}) {
  const t = useT()
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  const results = useMemo(() => {
    if (restrictTo) {
      const allowed = restrictTo.map((id) => index.byId.get(id)).filter((s) => s !== undefined)
      return query ? allowed.filter((s) => index.search(query, 2000).includes(s)) : allowed
    }
    return index.search(query, 8)
  }, [index, query, restrictTo])

  const selected = value !== null ? index.byId.get(value) : undefined

  const choose = (id: number) => {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  if (selected) {
    return (
      <div className="flex h-14 items-center gap-3 rounded-md border bg-card px-2">
        <Sprite id={selected.id} name={speciesLabel(selected)} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{speciesLabel(selected)}</div>
          <div className="label text-[0.65rem] text-muted-foreground">
            #{String(selected.id).padStart(4, '0')} · {speciesLabel(selected) === selected.name_de ? selected.name_en : selected.name_de}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
          aria-label={t('{name} entfernen', { name: speciesLabel(selected) })}
        >
          <X className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="relative">
      <Input
        value={query}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t('Pokémon suchen …')}
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        className="h-14"
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, results.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && results[active]) {
            e.preventDefault()
            choose(results[active].id)
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      <AnimatePresence>
        {open && results.length > 0 && (
          <motion.ul
            id={listId}
            role="listbox"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-1 shadow-xl"
          >
            {results.map((s, i) => (
              <li
                key={s.id}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s.id)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded px-2 py-1',
                  i === active && 'bg-secondary',
                )}
              >
                <Sprite id={s.id} name={speciesLabel(s)} size="sm" idle={false} />
                <span className="flex-1 truncate">{speciesLabel(s)}</span>
                <span className="label text-[0.65rem] text-muted-foreground">#{s.id}</span>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  )
}
