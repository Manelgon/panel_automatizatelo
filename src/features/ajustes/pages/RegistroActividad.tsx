import { useEffect, useMemo, useState } from 'react';
import { ScrollText, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import { useNotifications } from '../../../context/NotificationContext';

// Los contextos siguen en .jsx: en la frontera con TSX se tipa a mano lo que
// se usa. Cuando migren a .tsx, esto sobra.
type Notificador = { showNotification: (mensaje: string, tipo?: 'success' | 'error') => void };
import type { Auditoria, Usuario, Json } from '../../../lib/database.types';

// =============================================================================
// REGISTRO DE ACTIVIDAD — la pantalla de audit_logs (migración 018)
// =============================================================================
// Primera página escrita en TypeScript, siguiendo la regla de la fase 4f:
// lo nuevo nace tipado.
// =============================================================================

// Sin joins incrustados: nuestros tipos no declaran relaciones, así que el
// usuario se resuelve con una segunda consulta plana y un mapa.
type Usuarios = Record<string, string>;

const FAMILIAS: Record<string, { label: string; clase: string }> = {
    factura: { label: 'Facturas', clase: 'text-primary bg-primary/10 border-primary/30' },
    cobro: { label: 'Cobros', clase: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    certificado: { label: 'Certificados', clase: 'text-violet-400 bg-violet-500/10 border-violet-500/30' },
    lead: { label: 'Leads', clase: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
    retencion: { label: 'Retención', clase: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

const familiaDe = (accion: string) => accion.split('.')[0] || 'otro';

/** El metadata, legible: "importe: 121 · metodo: efectivo" */
const metadataLegible = (m: Json): string => {
    if (!m || typeof m !== 'object' || Array.isArray(m)) return '';
    return Object.entries(m)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
        .join(' · ');
};

export default function RegistroActividad() {
    const { showNotification } = useNotifications() as Notificador;

    const [cargando, setCargando] = useState(true);
    const [filas, setFilas] = useState<Auditoria[]>([]);
    const [usuarios, setUsuarios] = useState<Usuarios>({});
    const [familia, setFamilia] = useState<string>('todas');
    const [busqueda, setBusqueda] = useState('');

    const cargar = async () => {
        setCargando(true);
        const [logs, personas] = await Promise.all([
            supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(300),
            supabase.from('users').select('*'),
        ]);

        // Conversión local: las lecturas vienen sin tipar (ver database.types.ts)
        const gente = (personas.data as Usuario[] | null) ?? [];
        const mapa: Usuarios = {};
        for (const u of gente) {
            mapa[u.id] = [u.nombre, u.apellido1].filter(Boolean).join(' ') || 'Usuario';
        }
        setUsuarios(mapa);

        const { data, error } = logs;
        if (error) {
            showNotification(
                error.message.includes('does not exist')
                    ? 'Falta la migración 018: la tabla audit_logs no existe todavía.'
                    : `Error cargando el registro: ${error.message}`,
                'error',
            );
        }
        setFilas((data as Auditoria[] | null) ?? []);
        setCargando(false);
    };

    useEffect(() => { cargar(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

    const filtradas = useMemo(() => filas.filter((f) => {
        if (familia !== 'todas' && familiaDe(f.accion) !== familia) return false;
        if (busqueda.trim()) {
            const q = busqueda.toLowerCase();
            return (
                f.accion.toLowerCase().includes(q)
                || (f.recurso_label ?? '').toLowerCase().includes(q)
                || metadataLegible(f.metadata).toLowerCase().includes(q)
            );
        }
        return true;
    }), [filas, familia, busqueda]);

    const nombreUsuario = (f: Auditoria) =>
        (f.user_id ? usuarios[f.user_id] ?? 'Usuario' : 'Sistema');

    return (
        <div className="flex flex-col min-h-screen transition-colors duration-300 overflow-hidden">
            <BarraNavegacion />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Configuración</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <ScrollText className="text-primary" /> Registro de actividad
                        </h1>
                        <p className="text-sm text-variable-muted mt-1">
                            Quién hizo qué, y cuándo. Solo lectura: nada de esto se puede editar ni borrar desde el panel.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={cargar} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary" title="Actualizar">
                            <RefreshCw size={18} className={cargando ? 'animate-spin' : ''} />
                        </button>
                    </div>
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap items-center gap-2 mb-6">
                    {['todas', ...Object.keys(FAMILIAS)].map((id) => (
                        <button
                            key={id}
                            onClick={() => setFamilia(id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                familia === id ? 'bg-primary text-white' : 'glass border border-variable text-variable-muted hover:text-primary'
                            }`}
                        >
                            {id === 'todas' ? 'Todas' : FAMILIAS[id].label}
                        </button>
                    ))}
                    <div className="relative ml-auto min-w-[220px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-variable-muted" />
                        <input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar acción, recurso…"
                            className="w-full glass border border-variable focus:border-primary rounded-xl pl-9 pr-3 py-2.5 text-sm text-variable-main placeholder:text-variable-muted outline-none"
                        />
                    </div>
                </div>

                <div className="glass rounded-2xl border border-variable p-6">
                    {cargando ? (
                        <div className="py-16 flex justify-center">
                            <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : filtradas.length === 0 ? (
                        <div className="py-16 text-center">
                            <ShieldCheck size={36} className="mx-auto text-variable-muted opacity-40 mb-3" />
                            <p className="text-sm text-variable-muted">
                                {filas.length === 0
                                    ? 'Todavía no hay actividad registrada. Aparecerá al emitir facturas, registrar cobros o certificar.'
                                    : 'Nada coincide con el filtro.'}
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtradas.map((f) => {
                                const fam = FAMILIAS[familiaDe(f.accion)];
                                const meta = metadataLegible(f.metadata);
                                return (
                                    <div key={f.id} className="flex items-start gap-4 p-4 rounded-xl bg-white/5 border border-variable">
                                        <span className={`shrink-0 px-2 py-1 rounded-lg border text-[10px] font-bold ${fam?.clase ?? 'text-variable-muted border-variable'}`}>
                                            {f.accion}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm text-variable-main font-bold truncate">
                                                {f.recurso_label || f.recurso_id || '—'}
                                            </p>
                                            {meta && <p className="text-xs text-variable-muted truncate">{meta}</p>}
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <p className="text-xs font-bold text-variable-main">{nombreUsuario(f)}</p>
                                            <p className="text-[10px] text-variable-muted">
                                                {new Date(f.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
}
