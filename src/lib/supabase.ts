import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || '';

if (!supabaseAnonKey || !supabaseUrl) {
    console.warn('Supabase URL o ANON KEY no configuradas. La aplicación podría fallar.');
}

// Tipado con el esquema real (src/lib/database.types.ts): a partir de aquí,
// .from('tabla') conoce sus columnas en los ficheros TypeScript. Una consulta a
// una columna inexistente — el fallo de users.full_name, por ejemplo — deja de
// compilar en vez de fallar en el navegador.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
    },
});
