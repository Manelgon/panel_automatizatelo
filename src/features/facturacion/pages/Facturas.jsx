import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Receipt, Search, Download, Sun, Moon, ChevronRight, FileWarning, CheckCircle2, Send } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getCompanySettings, getFacturaCompleta, generarPdfFactura } from '../../../lib/facturas';
import { enviarDocumento } from '../../../lib/enviarEmail';
import { registrarAccion } from '../../../lib/auditoria';
import Sidebar from '../../../components/Sidebar';
import { useTheme } from '../../../context/ThemeContext';
import { useNotifications } from '../../../context/NotificationContext';

const ESTADOS = [
    { id: 'todos', label: 'Todas' },
    { id: 'pendiente', label: 'Pendientes' },
    { id: 'pagada', label: 'Pagadas' },
    { id: 'vencida', label: 'Vencidas' },
    { id: 'devuelta', label: 'Devueltas' },
    { id: 'anulada', label: 'Anuladas' },
];

const BADGE_ESTADO = {
    pendiente: 'bg-amber-500/15 text-amber-400',
    pagada: 'bg-emerald-500/15 text-emerald-400',
    vencida: 'bg-red-500/15 text-red-400',
    devuelta: 'bg-orange-500/15 text-orange-400',
    anulada: 'bg-zinc-500/15 text-zinc-400',
};

