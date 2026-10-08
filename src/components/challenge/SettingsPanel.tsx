import { useCallback, useEffect, useState } from 'react'
import { Bot, Link2, LogOut, Pencil, Smartphone, Trash2, UserPlus } from 'lucide-react'
import { CopyLink } from '@/components/CopyLink'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/input'
import type { ChallengeData } from '@/hooks/useChallenge'
import { inviteUrl } from '@/lib/actions'
import { formatTime } from '@/lib/describe'
import { navigate } from '@/lib/router'
import { db, rpc } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'
import type { BotToken, Device, Invite, Member, Role, Visibility } from '@/lib/types'

const roleLabel: Record<Role, string> = { owner: 'Leitung', player: 'Spieler', viewer: 'Zuschauer' }

function Section({ title, children, description }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card/60 p-6">
      <div>
        <h3 className="font-display text-3xl font-extrabold uppercase">{title}</h3>
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
  return (
    <form
      className="grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-end"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        const saved = await attempt(
          () => rpc('update_member', { p_member_id: member.id, p_display_name: name, p_color: color, p_discord_id: discord }),
          'Gespeichert',
        )
        setBusy(false)
        if (saved) onDone?.()
      }}
    >
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
      </Field>
      <Field label="Farbe">
        <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-16 p-1" />
      </Field>
      <Field label="Discord-ID" hint="Für den Bot: Rechtsklick auf dich → „Nutzer-ID kopieren“">
        <Input value={discord} onChange={(e) => setDiscord(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={25} />
      </Field>
      <Button type="submit" disabled={busy}>
        Speichern
      </Button>
    </form>
  )
}

