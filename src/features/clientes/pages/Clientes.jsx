import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    UserCheck, Search, Clock, ChevronRight,
    Building2, User, UserPlus, X} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import DataTable from '../../../components/DataTable';
import CustomDropdown from '../../../components/CustomDropdown';
import { useNotifications } from '../../../context/NotificationContext';

// Alta directa: un cliente que llega sin pasar por la fase de prospecto no
// necesita lead. El origen queda a la vista en la lista: "Lead" si viene de
// una conversión (tiene lead_id), "Manual" si se creó aquí o desde un proyecto.
const FORM_VACIO = {
    client_type: 'particular',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company_name: '',
    tax_id: '',
    billing_address: '',
    billing_postal_code: '',
    billing_city: '',
    billing_country: 'España',
};

export default function Clientes() {
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [activeTab, setActiveTab] = useState('todos');
    const [search, setSearch] = useState('');
    const [modalAbierto, setModalAbierto] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [form, setForm] = useState(FORM_VACIO);

    const tabs = [
        { id: 'todos', label: 'Todos' },
        { id: 'particular', label: 'Particulares' },
        { id: 'empresa', label: 'Empresas' },
        { id: 'agencia', label: 'Agencias' },
        { id: 'archived', label: 'Archivados' },
    ];

    const fetchClientes = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('clientes')
                .select(`
                    *,
                    projects:proyectos(id, name, status, total_hours)
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setClientes(data || []);
        } catch (err) {
            showNotification(`Error cargando clientes: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchClientes();

        const channel = supabase
            .channel('clients-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, fetchClientes)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

    const crearCliente = async (e) => {
        e.preventDefault();
        if (!form.first_name.trim() || !form.email.trim()) {
            return showNotification('Nombre y email son obligatorios', 'error');
        }
        if ((form.client_type === 'empresa' || form.client_type === 'agencia') && !form.company_name.trim()) {
            return showNotification('Una empresa o agencia necesita razón social', 'error');
        }
        setGuardando(true);
        try {
            // Mismo control anti-duplicados que la conversión de leads
            const { data: existentes } = await supabase
                .from('clientes')
                .select('id')
                .ilike('email', form.email.trim())
                .limit(1);
            if (existentes?.length) {
                showNotification('Ya hay un cliente con ese email', 'error');
                return;
            }
            const { error } = await supabase.from('clientes').insert([{
                client_type: form.client_type,
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim() || null,
                email: form.email.trim(),
                phone: form.phone.trim() || null,
                company_name: form.company_name.trim() || null,
                tax_id: form.tax_id.trim() || null,
                billing_address: form.billing_address.trim() || null,
                billing_postal_code: form.billing_postal_code.trim() || null,
                billing_city: form.billing_city.trim() || null,
                billing_country: form.billing_country.trim() || 'España',
                status: 'active',
            }]);
            if (error) throw error;
            showNotification('Cliente creado');
            setForm(FORM_VACIO);
            setModalAbierto(false);
            fetchClientes();
        } catch (err) {
            showNotification(`No se pudo crear el cliente: ${err.message}`, 'error');
        } finally {
            setGuardando(false);
        }
    };

    const stats = {
        todos: clientes.filter(c => c.status !== 'archived').length,
        particular: clientes.filter(c => c.client_type === 'particular' && c.status !== 'archived').length,
        empresa: clientes.filter(c => c.client_type === 'empresa' && c.status !== 'archived').length,
        agencia: clientes.filter(c => c.client_type === 'agencia' && c.status !== 'archived').length,
        archived: clientes.filter(c => c.status === 'archived').length,
    };

    const filtered = clientes.filter(c => {
        // Tab filter
        if (activeTab === 'archived' && c.status !== 'archived') return false;
        if (activeTab !== 'archived' && activeTab !== 'todos' && c.client_type !== activeTab) return false;
        if (activeTab !== 'archived' && c.status === 'archived') return false;

        // Search
        if (search) {
            const q = search.toLowerCase();
            return (
                (c.first_name || '').toLowerCase().includes(q) ||
                (c.last_name || '').toLowerCase().includes(q) ||
                (c.email || '').toLowerCase().includes(q) ||
                (c.company_name || '').toLowerCase().includes(q) ||
                (c.tax_id || '').toLowerCase().includes(q)
            );
        }
        return true;
    });

    return (
        <div className="flex flex-col min-h-screen transition-colors duration-300 overflow-hidden">
            <BarraNavegacion />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-10">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Comercial</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <Building2 className="text-primary" /> Clientes
                        </h1>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <div className="relative flex-1 sm:flex-none">
                            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por nombre, email, NIF/CIF..."
                                className="w-full sm:w-72 bg-white/5 border border-variable rounded-2xl pl-10 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm"
                            />
                        </div>
                        <button
                            onClick={fetchClientes}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                            title="Recargar"
                        >
                            <Clock size={20} />
                        </button>
                        <button
                            onClick={() => setModalAbierto(true)}
                            className="px-5 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:opacity-90 flex items-center gap-2"
                        >
                            <UserPlus size={16} /> Nuevo Cliente
                        </button>
                    </div>
                </header>

                <DataTable
                    cabecera={(
                <div className="flex flex-wrap gap-2 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-6 py-2.5 rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all flex items-center gap-3 ${activeTab === tab.id
                                ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                                : 'text-variable-muted hover:text-variable-main hover:bg-white/5'
                                }`}
                        >
                            {tab.label}
                            <span className={`px-2 py-0.5 rounded-md text-[9px] ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-variable/10 text-variable-muted'}`}>
                                {stats[tab.id]}
                            </span>
                        </button>
                    ))}
                </div>
                    )}
                    tableId="clientes"
                    loading={loading}
                    data={filtered}
                    rowKey="id"
                    defaultSort={{ key: 'created_at', dir: 'desc' }}
                    emptyIcon={<UserCheck size={40} className="opacity-20" />}
                    emptyTitle="Sin clientes en esta categoría"
                    emptySub="Convierte un lead a cliente desde la sección Leads"
                    columns={[
                        {
                            key: 'first_name',
                            label: 'Cliente',
                            hideable: false,
                            render: (c) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                        {c.client_type === 'empresa' || c.client_type === 'agencia'
                                            ? <Building2 size={18} />
                                            : <User size={18} />}
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">
                                            {c.company_name || `${c.first_name} ${c.last_name || ''}`.trim()}
                                        </p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{c.email}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'client_type',
                            label: 'Tipo',
                            render: (c) => (
                                <span className="px-3 py-1 rounded-lg bg-white/5 border border-variable text-[10px] uppercase font-black text-variable-muted">
                                    {c.client_type}
                                </span>
                            ),
                        },
                        {
                            key: 'lead_id',
                            label: 'Origen',
                            render: (c) => (
                                <span className={`px-3 py-1 rounded-lg border text-[10px] uppercase font-black ${
                                    c.lead_id
                                        ? 'bg-primary/10 border-primary/20 text-primary'
                                        : 'bg-white/5 border-variable text-variable-muted'
                                }`}>
                                    {c.lead_id ? 'Lead' : 'Manual'}
                                </span>
                            ),
                        },
                        {
                            key: 'tax_id',
                            label: 'NIF/CIF',
                            render: (c) => <span className="text-variable-muted text-sm font-mono">{c.tax_id || '—'}</span>,
                        },
                        {
                            key: 'phone',
                            label: 'Teléfono',
                            render: (c) => <span className="text-variable-muted text-sm">{c.phone || '—'}</span>,
                        },
                        {
                            key: 'proyectos',
                            label: 'Proyectos',
                            align: 'center',
                            render: (c) => (
                                <span className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] uppercase font-black text-primary">
                                    {c.projects?.length || 0}
                                </span>
                            ),
                        },
                        {
                            key: 'status',
                            label: 'Estado',
                            render: (c) => {
                                const bg = c.status === 'active'
                                    ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                                    : c.status === 'inactive'
                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                                        : 'bg-variable/10 text-variable-muted border-variable';
                                return (
                                    <span className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black border ${bg}`}>
                                        {c.status}
                                    </span>
                                );
                            },
                        },
                        {
                            key: 'created_at',
                            label: 'Alta',
                            render: (c) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(c.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </span>
                            ),
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (c) => (
                                <button
                                    onClick={() => navigate(`/clientes/${c.id}`)}
                                    className="p-2 glass rounded-xl text-primary hover:bg-primary/10 transition-all flex items-center gap-2 pr-4 shadow-lg shadow-primary/5 group"
                                >
                                    <div className="bg-primary/20 p-1 rounded-lg group-hover:scale-110 transition-transform"><ChevronRight size={14} /></div>
                                    <span className="text-[10px] font-black uppercase tracking-tighter">Ver detalle</span>
                                </button>
                            ),
                        }
                    ]}
                />

                {/* MODAL: NUEVO CLIENTE (alta directa, sin lead) */}
                {modalAbierto && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalAbierto(false)} />
                        <div className="relative glass rounded-3xl border border-variable p-6 sm:p-8 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                            <button onClick={() => setModalAbierto(false)} className="absolute top-6 right-6 text-variable-muted hover:text-primary transition-colors">
                                <X size={22} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">Nuevo Cliente</h2>
                            <p className="text-variable-muted mb-8 italic text-sm">
                                Alta directa, sin pasar por Leads. Quedará con origen «Manual».
                            </p>

                            <form onSubmit={crearCliente} className="space-y-5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Tipo</label>
                                        <CustomDropdown
                                            value={form.client_type}
                                            onChange={(v) => setForm({ ...form, client_type: v })}
                                            options={[
                                                { value: 'particular', label: 'Particular' },
                                                { value: 'empresa', label: 'Empresa' },
                                                { value: 'agencia', label: 'Agencia' },
                                            ]}
                                        />
                                    </div>
                                    {form.client_type !== 'particular' && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">
                                                Razón social <span className="text-rose-400">*</span>
                                            </label>
                                            <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Empresa S.L." />
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">
                                            Nombre <span className="text-rose-400">*</span>
                                        </label>
                                        <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Nombre" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Apellidos</label>
                                        <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Apellidos" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">
                                            Email <span className="text-rose-400">*</span>
                                        </label>
                                        <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="email@ejemplo.com" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Teléfono</label>
                                        <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="600 000 000" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">NIF/CIF</label>
                                        <input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Necesario para facturar" />
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-variable space-y-4">
                                    <p className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Dirección de facturación</p>
                                    <input value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Calle y número" />
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <input value={form.billing_postal_code} onChange={(e) => setForm({ ...form, billing_postal_code: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="CP" />
                                        <input value={form.billing_city} onChange={(e) => setForm({ ...form, billing_city: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Ciudad" />
                                        <input value={form.billing_country} onChange={(e) => setForm({ ...form, billing_country: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="País" />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={guardando}
                                    className="w-full py-3.5 rounded-2xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2"
                                >
                                    <UserPlus size={16} /> {guardando ? 'Creando…' : 'Crear Cliente'}
                                </button>
                            </form>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
