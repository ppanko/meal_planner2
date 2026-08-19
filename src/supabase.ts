import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    'Supabase is not configured. Create .secrets from .secrets.example and add the Supabase project values.',
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://example.invalid',
  supabaseKey || 'missing-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  },
)

export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey)

export const allowedEmails = (import.meta.env.VITE_ALLOWED_EMAILS ?? '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean)

export const sharedStateId =
  import.meta.env.VITE_SUPABASE_STATE_ID?.trim() || 'household'