export function SettingsPanel({ data, onChanged }: { data: ChallengeData; onChanged: () => Promise<void> }) {
  const { challenge, me, isOwner } = data
  const [ownLink, setOwnLink] = useState<string | null>(null)

  return (
    <div className="grid gap-6">
      {me ? (
        <Section title="Mein Platz" description={`Du bist hier ${roleLabel[me.role]}.`}>
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
              <Smartphone /> Weiteres Gerät verbinden
            </Button>
            {ownLink && <CopyLink url={ownLink} hint="Auf dem anderen Gerät öffnen. 24 Stunden gültig, einmal nutzbar." />}
          </div>
        </Section>
      ) : (
        <Section title="Zuschauen" description="Du siehst diese Challenge nur. Mitspielen geht über einen Einladungslink der Leitung." />
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

  const reload = useCallback(async () => {
    const client = db()
    const [d, i, t] = await Promise.all([
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
    setTokens((t.data ?? []) as BotToken[])
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
      <Section title="Challenge">
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
              'Gespeichert',
            )
            await onChanged()
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </Field>
          <Field label="Sichtbarkeit">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="private">Privat</option>
              <option value="public">Öffentlich (Zuschauen ohne Link)</option>
            </Select>
          </Field>
          <Button type="submit">Speichern</Button>
          <label className="flex items-center gap-2 text-sm md:col-span-3">
            <input type="checkbox" checked={allowUnlinked} onChange={(e) => setAllowUnlinked(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            Bot: Auch Discord-Nutzer ohne hinterlegte Discord-ID dürfen eintragen
          </label>
        </form>
      </Section>

      <Section
        title="Mitglieder & Geräte"
        description="Jeder Platz wird über einen persönlichen Link mit einem oder mehreren Geräten verbunden. Verlorenes Handy? Geräte abmelden und neuen Link schicken."
      >
        <ul className="grid gap-3">
          {data.members.map((member) => {
            const count = devices.filter((d) => d.member_id === member.id).length
            const isMe = member.id === data.me?.id
            return (
              <li key={member.id} className="grid gap-3 rounded-lg border bg-background/40 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="size-3 rounded-full" style={{ background: member.color ?? 'var(--primary)' }} />
                  <span className="font-medium">{member.display_name}</span>
                  <span className="label text-[0.6rem] text-muted-foreground">{roleLabel[member.role]}</span>
                  <span className={count ? 'label text-[0.6rem] text-ok' : 'label text-[0.6rem] text-primary'}>
                    {count ? `${count} ${count === 1 ? 'Gerät' : 'Geräte'}` : 'Platz frei'}
                  </span>
                  {member.discord_id && <span className="label text-[0.6rem] text-muted-foreground">Discord {member.discord_id}</span>}
                  <div className="ml-auto flex flex-wrap gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(editing === member.id ? null : member.id)}>
                      <Pencil /> Bearbeiten
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void memberLink(member)}>
                      <Link2 /> Gerätelink
                    </Button>
                    {!isMe && count > 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={async () => {
                          if (!window.confirm(`Alle Geräte von ${member.display_name} abmelden?`)) return
                          await attempt(() => rpc('remove_member_devices', { p_member_id: member.id }), 'Geräte abgemeldet')
                          void reload()
                        }}
                      >
                        <LogOut /> Abmelden
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
                  <CopyLink url={links[member.id]} hint={`Für ${member.display_name}: 72 Stunden gültig, einmal nutzbar.`} />
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
          <Field label="Spieler hinzufügen">
            <Input value={newPlayer} onChange={(e) => setNewPlayer(e.target.value)} placeholder="Linus" required maxLength={40} />
          </Field>
          <Button type="submit" variant="outline">
            <UserPlus /> Hinzufügen & Link erstellen
          </Button>
        </form>
      </Section>

      <Section title="Offene Einladung" description="Ein Link für Leute ohne festen Platz: Wer ihn öffnet, gibt seinen Namen ein und wird Spieler oder Zuschauer.">
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
          <Field label="Rolle">
            <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as 'player' | 'viewer')}>
              <option value="player">Spieler</option>
              <option value="viewer">Zuschauer</option>
            </Select>
          </Field>
          <Field label="Nutzbar">
            <Input type="number" min={1} max={100} value={inviteUses} onChange={(e) => setInviteUses(Number(e.target.value))} className="w-24" />
          </Field>
          <Button type="submit" variant="outline">
            <Link2 /> Link erstellen
          </Button>
        </form>
        {links.open && <CopyLink url={links.open} hint="72 Stunden gültig." />}
        {openInvites.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {openInvites.map((invite) => (
              <li key={invite.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span>
                  {invite.member_id
                    ? `Gerätelink für ${data.members.find((m) => m.id === invite.member_id)?.display_name ?? '?'}`
                    : `${roleLabel[invite.role]}-Einladung`}
                </span>
                <span className="text-muted-foreground">
                  {invite.uses}/{invite.max_uses} genutzt · bis {formatTime(invite.expires_at)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto text-destructive"
                  onClick={async () => {
                    await attempt(() => rpc('revoke_invite', { p_invite_id: invite.id }), 'Einladung widerrufen')
                    void reload()
                  }}
                >
                  Widerrufen
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        title="Discord-Bot"
        description="Der Bot bekommt nur dieses Token (plus den öffentlichen Key), nie einen geheimen Schlüssel. Er sieht und schreibt nur diese Challenge."
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
          <Field label="Bezeichnung">
            <Input value={botLabel} onChange={(e) => setBotLabel(e.target.value)} required maxLength={60} />
          </Field>
          <Button type="submit" variant="outline">
            <Bot /> Token erstellen
          </Button>
        </form>
        {newToken && <CopyLink url={newToken} hint="Wird nur jetzt angezeigt. In der .env des Bots als SOULLINK_BOT_TOKEN eintragen." />}
        {tokens.length > 0 && (
          <ul className="grid gap-2 text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 rounded-md border px-3 py-2">
                <span className={t.revoked_at ? 'text-muted-foreground line-through' : ''}>{t.label}</span>
                <span className="text-muted-foreground">
                  {t.revoked_at
                    ? `widerrufen ${formatTime(t.revoked_at)}`
                    : t.last_used_at
                      ? `zuletzt aktiv ${formatTime(t.last_used_at)}`
                      : 'noch nie benutzt'}
                </span>
                {!t.revoked_at && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive"
                    onClick={async () => {
                      await attempt(() => rpc('revoke_bot_token', { p_token_id: t.id }), 'Token widerrufen')
                      void reload()
                    }}
                  >
                    Widerrufen
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Challenge löschen" description="Löscht alle Runs, Begegnungen und Ereignisse endgültig.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            const done = await attempt(
              () => rpc('delete_challenge', { p_challenge_id: challenge.id, p_confirm_slug: confirmSlug }).then(() => true),
              'Challenge gelöscht',
            )
            if (done) navigate('/', { replace: true })
          }}
        >
          <Field label={`Zur Bestätigung „${challenge.slug}“ eingeben`}>
            <Input value={confirmSlug} onChange={(e) => setConfirmSlug(e.target.value)} />
          </Field>
          <Button type="submit" variant="destructive" disabled={confirmSlug !== challenge.slug}>
            <Trash2 /> Endgültig löschen
          </Button>
        </form>
      </Section>
    </>
  )
}
