import { createClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || ''

// Use the current origin so all Supabase requests go through the proxy:
// - DEV: Vite dev server proxy (vite.config.js) on localhost:5173
// - PROD: Vercel rewrites (vercel.json) on the deployed domain
// This completely avoids CORS issues with the self-hosted Supabase instance.
const supabaseUrl = typeof window !== 'undefined' ? window.location.origin : ''

if (!supabaseAnonKey) {
    console.warn('Supabase ANON KEY no configurada. La aplicación podría fallar.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)


