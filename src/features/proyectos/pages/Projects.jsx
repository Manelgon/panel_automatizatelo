import { useState, useEffect } from 'react';
import {
    FolderOpen,
    Plus,
    Users as UsersIcon,
    ArrowRight,
    Trash2,
    Clock,
    ShieldCheck,
    Type,
    FileText,
    Briefcase,
    X} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import DataTable from '../../../components/DataTable';
import CustomDropdown from '../../../components/CustomDropdown';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useGlobalLoading } from '../../../context/LoadingContext';

export default function Projects() {
    const { profile: currentProfile } = useAuth();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const navigate = useNavigate();
    const { search } = useLocation();
    const query = new URLSearchParams(search);
    const convertLeadId = query.get('convert');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [projectsList, setProjectsList] = useState([]);
    const [users, setUsers] = useState([]);
    const [services, setServices] = useState([]);
    const [clients, setClients] = useState([]);
    const [fetchError, setFetchError] = useState(null);

    const defaultForm = {
        name: '',
        client_id: '',
        description: '',
        status: 'Pendiente',
        total_hours: 0,
        id_alias: '',
        lead_id: '',
        assigned_users: [], // Array of user IDs
        selected_services: [] // Array of service IDs
    };
    const [formData, setFormData] = useState(defaultForm);

    // Alta rápida de cliente desde el propio modal (null = plegada)
    const [nuevoCliente, setNuevoCliente] = useState(null);
    const [creandoCliente, setCreandoCliente] = useState(false);

    const fetchProjects = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            const { data, error } = await supabase
                .from('proyectos')
                .select('*, leads(first_name, last_name, company), project_members:proyecto_miembros(user_id, role, users:user_id(nombre, apellido1, avatar_url))')
                .order('created_at', { ascending: false });

            if (error) throw error;
            setProjectsList(data || []);
        } catch (error) {
            console.error('Error fetching projects:', error);
            setFetchError(error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLeads = async () => {
        const { data } = await supabase
            .from('leads')
            .select('id, first_name, last_name, company, service_interest')
            .order('created_at', { ascending: false });
        return data || [];
    };

    const fetchUsers = async () => {
        const { data, error } = await supabase
            .from('users')
            .select('id, nombre, apellido1, role, status')
            .order('nombre', { ascending: true });

        if (error) console.error("Error fetching users:", error);
        setUsers(data || []);
    };

    const fetchServices = async () => {
        const { data, error } = await supabase
            .from('servicios')
            .select('*')
            .order('name', { ascending: true });

        if (error) console.error("Error fetching services:", error);
        setServices(data || []);
    };

    const fetchClients = async () => {
        const { data, error } = await supabase
            .from('clientes')
            .select('id, first_name, last_name, company_name, email, lead_id, status')
            .neq('status', 'archived')
            .order('company_name', { ascending: true });

        if (error) console.error("Error fetching clients:", error);
        setClients(data || []);
        return data || [];
    };

    // Nombre presentable de un cliente: la empresa si la hay, si no la persona
    const nombreCliente = (c) =>
        (c?.company_name || '').trim() || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || c?.email || 'Cliente';

    useEffect(() => {
        const init = async () => {
            await fetchProjects();
            await fetchUsers();
            await fetchServices();
            const clientsData = await fetchClients();
            const leadsData = await fetchLeads();

            if (convertLeadId) {
                const lead = leadsData.find(l => l.id === convertLeadId);
                if (lead) {
                    const firstInitial = (lead.first_name || '').charAt(0).toUpperCase();
                    const lastInitial = (lead.last_name || '').charAt(0).toUpperCase();
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const randomDigits = Math.floor(1000 + Math.random() * 9000);

                    // El lead ya convertido tiene ficha de cliente: la enganchamos.
                    // Si no la tiene, hay que convertirlo primero desde Leads.
                    const clienteDelLead = clientsData.find(c => c.lead_id === lead.id);

                    setFormData({
                        ...defaultForm,
                        lead_id: lead.id,
                        name: `Proyecto ${lead.service_interest || ''}`,
                        client_id: clienteDelLead?.id || '',
                        id_alias: `${firstInitial}${lastInitial}-${dateStr}-${randomDigits}`
                    });
                    setIsModalOpen(true);
                }
            }
        };
        init();

        const channel = supabase
            .channel('projects-db-changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'proyectos' },
                () => fetchProjects()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [convertLeadId]);

    const handleCrearClienteRapido = async () => {
        if (!nuevoCliente.first_name.trim() || !nuevoCliente.email.trim()) {
            showNotification('Nombre y email son obligatorios para crear el cliente', 'error');
            return;
        }
        setCreandoCliente(true);
        try {
            // Mismo control anti-duplicados que la conversión de leads
            const { data: existentes } = await supabase
                .from('clientes')
                .select('id')
                .ilike('email', nuevoCliente.email.trim())
                .limit(1);
            if (existentes?.length) {
                setFormData({ ...formData, client_id: existentes[0].id });
                setNuevoCliente(null);
                showNotification('Ya existía un cliente con ese email: seleccionado');
                return;
            }
            const { data, error } = await supabase
                .from('clientes')
                .insert([{
                    client_type: nuevoCliente.company_name.trim() ? 'empresa' : 'particular',
                    first_name: nuevoCliente.first_name.trim(),
                    last_name: nuevoCliente.last_name.trim() || null,
                    email: nuevoCliente.email.trim(),
                    company_name: nuevoCliente.company_name.trim() || null,
                    tax_id: nuevoCliente.tax_id.trim() || null,
                    billing_country: 'España',
                    status: 'active',
                }])
                .select('id, first_name, last_name, company_name, email, lead_id, status')
                .single();
            if (error) throw error;
            setClients([data, ...clients]);
            setFormData({ ...formData, client_id: data.id });
            setNuevoCliente(null);
            showNotification('Cliente creado y seleccionado');
        } catch (err) {
            showNotification(`No se pudo crear el cliente: ${err.message}`, 'error');
        } finally {
            setCreandoCliente(false);
        }
    };

    const handleCreateProject = async (e) => {
        e.preventDefault();

        // El cliente es obligatorio: sin él el proyecto no se puede facturar
        if (!formData.client_id) {
            showNotification('Elige un cliente. Sin cliente el proyecto no se puede facturar.', 'error');
            return;
        }

        setLoading(true);
        await withLoading(async () => {
            try {
                // Prepare data - ensure lead_id is null if empty string
                let finalAlias = formData.id_alias;
                if (!finalAlias) {
                    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
                    const randomDigits = Math.floor(1000 + Math.random() * 9000);
                    finalAlias = `PR-${dateStr}-${randomDigits}`;
                }

                // 1. Call RPC function to create project safely
                const { data: projectId, error: rpcError } = await supabase
                    .rpc('create_project', {
                        p_name: formData.name,
                        p_client_id: formData.client_id,
                        p_description: formData.description || '',
                        p_alias: finalAlias,
                        p_total_hours: parseInt(formData.total_hours) || 0,
                        p_lead_id: formData.lead_id || null,
                        p_assigned_users: formData.assigned_users,
                        p_service_ids: formData.selected_services
                    });

                if (rpcError) throw rpcError;

                // 3. Update lead status if applicable

                setFormData(defaultForm);
                setIsModalOpen(false);
                fetchProjects();

                // Clean URL if we were converting
                if (convertLeadId) {
                    navigate('/projects', { replace: true });
                }

                showNotification('Proyecto creado con éxito y Lead convertido');
            } catch (err) {
                console.error('Error creating project:', err);
                showNotification(`Error al crear proyecto: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }, 'Creando proyecto...');
    };

    const handleDeleteProject = async (id) => {
        const confirmed = await confirm({
            title: '¿Eliminar Proyecto?',
            message: '¿Estás seguro de que deseas eliminar este proyecto definitivamente? Se borrarán todos los hitos, tareas y archivos asociados.',
            confirmText: 'Eliminar',
            cancelText: 'Cancelar'
        });

        if (!confirmed) return;

        setLoading(true);
        await withLoading(async () => {
            try {
                const { error } = await supabase
                    .from('proyectos')
                    .delete()
                    .eq('id', id);

                if (error) throw error;
                showNotification('Proyecto eliminado correctamente');
                fetchProjects();
            } catch (err) {
                console.error('Error deleting project:', err);
                showNotification(`Error al eliminar: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }, 'Eliminando proyecto...');
    };

    return (
        <div className="flex flex-col min-h-screen transition-colors duration-300 overflow-hidden">
            <BarraNavegacion />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-10">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Producción</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <FolderOpen className="text-primary" /> Gestión de Proyectos
                        </h1>
                    </div>

                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="w-full sm:w-auto px-6 py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-2"
                    >
                        <Plus size={20} />
                        Nuevo Proyecto
                    </button>
                </header>

                <DataTable
                    data={projectsList}
                    loading={loading}
                    emptyMessage="No hay proyectos registrados"
                    columns={[
                        {
                            key: 'name',
                            label: 'Proyecto',
                            render: (project) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                        <FolderOpen size={20} />
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{project.name}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-bold tracking-widest">{project.id_alias || 'SIN ALIAS'}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'client',
                            label: 'Cliente',
                            render: (project) => (
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-variable-main">{project.client}</span>
                                    {project.leads && (
                                        <div className="flex items-center gap-1 mt-1">
                                            <span className="text-[10px] font-bold text-primary uppercase tracking-tighter bg-primary/10 px-1.5 py-0.5 rounded">ORIGEN: LEAD</span>
                                            <span className="text-[10px] text-variable-muted italic truncate max-w-[120px]">
                                                {project.leads.company || `${project.leads.first_name} ${project.leads.last_name}`}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'status',
                            label: 'Estado',
                            render: (project) => (
                                <span className={`text-[10px] font-black px-3 py-1 rounded-lg border uppercase ${project.status === 'Finalizado' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
                                    project.status === 'Cancelado' ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' :
                                        project.status === 'Pendiente' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                            'bg-primary/10 text-primary border-primary/20'
                                    }`}>
                                    {project.status}
                                </span>
                            ),
                        },
                        {
                            key: 'team',
                            label: 'Equipo',
                            render: (project) => {
                                const members = project.project_members || [];
                                const shown = members.slice(0, 3);
                                const extra = members.length - 3;
                                return (
                                    <div className="flex items-center -space-x-2">
                                        {shown.map((m, i) => {
                                            const u = m.users;
                                            const initials = u ? `${(u.nombre || '?')[0]}${(u.apellido1 || '?')[0]}` : '??';
                                            return (
                                                <div key={i} title={u ? `${u.nombre} ${u.apellido1}` : 'Usuario'} className="size-8 rounded-full bg-primary/15 border-2 border-[var(--bg-card,#fff)] flex items-center justify-center text-[10px] font-black text-primary uppercase">
                                                    {initials}
                                                </div>
                                            );
                                        })}
                                        {extra > 0 && (
                                            <div className="size-8 rounded-full bg-white/10 border-2 border-[var(--bg-card,#fff)] flex items-center justify-center text-[10px] font-bold text-variable-muted">
                                                +{extra}
                                            </div>
                                        )}
                                        {members.length === 0 && <span className="text-[10px] text-variable-muted italic">Sin equipo</span>}
                                    </div>
                                );
                            },
                        },
                        {
                            key: 'progress',
                            label: 'Progreso',
                            render: (project) => {
                                const prog = project.total_hours > 0 ? (project.actual_hours / project.total_hours) * 100 : 0;
                                return (
                                    <div className="w-32 space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold text-variable-muted uppercase">
                                            <span>{Math.round(prog)}%</span>
                                            <span>{project.actual_hours}/{project.total_hours}h</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-white/5 border border-variable rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all duration-500"
                                                style={{ width: `${Math.min(prog, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            },
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (project) => (
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => navigate(`/projects/${project.id}`)}
                                        className="p-2 glass rounded-xl text-variable-muted hover:text-primary transition-all"
                                        title="Ver Detalles"
                                    >
                                        <ArrowRight size={16} />
                                    </button>
                                    {currentProfile?.role === 'admin' && (
                                        <button
                                            onClick={() => handleDeleteProject(project.id)}
                                            className="p-2 glass rounded-xl text-variable-muted hover:text-rose-500 transition-all"
                                            title="Eliminar Proyecto"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            ),
                        }
                    ]}
                />
            </main>

            {/* Modal para Nuevo Proyecto */}
            <AnimatePresence>
                {isModalOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsModalOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl glass rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                        >
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-variable-muted hover:text-primary transition-colors z-10">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">Nuevo Proyecto</h2>
                            <p className="text-variable-muted mb-8 italic text-sm sm:text-base">Inicializa un nuevo entorno de trabajo para tu cliente</p>

                            <form onSubmit={handleCreateProject} className="space-y-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Nombre del Proyecto</label>
                                        <div className="relative">
                                            <Type className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Ej: Rediseño Web" />
                                        </div>
                                    </div>
                                    {/* El cliente ya no se escribe a mano: sin ficha de cliente
                                        el proyecto no se puede facturar. */}
                                    <div className="space-y-2">
                                        <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">
                                            Cliente <span className="text-rose-400">*</span>
                                        </label>
                                        <CustomDropdown
                                            placeholder="-- Seleccionar cliente --"
                                            icon={Briefcase}
                                            value={formData.client_id}
                                            onChange={(clientId) => setFormData({ ...formData, client_id: clientId })}
                                            options={clients.map(c => ({ value: c.id, label: nombreCliente(c) }))}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setNuevoCliente(nuevoCliente ? null : { first_name: '', last_name: '', email: '', company_name: '', tax_id: '' })}
                                            className="text-xs font-bold text-primary hover:underline ml-1"
                                        >
                                            {nuevoCliente ? 'Cancelar cliente nuevo' : '+ El cliente no está: crearlo aquí'}
                                        </button>
                                    </div>
                                </div>

                                {/* Alta rápida de cliente sin salir del modal. Sin lead:
                                    un cliente directo no pasa por la fase de prospecto. */}
                                {nuevoCliente && (
                                    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
                                        <p className="text-xs font-black text-primary uppercase tracking-[0.2em]">Cliente nuevo</p>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            <input value={nuevoCliente.first_name} onChange={(e) => setNuevoCliente({ ...nuevoCliente, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Nombre *" />
                                            <input value={nuevoCliente.last_name} onChange={(e) => setNuevoCliente({ ...nuevoCliente, last_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Apellidos" />
                                            <input type="email" value={nuevoCliente.email} onChange={(e) => setNuevoCliente({ ...nuevoCliente, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Email *" />
                                            <input value={nuevoCliente.company_name} onChange={(e) => setNuevoCliente({ ...nuevoCliente, company_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main text-sm" placeholder="Empresa (si aplica)" />
                                            <input value={nuevoCliente.tax_id} onChange={(e) => setNuevoCliente({ ...nuevoCliente, tax_id: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-2.5 focus:outline-none focus:border-primary/50 text-variable-main text-sm sm:col-span-2" placeholder="NIF/CIF (necesario para facturar, se puede añadir después)" />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleCrearClienteRapido}
                                            disabled={creandoCliente}
                                            className="px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-40"
                                        >
                                            {creandoCliente ? 'Creando…' : 'Guardar y seleccionar'}
                                        </button>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Horas Totales Estimadas</label>
                                    <div className="relative">
                                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                        <input type="number" value={formData.total_hours} onChange={(e) => setFormData({ ...formData, total_hours: parseInt(e.target.value) || 0 })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="0" />
                                    </div>
                                </div>

                                {/* Sin selector de lead: el proyecto se crea sobre un cliente.
                                    Si se llega desde "Convertir lead" (?convert=), lead_id viene
                                    ya puesto en el estado y el enlace se guarda igual. */}

                                {/* ── SERVICIOS DROPDOWN ── */}
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1 flex items-center justify-between">
                                        <div className="flex items-center gap-2"><Briefcase size={14} /> Servicios Incluidos</div>
                                        <div className="px-3 py-1 bg-primary/10 rounded-lg text-primary text-[10px] font-black">
                                            TOTAL: €{services
                                                .filter(s => formData.selected_services.includes(s.id))
                                                .reduce((sum, s) => sum + (parseFloat(s.price) || 0), 0)
                                                .toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                                        </div>
                                    </label>
                                    <CustomDropdown
                                        multiple
                                        placeholder="Seleccionar servicios..."
                                        selected={formData.selected_services}
                                        onToggle={(serviceId) => setFormData(prev => ({
                                            ...prev,
                                            selected_services: prev.selected_services.includes(serviceId)
                                                ? prev.selected_services.filter(id => id !== serviceId)
                                                : [...prev.selected_services, serviceId]
                                        }))}
                                        options={services.map(s => ({
                                            value: s.id,
                                            label: s.name,
                                            right: `€${parseFloat(s.price || 0).toFixed(2)}`
                                        }))}
                                    />
                                </div>

                                {/* ── USUARIOS DROPDOWN ── */}
                                <div className="space-y-3">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1 flex items-center gap-2">
                                        <UsersIcon size={14} /> Asignar Miembros al Equipo
                                    </label>
                                    <CustomDropdown
                                        multiple
                                        placeholder="Seleccionar miembros..."
                                        selected={formData.assigned_users}
                                        onToggle={(userId) => setFormData(prev => ({
                                            ...prev,
                                            assigned_users: prev.assigned_users.includes(userId)
                                                ? prev.assigned_users.filter(id => id !== userId)
                                                : [...prev.assigned_users, userId]
                                        }))}
                                        options={users.map(u => ({
                                            value: u.id,
                                            label: `${u.nombre} ${u.apellido1}`,
                                            secondary: u.role,
                                            secondaryColor: u.role === 'admin' ? 'text-rose-500' : 'text-gray-400'
                                        }))}
                                    />
                                    <p className="text-[10px] text-variable-muted italic ml-1">* El creador del proyecto se asigna automaticamente como administrador del mismo.</p>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-black text-primary uppercase tracking-[0.2em] ml-1">Descripción</label>
                                    <div className="relative">
                                        <FileText className="absolute left-4 top-4 text-variable-muted" size={18} />
                                        <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all h-24 resize-none text-sm" placeholder="Detalles generales del proyecto..." />
                                    </div>
                                </div>

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-4 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Creando...' : <><ShieldCheck size={20} /> Crear Proyecto</>}
                                </button>
                                <div className="h-4" />
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
