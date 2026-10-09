import { useState } from 'react'
import { motion } from 'motion/react'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useT } from '@/lib/i18n'

/** Zeigt einen geheimen Link einmalig an, mit Kopierknopf. */
export function CopyLink({ url, hint }: { url: string; hint?: string }) {
  const t = useT()
  const [copied, setCopied] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid gap-2 rounded-lg border border-primary/50 bg-primary/5 p-3"
    >
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void navigator.clipboard.writeText(url).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 2000)
            })
          }}
        >
          {copied ? <Check /> : <Copy />} {copied ? t('Kopiert') : t('Kopieren')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{hint ?? t('Wird nur jetzt angezeigt. Nur an die richtige Person schicken.')}</p>
    </motion.div>
  )
}
