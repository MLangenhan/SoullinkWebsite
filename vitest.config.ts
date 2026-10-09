import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

// Unit-Tests der Spiellogik (src/lib, src/data) in Node, ohne Browser und ohne Datenbank
export default defineConfig((env) =>
  mergeConfig(
    viteConfig(env),
    defineConfig({
      test: {
        include: ['src/**/*.test.ts'],
        environment: 'node',
        setupFiles: ['src/test/setup.ts'],
        coverage: {
          provider: 'v8',
          include: ['src/lib/**/*.ts', 'src/data/**/*.ts'],
          // Netzwerk, Supabase und React-Hooks prüfen die E2E-Tests
          exclude: ['src/lib/supabase.ts', 'src/lib/actions.ts', 'src/lib/router.ts', 'src/lib/toast.ts', 'src/lib/utils.ts', 'src/lib/types.ts'],
          reporter: ['text-summary', 'html', 'json-summary'],
          // Untergrenze knapp unter dem aktuellen Stand: Neue Logik kommt mit Tests
          thresholds: { lines: 65, statements: 65, functions: 65, branches: 50 },
        },
      },
    }),
  ),
)
