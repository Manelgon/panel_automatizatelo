import { useState, useEffect } from 'react';
import { GraduationCap, Plus, Sun, Moon, X, Clock, Users as UsersIcon, ShieldCheck, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import CustomDropdown from '../components/CustomDropdown';
import DataTable from '../components/DataTable';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';
import { useGlobalLoading } from '../context/LoadingContext';
import { TIPOS, MODALIDADES, ESTADOS, nombreCliente } from '../features/formaciones/constantes';

export default function Formaciones() {
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [loading, setLoading] = useState(true);
    const [lista, setLista] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [activeTab, setActiveTab] = useState('todas');
    const [isModalOpen, setIsModalOpen] = useState(false);

    const defaultForm = {
        cliente_id: '',
        titulo: '',
        tipo: 'ia_empresas',
        modalidad: 'presencial',
        estado: 'propuesta',
        horas_totales: '',
        precio_cerrado: '',
        fecha_inicio: '',
        fecha_fin: '',
        lugar: '',
        contenidos: '',
    };
    const [form, setForm] = useState(defaultForm);

    const tabs = [
        { id: 'todas', label: 'Todas' },
        ...Object.entries(ESTADOS).map(([id, e]) => ({ id, label: e.plural })),
    ];

    const cargar = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('formaciones')
            .select('*, clients(first_name, last_name, company_name), formacion_alumnos(id, aprovechamiento, certificado_emitido_at)')
            .order('fecha_inicio', { ascending: false, nullsFirst: false });

        if (error) showNotification(`Error cargando formaciones: ${error.message}`, 'error');
        setLista(data || []);
        setLoading(false);
    };

    const cargarClientes = async () => {
        const { data } = await supabase
            .from('clients')
            .select('id, first_name, last_name, company_name, email')
            .neq('status', 'archived')
            .order('company_name');
        setClientes(data || []);
    };

    useEffect(() => { cargar(); cargarClientes(); }, []);

    const filtradas = activeTab === 'todas' ? lista : lista.filter(f => f.estado === activeTab);

    const crear = async (e) => {
        e.preventDefault();
        if (!form.cliente_id) return showNotification('Elige un cliente', 'error');
        if (!form.titulo.trim()) return showNotification('La formación necesita un título', 'error');

        await withLoading(async () => {
            const { data, error } = await supabase
                .from('formaciones')
                .insert([{
                    ...form,
                    horas_totales: parseFloat(form.horas_totales) || 0,
                    precio_cerrado: parseFloat(form.precio_cerrado) || 0,
                    fecha_inicio: form.fecha_inicio || null,
                    fecha_fin: form.fecha_fin || null,
                }])
                .select('id')
                .single();

            if (error) return showNotification(`No se pudo crear: ${error.message}`, 'error');
            showNotification('Formación creada', 'success');
            setForm(defaultForm);
            setIsModalOpen(false);
            cargar();
        }, 'Creando formación...');
    };

    const input = 'w-full glass border border-variable focus:border-primary rounded-2xl px-4 py-3 text-sm text-variable-main placeholder:text-variable-muted outline-none transition-colors';
    const label = 'text-xs font-black text-primary uppercase tracking-[0.2em] ml-1 block mb-2';

    // Cifras de cabecera: lo que de verdad se quiere saber de un vistazo
    const stats = {
        activas: lista.filter(f => ['propuesta', 'confirmada'].includes(f.estado)).length,
        alumnos: lista.reduce((n, f) => n + (f.formacion_alumnos?.length || 0), 0),
        certificados: lista.reduce((n, f) => n + (f.formacion_alumnos || []).filter(a => a.certificado_emitido_at).length, 0),
        horas: lista.filter(f => ['impartida', 'certificada'].includes(f.estado))
                    .reduce((n, f) => n + Number(f.horas_totales || 0), 0),
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Formar</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <GraduationCap className="text-primary" /> Formaciones
                        </h1>
                    </div>
                    <div className="flex items-center gap-3">
                        <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary">
                            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="px-5 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:opacity-90 flex items-center gap-2"
                        >
                            <Plus size={16} /> Nueva formación
                        </button>
                    </div>
                </div>

                {/* Cifras */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                        { icon: Calendar, label: 'En marcha', valor: stats.activas },
                        { icon: UsersIcon, label: 'Alumnos', valor: stats.alumnos },
                        { icon: ShieldCheck, label: 'Certificados emitidos', valor: stats.certificados },
                        { icon: Clock, label: 'Horas impartidas', valor: stats.horas },
                    ].map(({ icon: Icon, label: l, valor }) => (
                        <div key={l} className="glass rounded-2xl border border-variable p-5">
                            <Icon className="text-primary mb-3" size={18} />
                            <p className="text-2xl font-bold text-variable-main">{valor}</p>
                            <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mt-1">{l}</p>
                        </div>
                    ))}
                </div>

                {/* Filtros */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {tabs.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setActiveTab(t.id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                activeTab === t.id ? 'bg-primary text-white' : 'glass border border-variable text-variable-muted hover:text-primary'
                            }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                <DataTable
                    data={filtradas}
                    loading={loading}
                    emptyIcon={<GraduationCap size={40} className="opacity-20" />}
                    emptyTitle="Todavía no hay formaciones"
                    emptySub="Crea la primera con el botón de arriba"
                    columns={[
                        {
                            key: 'titulo',
                            label: 'Formación',
                            hideable: false,
                            render: (f) => (
                                <Link to={`/formaciones/${f.id}`} className="block group">
                                    <p className="font-bold text-variable-main group-hover:text-primary transition-colors">{f.titulo}</p>
                                    <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">
                                        {nombreCliente(f.clients)}
                                    </p>
                                </Link>
                            ),
                        },
                        {
                            key: 'tipo',
                            label: 'Tipo',
                            render: (f) => (
                                <span className="text-xs text-variable-muted">
                                    {TIPOS[f.tipo]?.corto || f.tipo}
                                    {f.tipo === 'art4' && (
                                        <span className="ml-2 px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[9px] font-black uppercase">Art. 4</span>
                                    )}
                                </span>
                            ),
                        },
                        {
                            key: 'fecha_inicio',
                            label: 'Fechas',
                            render: (f) => (
                                <span className="text-xs text-variable-muted">
                                    {f.fecha_inicio ? new Date(f.fecha_inicio).toLocaleDateString('es-ES') : 'Sin fecha'}
                                </span>
                            ),
                        },
                        {
                            key: 'horas_totales',
                            label: 'Horas',
                            render: (f) => <span className="text-xs text-variable-muted">{f.horas_totales || 0} h</span>,
                        },
                        {
                            key: 'alumnos',
                            label: 'Alumnos',
                            render: (f) => {
                                const total = f.formacion_alumnos?.length || 0;
                                const cert = (f.formacion_alumnos || []).filter(a => a.certificado_emitido_at).length;
                                return (
                                    <span className="text-xs text-variable-muted">
                                        {total}
                                        {cert > 0 && <span className="text-emerald-400 font-bold"> · {cert} cert.</span>}
                                    </span>
                                );
                            },
                        },
                        {
                            key: 'precio_cerrado',
                            label: 'Precio',
                            render: (f) => <span className="text-xs font-bold text-variable-main">€{Number(f.precio_cerrado || 0).toFixed(2)}</span>,
                        },
                        {
                            key: 'estado',
                            label: 'Estado',
                            render: (f) => {
                                const e = ESTADOS[f.estado] || {};
                                return (
                                    <span className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${e.clase || ''}`}>
                                        {e.label || f.estado}
                                    </span>
                                );
                            },
                        },
                    ]}
                />
            </main>

            {/* Modal nueva formación */}
            <AnimatePresence>
                {isModalOpen && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-black/50 backdrop-blur-sm"
                        onClick={() => setIsModalOpen(false)}
                    >
                        <motion.form
                            initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={crear}
                            className="glass border border-variable rounded-3xl w-full max-w-2xl p-6 sm:p-8 my-8"
                        >
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-variable-main">Nueva formación</h2>
                                    <p className="text-sm text-variable-muted italic">Precio cerrado. Las horas van al certificado.</p>
                                </div>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="text-variable-muted hover:text-primary">
                                    <X size={22} />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div className="sm:col-span-2">
                                    <label className={label}>Cliente <span className="text-rose-400">*</span></label>
                                    <CustomDropdown
                                        placeholder="-- Seleccionar cliente --"
                                        value={form.cliente_id}
                                        onChange={(v) => setForm({ ...form, cliente_id: v })}
                                        options={clientes.map(c => ({ value: c.id, label: nombreCliente(c) }))}
                                    />
                                    {clientes.length === 0 && (
                                        <p className="text-xs text-amber-400 mt-2 ml-1">
                                            No hay clientes. Convierte un lead o créalo en la sección Clientes.
                                        </p>
                                    )}
                                </div>

                                <div className="sm:col-span-2">
                                    <label className={label}>Título <span className="text-rose-400">*</span></label>
                                    <input
                                        value={form.titulo}
                                        onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                                        className={input}
                                        placeholder="Ej: Alfabetización en IA para el equipo de administración"
                                    />
                                </div>

                                <div>
                                    <label className={label}>Tipo</label>
                                    <CustomDropdown
                                        value={form.tipo}
                                        onChange={(v) => setForm({ ...form, tipo: v })}
                                        options={Object.entries(TIPOS).map(([v, t]) => ({ value: v, label: t.corto }))}
                                    />
                                </div>

                                <div>
                                    <label className={label}>Modalidad</label>
                                    <CustomDropdown
                                        value={form.modalidad}
                                        onChange={(v) => setForm({ ...form, modalidad: v })}
                                        options={Object.entries(MODALIDADES).map(([v, l]) => ({ value: v, label: l }))}
                                    />
                                </div>

                                <div>
                                    <label className={label}>Fecha de inicio</label>
                                    <input type="date" value={form.fecha_inicio} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className={input} />
                                </div>

                                <div>
                                    <label className={label}>Fecha de fin</label>
                                    <input type="date" value={form.fecha_fin} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} className={input} />
                                </div>

                                <div>
                                    <label className={label}>Horas previstas</label>
                                    <input type="number" step="0.5" value={form.horas_totales} onChange={(e) => setForm({ ...form, horas_totales: e.target.value })} className={input} placeholder="8" />
                                    <p className="text-[10px] text-variable-muted mt-1 ml-1">Se recalcula sola al añadir sesiones.</p>
                                </div>

                                <div>
                                    <label className={label}>Precio cerrado (€)</label>
                                    <input type="number" step="0.01" value={form.precio_cerrado} onChange={(e) => setForm({ ...form, precio_cerrado: e.target.value })} className={input} placeholder="600" />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className={label}>Lugar</label>
                                    <input value={form.lugar} onChange={(e) => setForm({ ...form, lugar: e.target.value })} className={input} placeholder="Oficinas del cliente, Barcelona / Videollamada" />
                                </div>

                                <div className="sm:col-span-2">
                                    <label className={label}>Contenidos</label>
                                    <textarea
                                        rows={4}
                                        value={form.contenidos}
                                        onChange={(e) => setForm({ ...form, contenidos: e.target.value })}
                                        className={input}
                                        placeholder="Una línea por bloque. Esto se imprime en el certificado, así que escríbelo para el alumno."
                                    />
                                </div>
                            </div>

                            <button type="submit" className="w-full mt-8 py-4 rounded-2xl bg-primary text-white font-bold hover:opacity-90 flex items-center justify-center gap-2">
                                <ShieldCheck size={18} /> Crear formación
                            </button>
                        </motion.form>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
