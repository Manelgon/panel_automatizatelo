import { supabase } from './supabase';
import type { Json } from './database.types';

// =============================================================================
// AUDITORÍA — quién hizo qué, y cuándo
// =============================================================================
// Envoltorio de la función registrar_accion (migración 018). La tabla no admite
// INSERT directo: solo se escribe por esta vía, con el usuario de la sesión.
//
// Es deliberadamente a prueba de fallos: la auditoría NUNCA rompe la acción que
// audita. Si la migración no está aplicada o la red falla, queda un aviso en
// consola y la vida sigue.
// =============================================================================

export async function registrarAccion(
    accion: string,
    opts: {
        tipo?: string;
        id?: string | null;
        label?: string | null;
        metadata?: Json;
    } = {},
): Promise<void> {
    try {
        // supabase-js 2.97 resuelve rpc() por una ruta sin tipos (comprobado:
        // acepta cualquier nombre de funcion y rechaza argumentos tipados).
        // Rodeo local con la firma real; revisar al actualizar la libreria.
        const rpc = supabase.rpc.bind(supabase) as unknown as (
            fn: 'registrar_accion',
            args: {
                p_accion: string;
                p_recurso_tipo: string | null;
                p_recurso_id: string | null;
                p_recurso_label: string | null;
                p_metadata: Json;
            },
        ) => Promise<{ error: { message: string } | null }>;

        const { error } = await rpc('registrar_accion', {
            p_accion: accion,
            p_recurso_tipo: opts.tipo ?? null,
            p_recurso_id: opts.id ?? null,
            p_recurso_label: opts.label ?? null,
            p_metadata: opts.metadata ?? {},
        });
        if (error) console.warn('[auditoria]', accion, error.message);
    } catch (e) {
        console.warn('[auditoria]', accion, e);
    }
}
