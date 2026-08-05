import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    UserCheck, Search, Clock, Sun, Moon, ChevronRight,
    Building2, User} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import Sidebar from '../../../components/Sidebar';
import DataTable from '../../../components/DataTable';
import { useTheme } from '../../../context/ThemeContext';
import { useNotifications } from '../../../context/NotificationContext';

export default function Clientes() {
    const navigate = useNavigate();
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(false);
    const [clientes, setClientes] = useState([]);
    const [activeTab, setActiveTab] = useState('todos');
    const [search, setSearch] = useState('');

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
                .from('clients')
                .select(`
                    *,
                    projects:projects(id, name, status, total_hours)
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
            .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, fetchClientes)
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);

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
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8 sm:mb-12">
                    <div>
                        <h1 className="text-2xl sm:text-4xl font-bold font-display tracking-tight mb-1 text-variable-main">
                            <span className="text-primary italic">Clientes</span>
                        </h1>
                        <p className="text-variable-muted text-sm sm:text-base">Cartera comercial activa</p>
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
                            onClick={toggleTheme}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                        >
                            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>
                    </div>
                </header>

                <div className="flex flex-wrap gap-2 mb-8 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit">
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

                <DataTable
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
                            key: 'projects',
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
            </main>
        </div>
    );
}
