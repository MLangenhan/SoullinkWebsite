// Tests laufen auf Deutsch (wie die Website ohne gespeicherte Sprache in einem deutschen Browser)
Object.defineProperty(globalThis, 'navigator', { value: { language: 'de-DE' }, configurable: true })
