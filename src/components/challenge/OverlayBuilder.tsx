import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, MonitorPlay, RefreshCw } from 'lucide-react'
import { CopyLink } from '@/components/CopyLink'
import { OverlayView } from '@/components/overlay/OverlayView'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import type { ChallengeData } from '@/hooks/useChallenge'
import { useSpecies } from '@/hooks/useSpecies'
import { formatTime } from '@/lib/describe'
import { useT } from '@/lib/i18n'
import {
  DEFAULT_CONFIG,
  maskedOverlayUrl,
  overlayUrl,
  parseConfig,
  shownPlayers,
  WIDGETS,
  type OverlayConfig,
  type Widget,
} from '@/lib/overlay'
import { ApiError, db, rpc } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'
import type { OverlayToken } from '@/lib/types'
import { cn } from '@/lib/utils'

const WIDGET_LABELS: Record<Widget, { title: string; hint: string }> = {
  link: { title: 'Letzter Soul-Link', hint: 'Der zuletzt eingetragene Fang aller Spieler' },
  team: { title: 'Team', hint: 'Aktuelles Team je Spieler' },
  cap: { title: 'Level-Cap', hint: 'Aktueller Cap mit Arena' },
  stats: { title: 'Zähler', hint: 'Run, lebende und verlorene Links' },
}

// Schnellstart: häufige Kombinationen mit einem Klick
const PRESETS: { label: string; widgets: Widget[] }[] = [
  { label: 'Letzter Fang', widgets: ['link'] },
  { label: 'Teams', widgets: ['team'] },
  { label: 'Level-Cap', widgets: ['cap'] },
  { label: 'Alles', widgets: ['stats', 'cap', 'link', 'team'] },
]

const storageKey = (challengeId: string) => `soullink.overlay.${challengeId}`

function readStoredToken(challengeId: string): string | null {
  try {
    return localStorage.getItem(storageKey(challengeId))
  } catch {
    return null
  }
}

