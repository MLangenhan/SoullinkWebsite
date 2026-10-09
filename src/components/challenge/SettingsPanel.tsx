import { useCallback, useEffect, useState } from 'react'
import { Bot, Link2, LogOut, Pencil, Smartphone, Trash2, UserPlus } from 'lucide-react'
import { CopyLink } from '@/components/CopyLink'
import { detectPreset, LEVEL_CAP_PRESETS } from '@/data/levelCaps'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import type { ChallengeData } from '@/hooks/useChallenge'
import { inviteUrl } from '@/lib/actions'
import { formatTime } from '@/lib/describe'
import { useT } from '@/lib/i18n'
import { navigate } from '@/lib/router'
import { db, rpc } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'
import type { BotToken, Device, Invite, Member, Role, Visibility } from '@/lib/types'
import { cn } from '@/lib/utils'

const roleLabel: Record<Role, string> = { owner: 'Leitung', player: 'Spieler', viewer: 'Zuschauer' }

function Section({
  title,
  children,
  description,
  danger,
}: {
  title: string
  description?: string
  children?: React.ReactNode
  /** Unwiderrufliche Aktionen optisch absetzen */
  danger?: boolean
}) {
  return (
    <section className={cn('grid gap-4 soft-card rounded-2xl p-6', danger && 'border-destructive/30 bg-destructive/[0.03]')}>
      <div>
        <h3 className={cn('font-display tracking-tight text-3xl font-extrabold', danger && 'text-destructive')}>{title}</h3>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

async function attempt<T>(action: () => Promise<T>, message?: string): Promise<T | undefined> {
  try {
    const result = await action()
    if (message) toast(message)
    return result
  } catch (error) {
    toastError(error)
    return undefined
  }
}

function MemberForm({ member, onDone }: { member: Member; onDone?: () => void }) {
  const [name, setName] = useState(member.display_name)
  const [color, setColor] = useState(member.color ?? '#ffb547')
  const [discord, setDiscord] = useState(member.discord_id ?? '')
  const [busy, setBusy] = useState(false)
  const t = useT()
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-start"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const saved = await attempt(
          () => rpc('update_member', { p_member_id: member.id, p_display_name: name, p_color: color, p_discord_id: discord }),
          t('Gespeichert'),
        )
        setBusy(false)
        if (saved) onDone?.()
      }}
    >
      <Field label={t('Name')}>
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
      </Field>
      <Field label={t('Farbe')}>
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 p-1" />
      </Field>
      <Field label={t('Discord-ID')} hint={t('Für den Bot: Rechtsklick auf dich → „Nutzer-ID kopieren“')}>
        <Input value={discord} onChange={(e) => setDiscord(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={25} />
      </Field>
      {/* Auf Höhe der Eingabefelder (unter den Beschriftungen), auch wenn die Discord-ID einen Hinweis darunter hat */}
      <Button type="submit" disabled={busy} className="sm:mt-[1.375rem] sm:h-10">
        {t('Speichern')}
      </Button>
    </form>
  )
}

export function SettingsPanel({ data, onChanged }: { data: ChallengeData; onChanged: () => Promise<void> }) {
  const { challenge, me, isOwner } = data
  const [ownLink, setOwnLink] = useState<string | null>(null)
  const t = useT()

  return (
    <div className="grid gap-6">
      {me ? (
        <Section title={t('Mein Platz')} description={t('Du bist hier {role}.', { role: t(roleLabel[me.role]) })}>
          <MemberForm member={me} onDone={() => void onChanged()} />
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="w-fit"
              onClick={async () => {
                const token = await attempt(() =>
                  rpc<string>('create_invite', { p_challenge_id: challenge.id, p_role: me.role, p_member_id: me.id, p_valid_hours: 24 }),
                )
                if (token) setOwnLink(inviteUrl(token))
              }}
            >
              <Smartphone /> {t('Weiteres Gerät verbinden')}
            </Button>
            {ownLink && <CopyLink url={ownLink} hint={t('Auf dem anderen Gerät öffnen. 24 Stunden gültig, einmal nutzbar.')} />}
          </div>
        </Section>
      ) : (
        <Section
          title={t('Zuschauen')}
          description={t('Du siehst diese Challenge nur. Mitspielen geht über einen Einladungslink der Leitung.')}
        />
      )}
      {isOwner && <OwnerSettings data={data} onChanged={onChanged} />}
    </div>
  )
}

