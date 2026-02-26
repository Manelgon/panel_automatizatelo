import { createClient } from '@supabase/supabase-js'

const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || ''
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || ''

if (!supabaseAnonKey || !supabaseUrl) {
    console.warn('Supabase URL o ANON KEY no configuradas. La aplicación podría fallar.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
})