function storeToken(challengeId: string, token: string | null) {
  try {
    if (token) localStorage.setItem(storageKey(challengeId), token)
    else localStorage.removeItem(storageKey(challengeId))
  } catch {
    // Speicher gesperrt: Link gilt nur, solange die Seite offen ist
  }
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

/**
 * Baukasten für OBS-Overlays: Bausteine, Spieler und Darstellung wählen, Vorschau ansehen, Link kopieren.
 * Jeder Spieler erstellt eigene Links; die Leitung sieht und widerruft alle. Der Link enthält ein eigenes
 * Lese-Token (nur als Hash gespeichert). Damit sich Varianten jederzeit neu zusammenstellen lassen, merkt
 * sich dieses Gerät das zuletzt erstellte Token.
 */
export function OverlayBuilder({ data }: { data: ChallengeData }) {
  const t = useT()
  const { challenge, me } = data
  const species = useSpecies()
  const [config, setConfig] = useState<OverlayConfig>(DEFAULT_CONFIG)
  const [token, setToken] = useState<string | null>(() => readStoredToken(challenge.id))
  const [tokenId, setTokenId] = useState<string | null>(null)
  const [tokens, setTokens] = useState<OverlayToken[]>([])
  const [label, setLabel] = useState('OBS')
  const [deviceLock, setDeviceLock] = useState(true)
  const [pasted, setPasted] = useState('')

  const remember = useCallback(
    (next: string | null) => {
      setToken(next)
      setTokenId(null)
      storeToken(challenge.id, next)
    },
    [challenge.id],
  )

  const update = (patch: Partial<OverlayConfig>) => setConfig((c) => ({ ...c, ...patch }))
  const players = shownPlayers(data.members, [])

  const reload = useCallback(async () => {
    const { data: rows } = await db()
      .from('overlay_tokens')
      .select('id, challenge_id, member_id, label, device_lock, device_bound_at, last_used_at, revoked_at, created_at')
      .eq('challenge_id', challenge.id)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
    setTokens((rows ?? []) as OverlayToken[])
  }, [challenge.id])

  // Gemerktes Token prüfen, ohne ein Gerät zu binden: widerrufen (auch von einem anderen Gerät) heißt neu erstellen
  useEffect(() => {
    if (!token) return
    let active = true
    rpc<string>('overlay_token_id', { p_token: token }).then(
      (id) => {
        if (active) setTokenId(id)
      },
      (error: unknown) => {
        if (active && error instanceof ApiError && error.code === 'PT401') remember(null)
      },
    )
    return () => {
      active = false
    }
  }, [token, remember, tokens])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void reload()
    })
    return () => {
      active = false
    }
  }, [reload])

  const toggleWidget = (widget: Widget) =>
    update({ widgets: config.widgets.includes(widget) ? config.widgets.filter((w) => w !== widget) : [...config.widgets, widget] })
  const moveWidget = (widget: Widget, by: -1 | 1) => {
    const list = [...config.widgets]
    const from = list.indexOf(widget)
    const to = from + by
    if (from < 0 || to < 0 || to >= list.length) return
    ;[list[from], list[to]] = [list[to], list[from]]
    update({ widgets: list })
  }
  const toggleSeat = (seat: number) => {
    // Leere Auswahl heißt „alle“; wer einen abwählt, wählt damit die übrigen aus
    const current = config.seats.length ? config.seats : players.map((p) => p.seat!)
    const next = current.includes(seat) ? current.filter((s) => s !== seat) : [...current, seat]
    update({ seats: next.length === players.length ? [] : next })
  }
  const seatShown = (seat: number) => !config.seats.length || config.seats.includes(seat)

  const create = async () => {
    try {
      const created = await rpc<string>('create_overlay_token', {
        p_challenge_id: challenge.id,
        p_label: label,
        p_device_lock: deviceLock,
      })
      remember(created)
      toast(t('Overlay-Link erstellt'))
      void reload()
    } catch (error) {
      toastError(error)
    }
  }

  const adopt = () => {
    try {
      const url = new URL(pasted.trim())
      const hash = url.hash.slice(1)
      if (!hash.startsWith('slo_')) throw new Error('kein Overlay-Link')
      remember(hash)
      setConfig(parseConfig(url.search))
      setPasted('')
      toast(t('Overlay-Link übernommen'))
    } catch {
      toastError(new Error(t('Das ist kein Overlay-Link dieser Seite.')))
    }
  }

  const url = token ? overlayUrl(window.location.origin, import.meta.env.BASE_URL, token, config) : null

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <Button key={preset.label} size="sm" variant="outline" onClick={() => update({ widgets: preset.widgets })}>
            {t(preset.label)}
          </Button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="grid content-start gap-5">
          <fieldset className="grid gap-2">
            <legend className="label mb-1 text-muted-foreground">{t('Bausteine')}</legend>
            {WIDGETS.map((widget) => {
              const index = config.widgets.indexOf(widget)
              return (
                <div key={widget} className={cn('flex items-center gap-2 rounded-md border px-3 py-2', index >= 0 && 'border-primary/50')}>
                  <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-[var(--primary)]"
                      checked={index >= 0}
                      onChange={() => toggleWidget(widget)}
                    />
                    <span className="min-w-0">
                      <span className="font-medium">{t(WIDGET_LABELS[widget].title)}</span>
                      <span className="block text-xs text-muted-foreground">{t(WIDGET_LABELS[widget].hint)}</span>
                    </span>
                  </label>
                  {index >= 0 && config.widgets.length > 1 && (
                    <span className="flex">
                      <Button size="icon" variant="ghost" aria-label={t('Nach oben')} disabled={index === 0} onClick={() => moveWidget(widget, -1)}>
                        <ArrowUp />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('Nach unten')}
                        disabled={index === config.widgets.length - 1}
                        onClick={() => moveWidget(widget, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </span>
                  )}
                </div>
              )
            })}
          </fieldset>

          {players.length > 1 && (
            <fieldset className="grid gap-2">
              <legend className="label mb-1 text-muted-foreground">{t('Spieler')}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {players.map((p) => (
                  <Toggle key={p.id} label={p.display_name} checked={seatShown(p.seat!)} onChange={() => toggleSeat(p.seat!)} />
                ))}
              </div>
            </fieldset>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t('Hintergrund')}>
              <Select value={config.theme} onChange={(e) => update({ theme: e.target.value as OverlayConfig['theme'] })}>
                <option value="dark">{t('Dunkle Fläche')}</option>
                <option value="light">{t('Helle Fläche')}</option>
                <option value="clear">{t('Ohne Fläche')}</option>
              </Select>
            </Field>
            <Field label={t('Anordnung')}>
              <Select value={config.direction} onChange={(e) => update({ direction: e.target.value as OverlayConfig['direction'] })}>
                <option value="column">{t('Untereinander')}</option>
                <option value="row">{t('Nebeneinander')}</option>
              </Select>
            </Field>
            <Field label={t('Ausrichtung')}>
              <Select value={config.align} onChange={(e) => update({ align: e.target.value as OverlayConfig['align'] })}>
                <option value="start">{t('Links')}</option>
                <option value="center">{t('Mitte')}</option>
                <option value="end">{t('Rechts')}</option>
              </Select>
            </Field>
            <Field label={t('Sprache')}>
              <Select value={config.lang} onChange={(e) => update({ lang: e.target.value as OverlayConfig['lang'] })}>
                <option value="de">{t('Deutsch')}</option>
                <option value="en">{t('Englisch')}</option>
              </Select>
            </Field>
            <Field label={t('Größe: {n} %', { n: config.scale })}>
              <input
                type="range"
                min={50}
                max={250}
                step={10}
                value={config.scale}
                onChange={(e) => update({ scale: Number(e.target.value) })}
                className="accent-[var(--primary)]"
              />
            </Field>
            <Field label={t('Akzentfarbe')}>
              <input
                type="color"
                value={config.accent}
                onChange={(e) => update({ accent: e.target.value.toLowerCase() })}
                className="h-10 w-full cursor-pointer rounded-md border bg-card px-1"
              />
            </Field>
          </div>

          <div className="grid gap-2">
            <Toggle label={t('Überschriften')} checked={config.titles} onChange={(v) => update({ titles: v })} />
            <Toggle label={t('Spielernamen')} checked={config.names} onChange={(v) => update({ names: v })} />
            <Toggle label={t('Pokémon-Namen')} checked={config.pokemonNames} onChange={(v) => update({ pokemonNames: v })} />
            <Toggle label={t('Spitznamen statt Artnamen')} checked={config.nicknames} onChange={(v) => update({ nicknames: v })} />
            <Toggle label={t('Leere Team-Plätze zeigen')} checked={config.emptySlots} onChange={(v) => update({ emptySlots: v })} />
          </div>
        </div>

        <div className="grid content-start gap-3">
          <span className="label text-muted-foreground">{t('Vorschau')}</span>
          {/* Karomuster wie in Bildbearbeitungen: zeigt, wo das Overlay durchsichtig ist */}
          <div
            className="flex min-h-64 overflow-auto rounded-xl border p-4"
            style={{
              justifyContent: config.align === 'start' ? 'flex-start' : config.align === 'end' ? 'flex-end' : 'center',
              backgroundColor: '#6b7280',
              backgroundImage:
                'linear-gradient(45deg,#4b5563 25%,transparent 25%),linear-gradient(-45deg,#4b5563 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#4b5563 75%),linear-gradient(-45deg,transparent 75%,#4b5563 75%)',
              backgroundSize: '24px 24px',
              backgroundPosition: '0 0,0 12px,12px -12px,-12px 0',
            }}
          >
            {config.widgets.length ? (
              <OverlayView data={data} config={config} species={species} />
            ) : (
              <p className="self-center text-sm text-white">{t('Wähle mindestens einen Baustein.')}</p>
            )}
          </div>
          {config.lang !== 'de' && (
            <p className="text-xs text-muted-foreground">{t('Die Vorschau zeigt Texte in der Sprache der Website; im Overlay erscheinen sie auf Englisch.')}</p>
          )}
        </div>
      </div>

      <div className="grid gap-3">
        {url ? (
          <CopyLink
            url={url}
            display={maskedOverlayUrl(url)}
            hint={t(
              'In OBS: Quelle hinzufügen → Browser → diese Adresse einfügen, Breite 1920, Höhe 1080. Jede Änderung oben ergibt einen neuen Link mit demselben Token. Der Schlüssel ist ausgeblendet, damit er nicht im Stream landet.',
            )}
          />
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void create()
            }}
          >
            <Field label={t('Bezeichnung')}>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} required maxLength={60} />
            </Field>
            <Button type="submit">
              <MonitorPlay /> {t('Overlay-Link erstellen')}
            </Button>
            <div className="basis-full">
              <Toggle label={t('Nur auf einem Gerät nutzbar (empfohlen)')} checked={deviceLock} onChange={setDeviceLock} />
            </div>
          </form>
        )}

        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">{t('Vorhandenen Overlay-Link bearbeiten')}</summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <Field label={t('Overlay-Link')}>
              <Input type="password" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="https://…/obs?w=…#slo_…" />
            </Field>
            <Button variant="outline" disabled={!pasted.trim()} onClick={adopt}>
              {t('Übernehmen')}
            </Button>
          </div>
        </details>

        {tokens.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {tokens.map((tk) => (
              <OverlayTokenRow
                key={tk.id}
                token={tk}
                current={tk.id === tokenId}
                owner={tk.member_id === me?.id ? null : (data.members.find((m) => m.id === tk.member_id)?.display_name ?? '?')}
                canRotate={tk.member_id === me?.id}
                onChanged={(rotated) => {
                  if (rotated) remember(rotated)
                  else if (tk.id === tokenId) {
                    // Der gemerkte Link wurde widerrufen: die Prüfung oben vergisst ihn
                    setTokenId(null)
                  }
                  void reload()
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function OverlayTokenRow({
  token,
  current,
  owner,
  canRotate,
  onChanged,
}: {
  token: OverlayToken
  /** Der Link, den dieses Gerät gerade bearbeitet */
  current: boolean
  /** Name des Spielers, wenn der Link nicht der eigene ist (nur für die Leitung sichtbar) */
  owner: string | null
  canRotate: boolean
  onChanged: (rotated: string | null) => void
}) {
  const t = useT()
  const run = async (action: () => Promise<unknown>, message: string) => {
    try {
      const result = await action()
      toast(t(message))
      // Nur Erneuern liefert ein Token zurück
      onChanged(typeof result === 'string' && result.startsWith('slo_') ? result : null)
    } catch (error) {
      toastError(error)
    }
  }
  const setLock = (lock: boolean, message: string) =>
    run(() => rpc('set_overlay_device_lock', { p_token_id: token.id, p_device_lock: lock }), message)

  return (
    <li className={cn('grid gap-2 rounded-md border px-3 py-2', current && 'border-primary/50')}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-medium">{token.label}</span>
        {owner && <span className="text-muted-foreground">{t('von {name}', { name: owner })}</span>}
        {current && <span className="label text-[0.6rem] text-primary">{t('Dieser Link')}</span>}
        <span className="text-muted-foreground">
          {token.last_used_at
            ? t('zuletzt aktiv {time}', { time: formatTime(token.last_used_at) })
            : t('noch nie benutzt')}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {!token.device_lock
          ? t('Ohne Gerätebindung: Jeder mit dem Link kann mitlesen.')
          : token.device_bound_at
            ? t('An ein Gerät gebunden seit {time}. Andere Geräte werden abgewiesen.', { time: formatTime(token.device_bound_at) })
            : t('Wird an das erste Gerät gebunden, das ihn öffnet.')}
      </p>
      <div className="flex flex-wrap gap-1">
        {token.device_lock && token.device_bound_at && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => void setLock(true, 'Gerät freigegeben. Das nächste Gerät, das den Link öffnet, wird gemerkt.')}
          >
            {t('Gerät freigeben')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            void (token.device_lock ? setLock(false, 'Gerätebindung ausgeschaltet') : setLock(true, 'Gerätebindung eingeschaltet'))
          }
        >
          {token.device_lock ? t('Gerätebindung ausschalten') : t('Gerätebindung einschalten')}
        </Button>
        {canRotate && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              void run(
                () => rpc<string>('rotate_overlay_token', { p_token_id: token.id }),
                'Neuer Link erstellt. Der alte funktioniert nicht mehr, in OBS bitte ersetzen.',
              )
            }
          >
            <RefreshCw /> {t('Erneuern')}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-destructive"
          onClick={() => void run(() => rpc('revoke_overlay_token', { p_token_id: token.id }), 'Overlay-Link widerrufen')}
        >
          {t('Widerrufen')}
        </Button>
      </div>
    </li>
  )
}