function OwnerSettings({ data, onChanged }: { data: ChallengeData; onChanged: () => Promise<void> }) {
  const { challenge } = data
  const [devices, setDevices] = useState<Device[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [tokens, setTokens] = useState<BotToken[]>([])
  const [loadedAt, setLoadedAt] = useState(0)
  const [links, setLinks] = useState<Record<string, string>>({})
  const [editing, setEditing] = useState<string | null>(null)

  const [name, setName] = useState(challenge.name)
  const [visibility, setVisibility] = useState<Visibility>(challenge.visibility)
  const [allowUnlinked, setAllowUnlinked] = useState(challenge.bot_allow_unlinked)
  const [newPlayer, setNewPlayer] = useState('')
  const [inviteRole, setInviteRole] = useState<'player' | 'viewer'>('player')
  const [inviteUses, setInviteUses] = useState(1)
  const [botLabel, setBotLabel] = useState('Discord-Bot')
  const [newToken, setNewToken] = useState<string | null>(null)
  const [confirmSlug, setConfirmSlug] = useState('')
  const t = useT()

  const reload = useCallback(async () => {
    const client = db()
    const [d, i, b] = await Promise.all([
      client.from('member_devices').select('*').eq('challenge_id', challenge.id),
      client
        .from('challenge_invites')
        .select('id, challenge_id, role, member_id, max_uses, uses, expires_at, revoked_at, created_at')
        .eq('challenge_id', challenge.id)
        .order('created_at', { ascending: false }),
      client
        .from('bot_tokens')
        .select('id, challenge_id, label, last_used_at, revoked_at, created_at')
        .eq('challenge_id', challenge.id)
        .order('created_at', { ascending: false }),
    ])
    setDevices((d.data ?? []) as Device[])
    setInvites((i.data ?? []) as Invite[])
    setTokens((b.data ?? []) as BotToken[])
    setLoadedAt(Date.now())
  }, [challenge.id])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (active) void reload()
    })
    return () => {
      active = false
    }
  }, [reload, data.members])

  const memberLink = async (member: Member) => {
    const token = await attempt(() =>
      rpc<string>('create_invite', { p_challenge_id: challenge.id, p_role: member.role, p_member_id: member.id, p_valid_hours: 72 }),
    )
    if (token) {
      setLinks((all) => ({ ...all, [member.id]: inviteUrl(token) }))
      void reload()
    }
  }

  const openInvites = invites.filter((i) => !i.revoked_at && i.uses < i.max_uses && new Date(i.expires_at).getTime() > loadedAt)

  return (
    <>
      <Section title={t('Challenge')}>
        <form
          className="grid gap-4 md:grid-cols-[1fr_auto_auto] md:items-end"
          onSubmit={async (e) => {
            e.preventDefault()
            await attempt(
              () =>
                rpc('update_challenge', {
                  p_challenge_id: challenge.id,
                  p_name: name,
                  p_visibility: visibility,
                  p_bot_allow_unlinked: allowUnlinked,
                }),
              t('Gespeichert'),
            )
            await onChanged()
          }}
        >
          <Field label={t('Name')}>
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </Field>
          <Field label={t('Sichtbarkeit')}>
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="private">{t('Privat')}</option>
              <option value="public">{t('Öffentlich (Zuschauen ohne Link)')}</option>
            </Select>
          </Field>
          <Button type="submit">{t('Speichern')}</Button>
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input type="checkbox" checked={allowUnlinked} onChange={(e) => setAllowUnlinked(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            {t('Bot: Auch Discord-Nutzer ohne hinterlegte Discord-ID dürfen eintragen')}
          </label>
        </form>
      </Section>

      <LinkGroupsSection data={data} onChanged={onChanged} />
      <RulesSection data={data} onChanged={onChanged} />
      <TeamSyncSection data={data} onChanged={onChanged} />

      <Section
        title={t('Mitglieder & Geräte')}
        description={t(
          'Jeder Platz wird über einen persönlichen Link mit einem oder mehreren Geräten verbunden. Verlorenes Handy? Geräte abmelden und neuen Link schicken.',
        )}
      >
        <ul className="grid gap-3">
          {data.members.map((member) => {
            const count = devices.filter((d) => d.member_id === member.id).length
            const isMe = member.id === data.me?.id
            return (
              <li key={member.id} className="grid gap-3 rounded-xl border bg-background/60 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="size-3 rounded-full" style={{ background: member.color ?? 'var(--primary)' }} />
                  <span className="font-medium">{member.display_name}</span>
                  <span className="label text-[0.6rem] text-muted-foreground">{t(roleLabel[member.role])}</span>
                  <span className={count ? 'label text-[0.6rem] text-ok' : 'label text-[0.6rem] text-primary'}>
                    {count ? (count === 1 ? t('1 Gerät') : t('{count} Geräte', { count })) : t('Platz frei')}
                  </span>
                  {member.discord_id && <span className="label text-[0.6rem] text-muted-foreground">{t('Discord {id}', { id: member.discord_id })}</span>}
                  {member.link_group !== null && (
                    <span className="label text-[0.6rem] text-muted-foreground">{t('Paar {number}', { number: member.link_group + 1 })}</span>
                  )}
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(editing === member.id ? null : member.id)}>
                      <Pencil /> {t('Bearbeiten')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void memberLink(member)}>
                      <Link2 /> {t('Gerätelink')}
                    </Button>
                    {!isMe && count > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={async () => {
                          if (!window.confirm(t('Alle Geräte von {name} abmelden?', { name: member.display_name }))) return
                          await attempt(() => rpc('remove_member_devices', { p_member_id: member.id }), t('Geräte abgemeldet'))
                          void reload()
                        }}
                      >
                        <LogOut /> {t('Abmelden')}
                      </Button>
                    )}
                  </div>
                </div>
                {editing === member.id && (
                  <MemberForm
                    member={member}
                    onDone={() => {
                      setEditing(null)
                      void onChanged()
                    }}
                  />
                )}
                {links[member.id] && (
                  <CopyLink url={links[member.id]} hint={t('Für {name}: 72 Stunden gültig, einmal nutzbar.', { name: member.display_name })} />
                )}
              </li>
            )
          })}
        </ul>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const member = await attempt(() => rpc<Member>('add_player', { p_challenge_id: challenge.id, p_display_name: newPlayer }))
            if (member) {
              setNewPlayer('')
              await onChanged()
              await memberLink(member)
            }
          }}
        >
          <Field label={t('Spieler hinzufügen')}>
            <Input value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} placeholder="Linus" required maxLength={40} />
          </Field>
          <Button type="submit" variant="outline">
            <UserPlus /> {t('Hinzufügen & Link erstellen')}
          </Button>
        </form>
      </Section>

      <Section
        title={t('Offene Einladung')}
        description={t('Ein Link für Leute ohne festen Platz: Wer ihn öffnet, gibt seinen Namen ein und wird Spieler oder Zuschauer.')}
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const token = await attempt(() =>
              rpc<string>('create_invite', {
                p_challenge_id: challenge.id,
                p_role: inviteRole,
                p_valid_hours: 72,
                p_max_uses: inviteUses,
              }),
            )
            if (token) {
              setLinks((all) => ({ ...all, open: inviteUrl(token) }))
              void reload()
            }
          }}
        >
          <Field label={t('Rolle')}>
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'player' | 'viewer')}>
              <option value="player">{t('Spieler')}</option>
              <option value="viewer">{t('Zuschauer')}</option>
            </Select>
          </Field>
          <Field label={t('Nutzbar')}>
            <Input type="number" min={1} max={100} value={inviteUses} onChange={(e) => setInviteUses(Number(e.target.value))} className="w-24" />
          </Field>
          <Button type="submit" variant="outline">
            <Link2 /> {t('Link erstellen')}
          </Button>
        </form>
        {links.open && <CopyLink url={links.open} hint={t('72 Stunden gültig.')} />}
        {openInvites.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {openInvites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span>
                  {invite.member_id
                    ? t('Gerätelink für {name}', { name: data.members.find((m) => m.id === invite.member_id)?.display_name ?? '?' })
                    : invite.role === 'owner'
                      ? t('Leitungs-Einladung')
                      : invite.role === 'player'
                        ? t('Spieler-Einladung')
                        : t('Zuschauer-Einladung')}
                </span>
                <span className="text-muted-foreground">
                  {t('{uses}/{max} genutzt · bis {time}', { uses: invite.uses, max: invite.max_uses, time: formatTime(invite.expires_at) })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={async () => {
                    await attempt(() => rpc('revoke_invite', { p_invite_id: invite.id }), t('Einladung widerrufen'))
                    void reload()
                  }}
                >
                  {t('Widerrufen')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title={t('Discord-Bot')}
        description={t(
          'Der Bot bekommt nur dieses Token (plus den öffentlichen Key), nie einen geheimen Schlüssel. Er sieht und schreibt nur diese Challenge.',
        )}
      >
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const token = await attempt(() => rpc<string>('create_bot_token', { p_challenge_id: challenge.id, p_label: botLabel }))
            if (token) {
              setNewToken(token)
              void reload()
            }
          }}
        >
          <Field label={t('Bezeichnung')}>
            <Input value={botLabel} onChange={(e) => setBotLabel(e.target.value)} required maxLength={60} />
          </Field>
          <Button type="submit" variant="outline">
            <Bot /> {t('Token erstellen')}
          </Button>
        </form>
        {newToken && <CopyLink url={newToken} hint={t('Wird nur jetzt angezeigt. In der .env des Bots als SOULLINK_BOT_TOKEN eintragen.')} />}
        {tokens.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {tokens.map((token) => (
              <li key={token.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span className={token.revoked_at ? 'text-muted-foreground line-through' : ''}>{token.label}</span>
                <span className="text-muted-foreground">
                  {token.revoked_at
                    ? t('widerrufen {time}', { time: formatTime(token.revoked_at) })
                    : token.last_used_at
                      ? t('zuletzt aktiv {time}', { time: formatTime(token.last_used_at) })
                      : t('noch nie benutzt')}
                </span>
                {!token.revoked_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={async () => {
                      await attempt(() => rpc('revoke_bot_token', { p_token_id: token.id }), t('Token widerrufen'))
                      void reload()
                    }}
                  >
                    {t('Widerrufen')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section danger title={t('Challenge löschen')} description={t('Löscht alle Runs, Begegnungen und Ereignisse endgültig.')}>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const done = await attempt(
              () => rpc('delete_challenge', { p_challenge_id: challenge.id, p_confirm_slug: confirmSlug }).then(() => true),
              t('Challenge gelöscht'),
            )
            if (done) navigate('/', { replace: true })
          }}
        >
          <Field label={t('Zur Bestätigung „{slug}“ eingeben', { slug: challenge.slug })}>
            <Input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
          </Field>
          <Button type="submit" variant="destructive" disabled={confirmSlug !== challenge.slug}>
            <Trash2 /> {t('Endgültig löschen')}
          </Button>
        </form>
      </Section>
    </>
  )
}

/** Spielregeln: Level-Cap-Vorlage und Dupes-Clause */
function RulesSection({ data, onChanged }: { data: ChallengeData; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const t = useT()
  const detected = detectPreset(data.challenge.game)
  const save = async (preset: string | null, dupes: boolean) => {
    setBusy(true)
    const ok = await attempt(() =>
      rpc('set_challenge_rules', { p_challenge_id: data.challenge.id, p_level_cap_preset: preset ?? '', p_dupes_clause: dupes }).then(() => true),
    )
    await onChanged()
    setBusy(false)
    if (ok) toast(t('Spielregeln gespeichert'))
  }
  return (
    <Section
      title={t('Spielregeln')}
      description={t('Level-Caps und Pokédex-Daten richten sich nach dem Spiel. Dupes gelten immer für alle Spieler zusammen.')}
    >
      <div className="grid gap-4">
        <Field label={t('Level-Caps und Pokédex nach Spiel')}>
          <Select
            value={data.challenge.level_cap_preset ?? ''}
            disabled={busy}
            onChange={(e) => void save(e.target.value || null, data.challenge.dupes_clause)}
          >
            <option value="">
              {detected ? t('Automatisch (erkannt: {name})', { name: t(detected.name) }) : t('Automatisch (nicht erkannt)')}
            </option>
            {LEVEL_CAP_PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {t(p.name)}
              </option>
            ))}
            <option value="none">{t('Ohne Level-Cap')}</option>
          </Select>
        </Field>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-[var(--primary)]"
            checked={data.challenge.dupes_clause}
            disabled={busy}
            onChange={(e) => void save(data.challenge.level_cap_preset, e.target.checked)}
          />
          <span>
            <span className="font-medium">{t('Dupes-Clause')}</span>
            <span className="block text-muted-foreground">
              {t('Warnt beim Eintragen, wenn die Entwicklungsreihe in diesem Run schon von irgendwem gefangen wurde.')}
            </span>
          </span>
        </label>
      </div>
    </Section>
  )
}

/** Teams angleichen: zieht ein Teamwechsel die Soul-Link-Partner der anderen mit? */
function TeamSyncSection({ data, onChanged }: { data: ChallengeData; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const t = useT()
  const set = async (enabled: boolean) => {
    setBusy(true)
    const ok = await attempt(() => rpc('set_team_sync', { p_challenge_id: data.challenge.id, p_enabled: enabled }).then(() => true))
    await onChanged()
    setBusy(false)
    if (ok) toast(enabled ? t('Teams werden automatisch angeglichen') : t('Teams werden nicht mehr angeglichen'))
  }
  return (
    <Section
      title={t('Teams angleichen')}
      description={t(
        'Kommt ein Pokémon ins Team oder in die Box, wechseln seine Soul-Link-Partner bei den anderen mit (wild und Static getrennt). Einzelne Wechsel lassen sich trotzdem nur für ein Team machen: Schalter „Teams angleichen“ im Tab Teams oder Shift beim Ablegen.',
      )}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            { enabled: true, title: t('Automatisch'), text: t('Teamwechsel gelten für alle verbundenen Teams. Die anderen bekommen einen Hinweis.') },
            { enabled: false, title: t('Aus'), text: t('Jeder ändert nur sein eigenes Team.') },
          ] as const
        ).map((option) => {
          const active = data.challenge.team_sync === option.enabled
          return (
            <button
              key={String(option.enabled)}
              type="button"
              disabled={busy || active}
              onClick={() => void set(option.enabled)}
              className={
                active
                  ? 'rounded-xl border-2 border-primary bg-primary/5 p-4 text-left'
                  : 'rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-60'
              }
            >
              <span className="font-display tracking-tight text-xl font-bold">{option.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{option.text}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

/** Soul-Link-Modus: alle Spieler gemeinsam oder Paare in Sitzreihenfolge (wie im Discord-Bot) */
function LinkGroupsSection({ data, onChanged }: { data: ChallengeData; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const t = useT()
  const pairs = data.players.length > 0 && data.players.every((p, i) => p.link_group === Math.floor(i / 2))
  const all = data.players.every((p) => p.link_group === null)

  const apply = async (mode: 'all' | 'pairs') => {
    setBusy(true)
    let ok = true
    for (const [index, player] of data.players.entries()) {
      const group = mode === 'pairs' ? Math.floor(index / 2) : null
      if (player.link_group === group) continue
      const done = await attempt(() => rpc('set_member_link_group', { p_member_id: player.id, p_link_group: group }).then(() => true))
      if (!done) {
        ok = false
        break
      }
    }
    await onChanged()
    setBusy(false)
    if (ok) toast(mode === 'pairs' ? t('Soul-Links jetzt paarweise') : t('Soul-Links jetzt für alle gemeinsam'))
  }

  const pairLabel = (index: number) =>
    data.players
      .filter((_, i) => Math.floor(i / 2) === index)
      .map((p) => p.display_name)
      .join(' ↔ ')

  return (
    <Section
      title={t('Soul-Links')}
      description={t('Wer ist mit wem verbunden? Gilt für neue Begegnungen; bestehende Soul-Links bleiben, wie sie sind.')}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            {
              mode: 'all',
              title: t('Alle verbunden'),
              text: t('Stirbt ein Pokémon, sterben die Pokémon aller Spieler auf dieser Route.'),
              active: all,
            },
            {
              mode: 'pairs',
              title: t('Paare'),
              text: Array.from({ length: Math.ceil(data.players.length / 2) }, (_, i) => pairLabel(i)).join(' · ') || t('Spieler 1↔2, 3↔4 …'),
              active: pairs,
            },
          ] as const
        ).map((option) => (
          <button
            key={option.mode}
            type="button"
            disabled={busy || option.active}
            onClick={() => void apply(option.mode)}
            className={
              option.active
                ? 'rounded-xl border-2 border-primary bg-primary/5 p-4 text-left'
                : 'rounded-xl border-2 border-border p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-60'
            }
          >
            <span className="font-display tracking-tight text-xl font-bold">{option.title}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{option.text}</span>
          </button>
        ))}
      </div>
    </Section>
  )
}
