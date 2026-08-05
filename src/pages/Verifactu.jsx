import { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, AlertTriangle, RefreshCw, FileCode, Sun, Moon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { registrarVerifactu } from '../lib/facturas';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';

const BADGE = {
    pendiente:  'bg-zinc-500/15 text-zinc-400',
    enviado:    'bg-blue-500/15 text-blue-400',
    aceptado:   'bg-emerald-500/15 text-emerald-400',
    rechazado:  'bg-red-500/15 text-red-400',
    error:      'bg-amber-500/15 text-amber-400',
};

export default function Verifactu() {
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [registros, setRegistros] = useState([]);
    const [facturasSinRegistro, setFacturasSinRegistro] = useState([]);
    const [filtroTipo, setFiltroTipo] = useState('todos');
    const [filtroEstado, setFiltroEstado] = useState('todos');
    const [search, setSearch] = useState('');

    const fetchData = async () => {
        setLoading(true);
        const [{ data: regs }, { data: facs }] = await Promise.all([
            supabase
                .from('verifactu_registros')
                .select('*')
                .order('num_registro', { ascending: false }),
            supabase
                .from('facturas')
                .select('id, numero, fecha_emision, total, estado, verifactu_alta_id')
                .is('verifactu_alta_id', null)
                .order('fecha_emision', { ascending: false }),
        ]);
        setRegistros(regs || []);
        setFacturasSinRegistro(facs || []);
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
        const ch = supabase.channel('verifactu-dash')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'verifactu_registros' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, fetchData)
            .subscribe();
        return () => { supabase.removeChannel(ch); };
    }, []);

    const ultimo = registros[0];
    const stats = useMemo(() => ({
        total: registros.length,
        alta: registros.filter(r => r.tipo === 'alta').length,
        anulacion: registros.filter(r => r.tipo === 'anulacion').length,
        pendientes: registros.filter(r => r.estado_envio === 'pendiente').length,
        errores: registros.filter(r => r.estado_envio === 'error' || r.estado_envio === 'rechazado').length,
    }), [registros]);

    const filtered = registros.filter(r => {
        if (filtroTipo !== 'todos' && r.tipo !== filtroTipo) return false;
        if (filtroEstado !== 'todos' && r.estado_envio !== filtroEstado) return false;
        if (search) {
            const q = search.toLowerCase();
            return (r.numero_factura || '').toLowerCase().includes(q) || (r.huella || '').toLowerCase().includes(q);
        }
        return true;
    });

    const handleDescargarXml = (registro) => {
        if (!registro.xml_payload) {
            showNotification('Este registro no tiene XML guardado', 'error');
            return;
        }
        const blob = new Blob([registro.xml_payload], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `verifactu-${registro.numero_factura}-${registro.tipo}.xml`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleRegistrarFalta = async (facturaId) => {
        const res = await registrarVerifactu(facturaId, 'alta');
        if (res.error) showNotification(`Error: ${res.error}`, 'error');
        else showNotification(`Registro creado · huella ${res.huella?.slice(0, 12)}…`, 'success');
        fetchData();
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Cumplimiento fiscal</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <ShieldCheck className="text-primary" /> Veri*factu
                        </h1>
                        <p className="text-xs text-variable-muted mt-1">
                            Cadena SHA-256 conforme al RD 1007/2023. El envío AEAT se activa cuando esté disponible el certificado FNMT.
                        </p>
                    </div>
                    <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary self-start sm:self-auto">
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                    <Stat label="Registros" value={stats.total} />
                    <Stat label="Altas" value={stats.alta} />
                    <Stat label="Anulaciones" value={stats.anulacion} />
                    <Stat label="Pendientes / Error" value={stats.pendientes + stats.errores} tone={stats.errores > 0 ? 'warn' : null} />
                </div>

                {/* Última huella */}
                {ultimo && (
                    <div className="glass rounded-2xl border border-variable p-5 mb-6">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-2">Última huella</p>
                        <p className="font-mono text-[11px] text-variable-main break-all">{ultimo.huella}</p>
                        <p className="text-xs text-variable-muted mt-2">
                            Nº {ultimo.num_registro} · {ultimo.tipo === 'anulacion' ? 'Anulación' : 'Alta'} · {ultimo.numero_factura} · {new Date(ultimo.fecha_hora_generacion).toLocaleString('es-ES')}
                        </p>
                    </div>
                )}

                {/* Facturas sin registro */}
                {facturasSinRegistro.length > 0 && (
                    <div className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 mb-6">
                        <p className="text-sm font-bold text-amber-300 mb-3 flex items-center gap-2">
                            <AlertTriangle size={16} /> {facturasSinRegistro.length} factura{facturasSinRegistro.length === 1 ? '' : 's'} sin registro Veri*factu
                        </p>
                        <div className="space-y-2">
                            {facturasSinRegistro.slice(0, 10).map(f => (
                                <div key={f.id} className="flex items-center justify-between gap-3 text-sm">
                                    <span className="font-mono text-variable-main">{f.numero}</span>
                                    <span className="text-variable-muted text-xs">€{parseFloat(f.total).toFixed(2)} · {new Date(f.fecha_emision).toLocaleDateString('es-ES')}</span>
                                    <button
                                        onClick={() => handleRegistrarFalta(f.id)}
                                        className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:brightness-110"
                                    >
                                        <RefreshCw size={12} className="inline mr-1" /> Registrar
                                    </button>
                                </div>
                            ))}
                            {facturasSinRegistro.length > 10 && (
                                <p className="text-xs text-variable-muted pt-2">+ {facturasSinRegistro.length - 10} más…</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Filtros + buscador */}
                <div className="flex flex-wrap gap-2 mb-4">
                    <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
                        className="glass border border-variable rounded-xl px-3 py-2 text-sm text-variable-main outline-none">
                        <option value="todos">Todos los tipos</option>
                        <option value="alta">Alta</option>
                        <option value="anulacion">Anulación</option>
                    </select>
                    <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
                        className="glass border border-variable rounded-xl px-3 py-2 text-sm text-variable-main outline-none">
                        <option value="todos">Todos los estados</option>
                        <option value="pendiente">Pendiente</option>
                        <option value="enviado">Enviado</option>
                        <option value="aceptado">Aceptado</option>
                        <option value="rechazado">Rechazado</option>
                        <option value="error">Error</option>
                    </select>
                    <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nº factura o huella…"
                        className="flex-1 min-w-[200px] glass border border-variable rounded-xl px-4 py-2 text-sm text-variable-main outline-none focus:border-primary"
                    />
                </div>

                {/* Lista */}
                <div className="glass rounded-2xl border border-variable overflow-hidden">
                    {loading ? (
                        <div className="p-10 flex justify-center">
                            <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center text-variable-muted text-sm">
                            {registros.length === 0
                                ? 'No hay registros Veri*factu todavía. Se crean automáticamente al emitir una factura.'
                                : 'No hay registros que coincidan con los filtros.'}
                        </div>
                    ) : (
                        <div className="divide-y divide-variable">
                            {filtered.map(r => {
                                const badge = BADGE[r.estado_envio] || 'bg-zinc-500/15 text-zinc-400';
                                return (
                                    <div key={r.id} className="p-4 sm:p-5 hover:bg-primary/5 transition-colors">
                                        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-xs text-variable-muted">#{r.num_registro}</span>
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold ${r.tipo === 'anulacion' ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                                                    {r.tipo === 'anulacion' ? 'Anulación' : 'Alta'}
                                                </span>
                                                <span className="font-mono text-sm font-bold text-variable-main">{r.numero_factura}</span>
                                                <span className="px-2 py-0.5 rounded-md text-[10px] uppercase font-bold bg-blue-500/10 text-blue-300">
                                                    {r.tipo_factura_aeat}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold ${badge}`}>
                                                    {r.estado_envio}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => handleDescargarXml(r)}
                                                    disabled={!r.xml_payload}
                                                    title={r.xml_payload ? 'Descargar XML' : 'Sin XML guardado'}
                                                    className="p-2 rounded-lg glass border border-variable text-variable-muted hover:text-primary disabled:opacity-30"
                                                >
                                                    <FileCode size={14} />
                                                </button>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-variable-muted font-mono break-all">
                                            <span className="opacity-50">huella:</span> {r.huella}
                                        </p>
                                        {r.huella_anterior && (
                                            <p className="text-[10px] text-variable-muted font-mono break-all mt-1">
                                                <span className="opacity-50">anterior:</span> {r.huella_anterior}
                                            </p>
                                        )}
                                        <p className="text-[10px] text-variable-muted mt-1">
                                            {new Date(r.fecha_hora_generacion).toLocaleString('es-ES')} · Base €{parseFloat(r.importe_total).toFixed(2)} · IVA €{parseFloat(r.cuota_total).toFixed(2)}
                                        </p>
                                        {r.ultimo_error && (
                                            <p className="text-[11px] text-red-400 mt-2 break-words">⚠️ {r.ultimo_error}</p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Pie informativo */}
                <div className="mt-6 glass rounded-2xl border border-variable p-5 text-xs text-variable-muted leading-relaxed">
                    <p className="font-bold text-variable-main mb-2">📋 Cómo funciona</p>
                    <ul className="space-y-1 list-disc pl-5">
                        <li>Cada factura emitida crea un registro encadenado por SHA-256 con el anterior.</li>
                        <li>Los registros son inmutables (append-only). No se pueden modificar ni borrar.</li>
                        <li>Si una factura no tiene registro (panel amarillo arriba), pulsa <strong>Registrar</strong> para crearlo.</li>
                        <li>El envío automático a la AEAT requiere certificado FNMT y se activará en fase posterior.</li>
                    </ul>
                </div>
            </main>
        </div>
    );
}

function Stat({ label, value, tone }) {
    return (
        <div className={`glass rounded-2xl p-5 border ${tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5' : 'border-variable'}`}>
            <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-1">{label}</p>
            <p className={`text-3xl font-black ${tone === 'warn' ? 'text-amber-400' : 'text-variable-main'}`}>{value}</p>
        </div>
    );
}