export default function Facturas() {
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [facturas, setFacturas] = useState([]);
    const [activeTab, setActiveTab] = useState('todos');
    const [search, setSearch] = useState('');
    const [enviandoId, setEnviandoId] = useState(null);

    const fetchFacturas = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('facturas')
                .select(`
                    id, numero, fecha_emision, fecha_vencimiento,
                    cliente_nombre, cliente_nif,
                    base_imponible, iva_importe, total,
                    estado, forma_pago,
                    client_id, project_id, formacion_id,
                    projects:proyectos(name, id_alias),
                    formaciones(titulo)
                `)
                .order('fecha_emision', { ascending: false });
            if (error) throw error;
            setFacturas(data || []);
        } catch (err) {
            showNotification(`Error cargando facturas: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchFacturas();
        const channel = supabase
            .channel('facturas-list')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'facturas' }, fetchFacturas)
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, []);

    const stats = useMemo(() => ({
        todos: facturas.length,
        pendiente: facturas.filter(f => f.estado === 'pendiente').length,
        pagada: facturas.filter(f => f.estado === 'pagada').length,
        vencida: facturas.filter(f => f.estado === 'vencida').length,
        devuelta: facturas.filter(f => f.estado === 'devuelta').length,
        anulada: facturas.filter(f => f.estado === 'anulada').length,
    }), [facturas]);

    const totalFacturado = useMemo(
        () => facturas.filter(f => f.estado !== 'anulada').reduce((s, f) => s + parseFloat(f.total || 0), 0),
        [facturas]
    );
    const totalPendiente = useMemo(
        () => facturas.filter(f => f.estado === 'pendiente' || f.estado === 'vencida').reduce((s, f) => s + parseFloat(f.total || 0), 0),
        [facturas]
    );

    const filtered = facturas.filter(f => {
        if (activeTab !== 'todos' && f.estado !== activeTab) return false;
        if (search) {
            const q = search.toLowerCase();
            return (
                (f.numero || '').toLowerCase().includes(q) ||
                (f.cliente_nombre || '').toLowerCase().includes(q) ||
                (f.cliente_nif || '').toLowerCase().includes(q) ||
                (f.projects?.name || '').toLowerCase().includes(q) ||
                (f.formaciones?.titulo || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    // Emitida no es cobrada. Este botón registra el cobro del importe completo:
    // el caso Jennifer — llega la transferencia y la marcas. Los cobros
    // parciales con recibo viven en la ficha del proyecto.
    const handleMarcarPagada = async (f) => {
        const aPagada = f.estado === 'pendiente' || f.estado === 'vencida';
        const { error } = await supabase
            .from('facturas')
            .update(aPagada
                ? { estado: 'pagada', fecha_pago: new Date().toISOString().split('T')[0] }
                : { estado: 'pendiente', fecha_pago: null })
            .eq('id', f.id);

        if (error) return showNotification(`No se pudo cambiar el estado: ${error.message}`, 'error');
        registrarAccion(aPagada ? 'factura.pagada' : 'factura.pendiente', { tipo: 'factura', id: f.id, label: f.numero, metadata: { total: f.total } });
        showNotification(aPagada ? `Factura ${f.numero} marcada como pagada 💚` : `Factura ${f.numero} vuelve a pendiente`);
        fetchFacturas();
    };

    const handleEnviar = async (f) => {
        if (enviandoId) return;
        setEnviandoId(f.id);
        try {
            const [{ factura, error }, settings] = await Promise.all([
                getFacturaCompleta(f.id),
                getCompanySettings(),
            ]);
            if (error || !factura) return showNotification(error || 'Factura no encontrada', 'error');

            const doc = generarPdfFactura(factura, settings);
            const res = await enviarDocumento({
                para: factura.cliente_email,
                asunto: `Factura ${factura.numero} · Automatizatelo`,
                saludo: '¡Hola!',
                lineas: [
                    `Soy Manel. Te adjunto la factura ${factura.numero} por un total de €${parseFloat(factura.total).toFixed(2)}.`,
                    factura.fecha_vencimiento
                        ? `El vencimiento es el ${new Date(factura.fecha_vencimiento).toLocaleDateString('es-ES')}. En el propio documento tienes la forma de pago.`
                        : 'En el propio documento tienes la forma de pago.',
                    'Cualquier duda, responde a este correo y lo vemos.',
                ],
                doc,
                nombreAdjunto: `${factura.numero}.pdf`,
            });

            if (res.error) showNotification(res.error, 'error');
            else showNotification(`Factura enviada a ${factura.cliente_email} 📤`, 'success');
        } catch (err) {
            showNotification(`No se pudo enviar: ${err.message}`, 'error');
        } finally {
            setEnviandoId(null);
        }
    };

    const handleDescargar = async (facturaId) => {
        try {
            const [{ factura, error }, settings] = await Promise.all([
                getFacturaCompleta(facturaId),
                getCompanySettings(),
            ]);
            if (error || !factura) {
                showNotification(error || 'Factura no encontrada', 'error');
                return;
            }
            const doc = generarPdfFactura(factura, settings);
            const dateStr = new Date(factura.fecha_emision).toLocaleDateString('es-ES').replace(/\//g, '-');
            doc.save(`${factura.numero} - ${dateStr}.pdf`);
        } catch (err) {
            showNotification(`Error al descargar: ${err.message}`, 'error');
        }
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Facturación</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <Receipt className="text-primary" /> Facturas
                        </h1>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="p-3 glass rounded-2xl text-variable-muted hover:text-primary self-start sm:self-auto"
                    >
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>

                {/* KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                    <div className="glass rounded-2xl p-6 border border-variable">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-2">Total facturado</p>
                        <p className="text-3xl font-black text-variable-main">€{totalFacturado.toFixed(2)}</p>
                        <p className="text-xs text-variable-muted mt-1">{stats.todos} facturas (excluye anuladas)</p>
                    </div>
                    <div className="glass rounded-2xl p-6 border border-variable">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-2">Pendiente de cobro</p>
                        <p className="text-3xl font-black text-amber-400">€{totalPendiente.toFixed(2)}</p>
                        <p className="text-xs text-variable-muted mt-1">{stats.pendiente + stats.vencida} sin cobrar</p>
                    </div>
                    <div className="glass rounded-2xl p-6 border border-variable">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-2">Vencidas</p>
                        <p className="text-3xl font-black text-red-400">{stats.vencida}</p>
                        <p className="text-xs text-variable-muted mt-1">Requieren acción</p>
                    </div>
                </div>

                {/* Tabs estado */}
                <div className="flex flex-wrap gap-2 mb-5">
                    {ESTADOS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                activeTab === t.id
                                    ? 'bg-primary text-white'
                                    : 'glass border border-variable text-variable-muted hover:text-primary'
                            }`}
                        >
                            {t.label} <span className="ml-1 opacity-60">({stats[t.id] ?? 0})</span>
                        </button>
                    ))}
                </div>

                {/* Buscador */}
                <div className="relative mb-5">
                    <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Buscar por número, cliente, NIF o proyecto…"
                        className="w-full glass border border-variable rounded-2xl pl-12 pr-4 py-3 text-sm text-variable-main placeholder:text-variable-muted outline-none focus:border-primary"
                    />
                </div>

                {/* Lista */}
                <div className="glass rounded-2xl border border-variable overflow-hidden">
                    {loading ? (
                        <div className="p-10 flex justify-center">
                            <div className="size-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-10 text-center">
                            <FileWarning className="mx-auto text-variable-muted mb-3" size={36} />
                            <p className="text-variable-muted text-sm">
                                {facturas.length === 0
                                    ? 'Todavía no hay facturas. Crea una desde un proyecto (confirmando un presupuesto o generando manualmente).'
                                    : 'No hay facturas que coincidan con los filtros.'}
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-variable">
                            {filtered.map(f => {
                                const badge = BADGE_ESTADO[f.estado] || 'bg-zinc-500/15 text-zinc-400';
                                return (
                                    <div
                                        key={f.id}
                                        className="flex items-center gap-4 p-4 sm:p-5 hover:bg-primary/5 transition-colors"
                                    >
                                        <div className="p-3 bg-primary/10 rounded-xl text-primary shrink-0">
                                            <Receipt size={20} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-bold text-variable-main text-sm">{f.numero}</p>
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] uppercase font-bold ${badge}`}>
                                                    {f.estado}
                                                </span>
                                            </div>
                                            <p className="text-xs text-variable-muted truncate">
                                                {f.cliente_nombre}
                                                {f.cliente_nif && ` · ${f.cliente_nif}`}
                                                {f.projects?.name && (
                                                    <> · <Link to={`/projects/${f.project_id}`} className="hover:text-primary">{f.projects.name}</Link></>
                                                )}
                                                {f.formaciones?.titulo && (
                                                    <> · <Link to={`/formaciones/${f.formacion_id}`} className="hover:text-primary">{f.formaciones.titulo}</Link></>
                                                )}
                                            </p>
                                            <p className="text-[10px] text-variable-muted mt-1">
                                                Emitida: {new Date(f.fecha_emision).toLocaleDateString('es-ES')}
                                                {f.fecha_vencimiento && ` · Vence: ${new Date(f.fecha_vencimiento).toLocaleDateString('es-ES')}`}
                                            </p>
                                        </div>

                                        <div className="text-right">
                                            <p className="font-black text-variable-main text-base">€{parseFloat(f.total || 0).toFixed(2)}</p>
                                            <p className="text-[10px] text-variable-muted">
                                                Base €{parseFloat(f.base_imponible || 0).toFixed(2)}
                                            </p>
                                        </div>

                                        {f.estado !== 'anulada' && (
                                            <button
                                                onClick={() => handleMarcarPagada(f)}
                                                className={`p-2.5 rounded-xl glass border transition-all ${
                                                    f.estado === 'pagada'
                                                        ? 'border-emerald-500/30 text-emerald-400 hover:text-variable-muted hover:border-variable'
                                                        : 'border-variable text-variable-muted hover:text-emerald-400 hover:border-emerald-500/30'
                                                }`}
                                                title={f.estado === 'pagada' ? 'Cobrada — clic para volver a pendiente' : 'Marcar como cobrada'}
                                            >
                                                <CheckCircle2 size={16} />
                                            </button>
                                        )}

                                        {f.estado !== 'anulada' && (
                                            <button
                                                onClick={() => handleEnviar(f)}
                                                disabled={enviandoId === f.id}
                                                className="p-2.5 rounded-xl glass border border-variable text-variable-muted hover:text-sky-400 hover:border-sky-500/30 transition-all disabled:opacity-40"
                                                title="Enviar por email al cliente"
                                            >
                                                <Send size={16} className={enviandoId === f.id ? 'animate-pulse' : ''} />
                                            </button>
                                        )}

                                        <button
                                            onClick={() => handleDescargar(f.id)}
                                            className="p-2.5 rounded-xl glass border border-variable text-variable-muted hover:text-primary hover:border-primary/30 transition-all"
                                            title="Descargar PDF"
                                        >
                                            <Download size={16} />
                                        </button>

                                        {f.client_id && (
                                            <Link
                                                to={`/clientes/${f.client_id}`}
                                                className="p-2.5 rounded-xl glass border border-variable text-variable-muted hover:text-primary hover:border-primary/30 transition-all"
                                                title="Ver cliente"
                                            >
                                                <ChevronRight size={16} />
                                            </Link>
                                        )}
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
