import { useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/input'
import { navigate } from '@/lib/router'
import { ensureSession, rpc } from '@/lib/supabase'
import { toast, toastError } from '@/lib/toast'
import { toSlug } from '@/lib/slug'
import type { Challenge, Visibility } from '@/lib/types'

export function CreateChallengeDialog() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugTouched, setSlugTouched] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('private')
  const [busy, setBusy] = useState(false)

  const effectiveSlug = slugTouched ? slug : toSlug(name)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await ensureSession()
      const challenge = await rpc<Challenge>('create_challenge', {
        p_name: name,
        p_slug: effectiveSlug,
        p_display_name: displayName,
        p_visibility: visibility,
      })
      toast('Challenge angelegt. Lade jetzt deine Mitspieler ein.')
      setOpen(false)
      navigate(`/c/${challenge.slug}?tab=einstellungen`)
    } catch (error) {
      toastError(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="lg">
          <Plus /> Neue Challenge
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-black uppercase">Neue Challenge</DialogTitle>
          <DialogDescription>
            Kein Konto nötig: Dieses Gerät wird mit deinem Platz verbunden. Weitere Geräte und Mitspieler kommen per Link dazu.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Platin Randomizer" required maxLength={80} autoFocus />
          </Field>
          <Field label="Adresse" hint={`soullink…/c/${effectiveSlug || '…'}`}>
            <Input
              value={effectiveSlug}
              onChange={(e) => {
                setSlugTouched(true)
                setSlug(toSlug(e.target.value))
              }}
              required
              minLength={3}
              maxLength={40}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
            />
          </Field>
          <Field label="Dein Name">
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Moritz" required maxLength={40} />
          </Field>
          <Field label="Sichtbarkeit" hint="Öffentlich: Jeder mit der Adresse kann zuschauen (nur lesen).">
            <Select value={visibility} onChange={(e) => setVisibility(e.target.value as Visibility)}>
              <option value="private">Privat</option>
              <option value="public">Öffentlich</option>
            </Select>
          </Field>
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? 'Wird angelegt …' : 'Challenge starten'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
