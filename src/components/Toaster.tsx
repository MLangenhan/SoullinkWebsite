import { AnimatePresence, motion } from 'motion/react'
import { ArrowLeftRight, CircleAlert, CircleCheck, X } from 'lucide-react'
import { useT } from '@/lib/i18n'
import { dismiss, useToasts } from '@/lib/toast'
import { cn } from '@/lib/utils'

export function Toaster() {
  const t = useT()
  const toasts = useToasts()
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 p-4" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((item) => (
          <motion.div
            key={item.id}
            layout
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            role={item.kind === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border bg-popover px-4 py-3 text-sm shadow-xl',
              item.kind === 'error' ? 'border-destructive/60' : item.kind === 'info' ? 'border-primary/50' : 'border-ok/50',
            )}
          >
            {item.kind === 'error' ? (
              <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            ) : item.kind === 'info' ? (
              <ArrowLeftRight className="mt-0.5 size-4 shrink-0 text-primary" />
            ) : (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />
            )}
            <span className="flex-1">{item.text}</span>
            {item.action && (
              <button
                onClick={() => {
                  dismiss(item.id)
                  item.action!.run()
                }}
                className="font-medium whitespace-nowrap text-primary hover:underline"
              >
                {item.action.label}
              </button>
            )}
            <button onClick={() => dismiss(item.id)} aria-label={t('Meldung schließen')} className="text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
