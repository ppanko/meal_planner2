import fs from 'node:fs'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

function parseSecretsFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {}

  const result: Record<string, string> = {}

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) continue

    const equals = line.indexOf('=')
    if (equals < 1) continue

    const key = line.slice(0, equals).trim()
    let value = line.slice(equals + 1).trim()

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    result[key] = value
  }

  return result
}

export default defineConfig(() => {
  const localSecrets = parseSecretsFile(path.resolve(process.cwd(), '.secrets'))

  // GitHub Actions and other CI systems can provide the same names as
  // environment variables. Local .secrets takes precedence when present.
  const config = {
    VITE_SUPABASE_URL:
      localSecrets.VITE_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
    VITE_SUPABASE_PUBLISHABLE_KEY:
      localSecrets.VITE_SUPABASE_PUBLISHABLE_KEY ??
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      '',
    VITE_SUPABASE_STATE_ID:
      localSecrets.VITE_SUPABASE_STATE_ID ??
      process.env.VITE_SUPABASE_STATE_ID ??
      'household',
  }

  return {
    // Relative base keeps GitHub Pages project sites working.
    base: './',
    plugins: [react()],
    define: Object.fromEntries(
      Object.entries(config).map(([key, value]) => [
        `import.meta.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
  }
})
