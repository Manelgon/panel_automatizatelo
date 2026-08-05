import { useState, useEffect } from 'react';
import {
    Users as UsersIcon,
    UserPlus,
    Clock,
    X,
    ShieldCheck,
    Mail,
    Phone,
    Briefcase,
    Star,
    Target,
    Rocket,
    Trash2,
    AlertTriangle,
    UserCheck,
    CalendarClock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import CustomDropdown from '../../../components/CustomDropdown';
import AgendarCitaModal from '../../citas/AgendarCitaModal';
import { registrarAccion } from '../../../lib/auditoria';
import DataTable from '../../../components/DataTable';
import { useAuth } from '../../../context/AuthContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useGlobalLoading } from '../../../context/LoadingContext';

export default function Leads() {
    const navigate = useNavigate();
    const { profile: currentProfile } = useAuth();
    const { showNotification } = useNotifications();
    const { withLoading } = useGlobalLoading();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [leadsList, setLeadsList] = useState([]);
    const [services, setServices] = useState([]);
    const [activeTab, setActiveTab] = useState('todos');
    const [fetchError, setFetchError] = useState(null);
    const [gdprLead, setGdprLead] = useState(null);
    const [gdprPreview, setGdprPreview] = useState(null);
    const [gdprBusy, setGdprBusy] = useState(false);
    const [gdprAuthEmail, setGdprAuthEmail] = useState('');
    const [gdprAuthPassword, setGdprAuthPassword] = useState('');
    const [gdprAuthError, setGdprAuthError] = useState(null);

    // Agendar los 30 minutos con un lead
    const [citaContacto, setCitaContacto] = useState(null);

    // Convert lead → cliente
    const [convertLead, setConvertLead] = useState(null);
    const [convertBusy, setConvertBusy] = useState(false);
    const [convertForm, setConvertForm] = useState({
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
    });

    const tabs = [
        { id: 'todos', label: 'Todos' },
        { id: 'nuevo', label: 'Nuevos' },
        { id: 'en_proceso', label: 'En Proceso' },
        { id: 'contactado', label: 'Contactados' },
        { id: 'convertido', label: 'Convertidos' },
        { id: 'perdido', label: 'Perdidos' }
    ];

    const stats = {
        todos: leadsList.length,
        nuevo: leadsList.filter(l => (l.status || 'nuevo') === 'nuevo').length,
        en_proceso: leadsList.filter(l => l.status === 'en_proceso').length,
        contactado: leadsList.filter(l => l.status === 'contactado').length,
        convertido: leadsList.filter(l => l.status === 'convertido').length,
        perdido: leadsList.filter(l => l.status === 'perdido').length
    };

    const filteredLeads = activeTab === 'todos'
        ? leadsList
        : leadsList.filter(l => (l.status || 'nuevo') === activeTab);

    const fetchLeads = async () => {
        setLoading(true);
        setFetchError(null);
        try {
            // Desde la migración 012 el lead entero vive en una sola fila:
            // service_segmentation y funnel_flows se fusionaron dentro de `leads`.
            const { data, error } = await supabase
                .from('leads')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const flatData = (data || []).map(lead => ({
                ...lead,
                company_size: lead.company_size || '',
                automation_goal: lead.automation_goal || '',
                flow_name: lead.flow_name || 'Panel Administrativo',
                activity: lead.activity || 'lead_inactivo',
                received_keyword: lead.received_keyword || '',
                process_tags: lead.process_tags || [],
                last_interaction_date: lead.last_interaction_date || lead.created_at,
            }));

            setLeadsList(flatData);
        } catch (error) {
            console.error('Error fetching leads:', error);
            setFetchError(error);
        } finally {
            setLoading(false);
        }
    };

    const defaultForm = {
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        client_type: 'particular',
        service_interest: 'automatizacion',
        message: '',
        source: 'Panel Administrativo',
        score: 0,
        privacy_accepted: false
    };
    const [formData, setFormData] = useState(defaultForm);

    const clientTypes = [
        { value: 'particular', label: 'Particular' },
        { value: 'empresa', label: 'Empresa' },
        { value: 'agencia', label: 'Agencia' },
        { value: 'otro', label: 'Otro' }
    ];

    const fetchServices = async () => {
        const { data, error } = await supabase
            .from('servicios')
            .select('*')
            .eq('is_active', true)
            .order('name', { ascending: true });

        if (error) {
            console.error('Error fetching services in leads:', {
                message: error.message,
                details: error.details,
                hint: error.hint
            });
        } else if (data) {
            setServices(data || []);
        }
    };

    const serviceInterests = services.map(s => ({
        value: s.name,
        label: s.name
    }));

    // If no services yet, provide some defaults or empty list
    const finalServiceInterests = serviceInterests.length > 0
        ? serviceInterests
        : [{ value: 'otro', label: 'Otro' }];

    const closeGdprModal = () => {
        setGdprLead(null);
        setGdprPreview(null);
        setGdprAuthEmail('');
        setGdprAuthPassword('');
        setGdprAuthError(null);
    };

    const openGdprModal = async (lead) => {
        setGdprLead(lead);
        setGdprPreview(null);
        setGdprAuthEmail('');
        setGdprAuthPassword('');
        setGdprAuthError(null);
        setGdprBusy(true);
        try {
            const { data, error } = await supabase.rpc('forget_lead_by_email', {
                p_email: lead.email,
                p_dry_run: true,
            });
            if (error) throw error;
            setGdprPreview(data);
        } catch (err) {
            showNotification(`Error al previsualizar: ${err.message}`, 'error');
            setGdprLead(null);
        } finally {
            setGdprBusy(false);
        }
    };

    const confirmGdprDelete = async () => {
        if (!gdprLead) return;
        setGdprAuthError(null);

        if (!gdprAuthEmail || !gdprAuthPassword) {
            setGdprAuthError('Introduce email y contraseña de admin');
            return;
        }

        setGdprBusy(true);
        try {
            // 1) Re-autenticación: verificar credenciales admin
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: gdprAuthEmail.trim(),
                password: gdprAuthPassword,
            });

            if (authError) {
                setGdprAuthError('Credenciales incorrectas');
                setGdprBusy(false);
                return;
            }

            // 2) Verificar que el usuario re-autenticado es admin
            const { data: profile, error: profileError } = await supabase
                .from('users')
                .select('role')
                .eq('id', authData.user.id)
                .single();

            if (profileError || !profile || profile.role !== 'admin') {
                setGdprAuthError('Este usuario no tiene permisos de administrador');
                setGdprBusy(false);
                return;
            }

            // 3) Ejecutar el borrado
            const { data, error } = await supabase.rpc('forget_lead_by_email', {
                p_email: gdprLead.email,
                p_dry_run: false,
            });
            if (error) throw error;

            const action = data?.status === 'anonymized_due_to_active_project'
                ? 'Datos anonimizados (proyecto conservado por obligación fiscal)'
                : 'Datos eliminados completamente';

            registrarAccion('lead.olvidado', { tipo: 'lead', label: gdprLead.email, metadata: { resultado: data?.status } });
            showNotification(`${action} para ${gdprLead.email}`, 'success');
            closeGdprModal();
            fetchLeads();
        } catch (err) {
            showNotification(`Error en el borrado: ${err.message}`, 'error');
        } finally {
            setGdprBusy(false);
        }
    };

    const openConvertModal = (lead) => {
        setConvertLead(lead);
        setConvertForm({
            client_type: lead.client_type || 'particular',
            first_name: lead.first_name || '',
            last_name: lead.last_name || '',
            email: lead.email || '',
            phone: lead.phone || '',
            company_name: '',
            tax_id: '',
            billing_address: '',
            billing_postal_code: '',
            billing_city: '',
            billing_country: 'España',
        });
    };

    const closeConvertModal = () => {
        if (convertBusy) return;
        setConvertLead(null);
    };

    const submitConvert = async (e) => {
        e.preventDefault();
        if (!convertLead) return;
        setConvertBusy(true);
        try {
            // 1) Buscar cliente existente con mismo email (evitar duplicados)
            const { data: existingClients, error: searchError } = await supabase
                .from('clientes')
                .select('id')
                .ilike('email', convertForm.email.trim())
                .limit(1);

            if (searchError) throw searchError;

            let clientId;
            if (existingClients && existingClients.length > 0) {
                // Reusar y actualizar con datos nuevos si vienen
                clientId = existingClients[0].id;
                const { error: updErr } = await supabase
                    .from('clientes')
                    .update({
                        client_type: convertForm.client_type,
                        first_name: convertForm.first_name,
                        last_name: convertForm.last_name || null,
                        phone: convertForm.phone || null,
                        company_name: convertForm.company_name || null,
                        tax_id: convertForm.tax_id || null,
                        billing_address: convertForm.billing_address || null,
                        billing_postal_code: convertForm.billing_postal_code || null,
                        billing_city: convertForm.billing_city || null,
                        billing_country: convertForm.billing_country || 'España',
                        lead_id: convertLead.id,
                        status: 'active',
                    })
                    .eq('id', clientId);
                if (updErr) throw updErr;
            } else {
                // Crear nuevo cliente
                const { data: newClient, error: insErr } = await supabase
                    .from('clientes')
                    .insert([{
                        lead_id: convertLead.id,
                        client_type: convertForm.client_type,
                        first_name: convertForm.first_name,
                        last_name: convertForm.last_name || null,
                        email: convertForm.email.trim(),
                        phone: convertForm.phone || null,
                        company_name: convertForm.company_name || null,
                        tax_id: convertForm.tax_id || null,
                        billing_address: convertForm.billing_address || null,
                        billing_postal_code: convertForm.billing_postal_code || null,
                        billing_city: convertForm.billing_city || null,
                        billing_country: convertForm.billing_country || 'España',
                        status: 'active',
                    }])
                    .select('id')
                    .single();
                if (insErr) throw insErr;
                clientId = newClient.id;
            }

            // 2) Marcar el lead como convertido.
            //    Antes eran dos escrituras en dos tablas con dos vocabularios
            //    ('ganado' aquí, 'convertido' en funnel_flows) que solo coincidían
            //    mientras nadie se olvidara de actualizar una. Ahora es una.
            const { error: leadErr } = await supabase
                .from('leads')
                .update({
                    status: 'convertido',
                    activity: 'lead_activo',
                    last_interaction_date: new Date().toISOString(),
                })
                .eq('id', convertLead.id);
            if (leadErr) throw leadErr;

            showNotification('Lead convertido a cliente correctamente', 'success');
            setConvertLead(null);
            fetchLeads();
            navigate(`/clientes/${clientId}`);
        } catch (err) {
            showNotification(`Error al convertir: ${err.message}`, 'error');
        } finally {
            setConvertBusy(false);
        }
    };

    const handleCreateLead = async (e) => {
        e.preventDefault();
        setLoading(true);
        await withLoading(async () => {
            try {
                // 1. Insert lead and get ID
                const { data: newLead, error: leadError } = await supabase
                    .from('leads')
                    .insert([{
                        first_name: formData.first_name,
                        last_name: formData.last_name,
                        email: formData.email,
                        phone: formData.phone,
                        client_type: formData.client_type,
                        service_interest: formData.service_interest,
                        source: formData.source,
                        // Un lead = una fila. Lo que antes eran tres inserciones
                        // en tres tablas ahora son columnas de `leads`.
                        status: 'nuevo',
                        flow_name: formData.source || 'manual',
                        activity: 'lead_inactivo',
                        process_tags: ['nuevo'],
                        last_interaction_date: new Date().toISOString(),
                    }])
                    .select('id')
                    .single();

                if (leadError) throw leadError;

                setFormData(defaultForm);
                setIsModalOpen(false);
                showNotification('Lead creado con éxito');
                fetchLeads();
            } catch (err) {
                console.error('Error creating lead:', err);
                showNotification(`Error al crear lead: ${err.message}`, 'error');
            } finally {
                setLoading(false);
            }
        }, 'Creando nuevo lead...');
    };

    useEffect(() => {
        fetchLeads();
        fetchServices();

        const tables = ['leads', 'servicios'];
        const channels = tables.map(table =>
            supabase.channel(`${table}-changes`)
                .on('postgres_changes', { event: '*', schema: 'public', table }, () => {
                    if (table === 'servicios') fetchServices();
                    else fetchLeads();
                })
                .subscribe()
        );

        return () => {
            channels.forEach(ch => supabase.removeChannel(ch));
        };
    }, []);

    return (
        <div className="flex flex-col min-h-screen transition-colors duration-300 overflow-hidden">
            <BarraNavegacion />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-10">
                <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Comercial</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <Target className="text-primary" /> Gestión de Leads
                        </h1>
                        {fetchError && (
                            <div className="text-xs text-rose-500 mt-2 font-mono">
                                Error DB: {fetchError.message}
                            </div>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <button
                            onClick={fetchLeads}
                            className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all flex items-center justify-center"
                            title="Recargar Lista"
                        >
                            <Clock size={20} />
                        </button>
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="flex-1 sm:flex-none bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:brightness-110 transition-all shadow-lg shadow-primary/20"
                        >
                            <UserPlus size={20} /> <span className="whitespace-nowrap">Nuevo Lead</span>
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
                            <span className={`px-2 py-0.5 rounded-md text-[9px] ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-variable/10 text-variable-muted'
                                }`}>
                                {stats[tab.id]}
                            </span>
                        </button>
                    ))}
                </div>
                    )}
                    tableId="leads"
                    loading={loading}
                    data={filteredLeads}
                    rowKey="id"
                    defaultSort={{ key: 'created_at', dir: 'desc' }}
                    emptyIcon={<UsersIcon size={40} className="opacity-20" />}
                    emptyTitle="No se encontraron leads en esta categoría"
                    emptySub="Los leads aparecerán aquí según su estado en el embudo"
                    columns={[
                        {
                            key: 'first_name',
                            label: 'Lead',
                            hideable: false,
                            render: (lead) => (
                                <div className="flex items-center gap-4">
                                    <div className="size-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                                        {lead.first_name[0]}{lead.last_name[0]}
                                    </div>
                                    <div>
                                        <p className="font-bold text-variable-main">{lead.first_name} {lead.last_name}</p>
                                        <p className="text-[10px] text-variable-muted uppercase font-black tracking-widest">{lead.email}</p>
                                    </div>
                                </div>
                            ),
                        },
                        {
                            key: 'phone',
                            label: 'Teléfono',
                            render: (lead) => <span className="text-variable-muted text-sm">{lead.phone || '—'}</span>,
                        },
                        {
                            key: 'client_type',
                            label: 'Tipo',
                            render: (lead) => (
                                <span className="px-3 py-1 rounded-lg bg-white/5 border border-variable text-[10px] uppercase font-black text-variable-muted">
                                    {lead.client_type}
                                </span>
                            ),
                        },
                        {
                            key: 'service_interest',
                            label: 'Interés / Meta',
                            render: (lead) => (
                                <div className="flex flex-col gap-1 items-start">
                                    <span className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[10px] uppercase font-black text-primary">
                                        {lead.service_interest || 'N/A'}
                                    </span>
                                    {lead.automation_goal && (
                                        <span className="text-xs text-variable-muted">Meta: {lead.automation_goal}</span>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: 'flow_activity',
                            label: 'Origen / Act.',
                            render: (lead) => (
                                <div className="flex items-center gap-2">
                                    <div className={`size-2 rounded-full shadow-sm ${lead.activity === 'lead_activo' ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-gray-400/50'}`} title={lead.activity} />
                                    <span className="text-[10px] uppercase font-bold text-variable-muted tracking-wide">
                                        {lead.flow_name || 'Manual'}
                                    </span>
                                </div>
                            )
                        },
                        {
                            key: 'process_tags',
                            label: 'Etiquetas',
                            render: (lead) => {
                                // Solo la última etiqueta (la más reciente del flujo):
                                // apilarlas todas duplicaba la altura de la fila. Si hay
                                // más, un +N discreto lo dice y el tooltip las lista.
                                const tags = lead.process_tags || [];
                                if (tags.length === 0) return <span className="text-variable-muted/30">—</span>;
                                const ultima = tags[tags.length - 1];
                                return (
                                    <span className="inline-flex items-center gap-1.5" title={tags.join(' · ')}>
                                        <span className="px-2 py-0.5 rounded-md bg-variable/5 border border-variable/10 text-[9px] uppercase font-bold text-variable-muted whitespace-nowrap">
                                            {String(ultima).replace(/_/g, ' ')}
                                        </span>
                                        {tags.length > 1 && (
                                            <span className="text-[9px] font-bold text-variable-muted/50">+{tags.length - 1}</span>
                                        )}
                                    </span>
                                );
                            },
                        },
                        {
                            key: 'score',
                            label: 'Calidad / Score',
                            align: 'center',
                            render: (lead) => (
                                <div className="flex gap-1 justify-center">
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} size={12} className={i < (lead.score || 0) ? 'fill-primary text-primary' : 'text-white/10'} />
                                    ))}
                                </div>
                            ),
                        },
                        {
                            key: 'status',
                            label: 'Embudo',
                            render: (lead) => {
                                const st = lead.status || 'nuevo';
                                let bg = 'bg-primary/10 text-primary border-primary/20';
                                if (st === 'convertido') bg = 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
                                if (st === 'perdido') bg = 'bg-rose-500/10 text-rose-500 border-rose-500/20';
                                if (st === 'contactado' || st === 'en_proceso') bg = 'bg-amber-500/10 text-amber-500 border-amber-500/20';

                                return (
                                    <span className={`px-3 py-1 rounded-lg text-[10px] uppercase font-black border ${bg}`}>
                                        {st.replace('_', ' ')}
                                    </span>
                                );
                            }
                        },
                        {
                            key: 'created_at',
                            label: 'Fecha',
                            render: (lead) => (
                                <span className="text-variable-muted text-sm">
                                    {new Date(lead.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                                </span>
                            ),
                        },
                        {
                            key: 'actions',
                            label: 'Acciones',
                            align: 'right',
                            render: (lead) => (
                                <div className="flex gap-2 justify-end">
                                    <button
                                        onClick={() => setCitaContacto({
                                            leadId: lead.id,
                                            nombre: [lead.first_name, lead.last_name].filter(Boolean).join(' '),
                                            email: lead.email,
                                        })}
                                        className="p-2 glass rounded-xl text-sky-400 hover:bg-sky-500/10 transition-all flex items-center gap-2 pr-4 shadow-lg shadow-sky-500/5 group"
                                        title="Agendar los 30 minutos"
                                    >
                                        <div className="bg-sky-500/20 p-1 rounded-lg group-hover:scale-110 transition-transform"><CalendarClock size={14} /></div>
                                        <span className="text-[10px] font-black uppercase tracking-tighter">Agendar</span>
                                    </button>

                                    {/* 'ganado' dejó de existir en la migración 012 */}
                                    {lead.status !== 'convertido' && (
                                        <button
                                            onClick={() => openConvertModal(lead)}
                                            className="p-2 glass rounded-xl text-primary hover:bg-primary/10 transition-all flex items-center gap-2 pr-4 shadow-lg shadow-primary/5 group"
                                            title="Convertir a Cliente"
                                        >
                                            <div className="bg-primary/20 p-1 rounded-lg group-hover:scale-110 transition-transform"><Rocket size={14} /></div>
                                            <span className="text-[10px] font-black uppercase tracking-tighter">Convertir</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => openGdprModal(lead)}
                                        className="p-2 glass rounded-xl text-rose-500 hover:bg-rose-500/10 transition-all flex items-center gap-2 pr-4 shadow-lg shadow-rose-500/5 group"
                                        title="Derecho al olvido (GDPR)"
                                    >
                                        <div className="bg-rose-500/20 p-1 rounded-lg group-hover:scale-110 transition-transform"><Trash2 size={14} /></div>
                                        <span className="text-[10px] font-black uppercase tracking-tighter">GDPR</span>
                                    </button>
                                </div>
                            ),
                        }
                    ]}
                />
            </main>

            {/* Convert Lead → Cliente Modal */}
            <AnimatePresence>
                {convertLead && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={closeConvertModal}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl glass rounded-[2rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <button onClick={closeConvertModal} className="absolute top-6 right-6 text-variable-muted hover:text-primary">
                                <X size={24} />
                            </button>

                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                                    <UserCheck size={24} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-variable-main">Convertir a cliente</h2>
                                    <p className="text-xs text-variable-muted">Completa los datos de facturación</p>
                                </div>
                            </div>

                            <form onSubmit={submitConvert} className="space-y-4">
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest border-b border-variable pb-2">Identidad</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Tipo</label>
                                        <select
                                            value={convertForm.client_type}
                                            onChange={(e) => setConvertForm({ ...convertForm, client_type: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50"
                                        >
                                            <option value="particular">Particular</option>
                                            <option value="empresa">Empresa</option>
                                            <option value="agencia">Agencia</option>
                                            <option value="otro">Otro</option>
                                        </select>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">NIF / CIF *</label>
                                        <input
                                            required
                                            value={convertForm.tax_id}
                                            onChange={(e) => setConvertForm({ ...convertForm, tax_id: e.target.value.toUpperCase() })}
                                            placeholder="Ej: 12345678A o B12345678"
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm font-mono focus:outline-none focus:border-primary/50"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Nombre *</label>
                                        <input required value={convertForm.first_name} onChange={(e) => setConvertForm({ ...convertForm, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Apellidos</label>
                                        <input value={convertForm.last_name} onChange={(e) => setConvertForm({ ...convertForm, last_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                </div>

                                {(convertForm.client_type === 'empresa' || convertForm.client_type === 'agencia') && (
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Razón social</label>
                                        <input value={convertForm.company_name} onChange={(e) => setConvertForm({ ...convertForm, company_name: e.target.value })} placeholder="Empresa S.L." className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                )}

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Email *</label>
                                        <input required type="email" value={convertForm.email} onChange={(e) => setConvertForm({ ...convertForm, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Teléfono</label>
                                        <input value={convertForm.phone} onChange={(e) => setConvertForm({ ...convertForm, phone: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                </div>

                                <p className="text-[10px] font-black text-primary uppercase tracking-widest border-b border-variable pb-2 pt-2">Dirección de facturación</p>

                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Dirección</label>
                                    <input value={convertForm.billing_address} onChange={(e) => setConvertForm({ ...convertForm, billing_address: e.target.value })} placeholder="C/ Calle, número, piso" className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                </div>

                                <div className="grid grid-cols-3 gap-3">
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">C.P.</label>
                                        <input value={convertForm.billing_postal_code} onChange={(e) => setConvertForm({ ...convertForm, billing_postal_code: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm font-mono focus:outline-none focus:border-primary/50" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">Ciudad</label>
                                        <input value={convertForm.billing_city} onChange={(e) => setConvertForm({ ...convertForm, billing_city: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">País</label>
                                        <input value={convertForm.billing_country} onChange={(e) => setConvertForm({ ...convertForm, billing_country: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50" />
                                    </div>
                                </div>

                                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 text-xs text-variable-muted mt-4">
                                    Al convertir: se crea el cliente con estos datos, el lead pasa a estado <strong className="text-primary">ganado</strong> y serás redirigido al detalle del cliente. Después podrás crearle proyectos.
                                </div>

                                <div className="flex gap-3 pt-2">
                                    <button
                                        type="button"
                                        onClick={closeConvertModal}
                                        disabled={convertBusy}
                                        className="flex-1 py-3 rounded-2xl border border-variable text-variable-main hover:bg-white/5 transition-all font-bold disabled:opacity-50"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={convertBusy}
                                        className="flex-1 py-3 rounded-2xl bg-primary text-white hover:brightness-110 transition-all font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                                    >
                                        {convertBusy ? 'Convirtiendo...' : <><UserCheck size={16} /> Convertir a cliente</>}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* GDPR Modal — Derecho al olvido */}
            <AnimatePresence>
                {gdprLead && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => !gdprBusy && closeGdprModal()}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-lg glass rounded-[2rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-500">
                                    <AlertTriangle size={24} />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold text-variable-main">Derecho al olvido (GDPR)</h2>
                                    <p className="text-xs text-variable-muted">Acción irreversible</p>
                                </div>
                            </div>

                            <p className="text-sm text-variable-muted mb-4">
                                Vas a procesar el borrado de los datos personales de:
                            </p>
                            <div className="bg-white/5 border border-variable rounded-2xl p-4 mb-4">
                                <p className="font-bold text-variable-main">{gdprLead.first_name} {gdprLead.last_name}</p>
                                <p className="text-xs text-variable-muted">{gdprLead.email}</p>
                            </div>

                            {gdprBusy && !gdprPreview && (
                                <div className="text-center py-4 text-variable-muted text-sm">
                                    <Clock className="inline animate-spin mr-2" size={16} />
                                    Calculando alcance...
                                </div>
                            )}

                            {gdprPreview && gdprPreview.status === 'dry_run' && (
                                <>
                                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 mb-4">
                                        <p className="text-xs font-black text-amber-500 uppercase tracking-widest mb-2">
                                            {gdprPreview.has_active_project ? 'Lead con proyecto' : 'Lead sin proyecto'}
                                        </p>
                                        <p className="text-xs text-variable-muted">{gdprPreview.warning}</p>
                                    </div>
                                    <div className="space-y-2 text-xs text-variable-muted mb-6">
                                        <p>Se afectarán:</p>
                                        <ul className="space-y-1 pl-4">
                                            <li>• <strong>{gdprPreview.would_delete.leads}</strong> registro(s) en <code>leads</code></li>
                                            <li>• <strong>{gdprPreview.would_delete.email_envios}</strong> correo(s) enviados en <code>email_envios</code></li>
                                            <li>• <strong>{gdprPreview.would_delete.project_milestones}</strong> en <code>project_milestones</code></li>
                                        </ul>
                                    </div>
                                </>
                            )}

                            {gdprPreview && gdprPreview.status === 'not_found' && (
                                <p className="text-sm text-amber-500 mb-4">No se encontró ningún lead con ese email en la base de datos.</p>
                            )}

                            {/* Re-autenticación admin */}
                            {gdprPreview && gdprPreview.status === 'dry_run' && (
                                <div className="border-t border-variable pt-4 mb-4">
                                    <p className="text-xs font-black text-rose-500 uppercase tracking-widest mb-3">
                                        <ShieldCheck className="inline mr-1" size={14} />
                                        Reautenticación requerida
                                    </p>
                                    <p className="text-xs text-variable-muted mb-3">
                                        Confirma tu identidad de administrador para ejecutar esta acción irreversible.
                                    </p>
                                    <div className="space-y-2 mb-2">
                                        <input
                                            type="email"
                                            placeholder="Email de admin"
                                            value={gdprAuthEmail}
                                            onChange={(e) => { setGdprAuthEmail(e.target.value); setGdprAuthError(null); }}
                                            autoComplete="off"
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/50 text-variable-main text-sm"
                                        />
                                        <input
                                            type="password"
                                            placeholder="Contraseña"
                                            value={gdprAuthPassword}
                                            onChange={(e) => { setGdprAuthPassword(e.target.value); setGdprAuthError(null); }}
                                            autoComplete="new-password"
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-rose-500/50 text-variable-main text-sm"
                                        />
                                    </div>
                                    {gdprAuthError && (
                                        <p className="text-xs text-rose-500 font-bold">{gdprAuthError}</p>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={closeGdprModal}
                                    disabled={gdprBusy}
                                    className="flex-1 py-3 rounded-2xl border border-variable text-variable-main hover:bg-white/5 transition-all font-bold disabled:opacity-50"
                                >
                                    Cancelar
                                </button>
                                {gdprPreview && gdprPreview.status === 'dry_run' && (
                                    <button
                                        onClick={confirmGdprDelete}
                                        disabled={gdprBusy || !gdprAuthEmail || !gdprAuthPassword}
                                        className="flex-1 py-3 rounded-2xl bg-rose-500 text-white hover:bg-rose-600 transition-all font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {gdprBusy ? 'Procesando...' : <><Trash2 size={16} /> Confirmar borrado</>}
                                    </button>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

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
                            className="relative w-full max-w-2xl glass rounded-[2rem] sm:rounded-[3rem] p-8 sm:p-12 min-h-[600px] shadow-2xl flex flex-col overflow-visible"
                        >
                            <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-variable-muted hover:text-primary transition-colors z-10">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl sm:text-3xl font-bold font-display mb-2 text-variable-main">Nuevo Lead</h2>
                            <p className="text-variable-muted mb-8 italic text-sm sm:text-base">Introduce los detalles del nuevo prospecto comercial</p>

                            <form onSubmit={handleCreateLead} className="space-y-5">
                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2">Información de Contacto</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Nombre</label>
                                        <input required value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Nombre" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Apellidos</label>
                                        <input required value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="Apellidos" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Email</label>
                                        <div className="relative">
                                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="email@ejemplo.com" />
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Teléfono</label>
                                        <div className="relative">
                                            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-variable-muted" size={18} />
                                            <input type="tel" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="w-full bg-white/5 border border-variable rounded-2xl pl-12 pr-4 py-3 focus:outline-none focus:border-primary/50 text-variable-main transition-all text-sm sm:text-base" placeholder="600 000 000" />
                                        </div>
                                    </div>
                                </div>

                                <p className="text-xs font-black text-primary uppercase tracking-[0.2em] border-b border-variable pb-2 pt-2">Perfil y Calificación</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Tipo de Cliente</label>
                                        <CustomDropdown
                                            value={formData.client_type}
                                            onChange={(val) => setFormData({ ...formData, client_type: val })}
                                            icon={Target}
                                            options={clientTypes}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-variable-muted uppercase tracking-widest ml-1">Interés</label>
                                        <CustomDropdown
                                            value={formData.service_interest}
                                            onChange={(val) => setFormData({ ...formData, service_interest: val })}
                                            icon={Briefcase}
                                            options={finalServiceInterests}
                                        />
                                    </div>
                                </div>

                                {/* Removed Score and Message fields for administrative creation */}

                                <button
                                    disabled={loading}
                                    type="submit"
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 active:scale-[0.98] transition-all shadow-xl shadow-primary/30 mt-8 flex items-center justify-center gap-2"
                                >
                                    {loading ? 'Procesando...' : <><ShieldCheck size={20} /> Crear Lead</>}
                                </button>
                                <div className="h-10" /> {/* Extra bottom spacing */}
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            <AgendarCitaModal
                abierto={!!citaContacto}
                contacto={citaContacto}
                onCerrar={() => setCitaContacto(null)}
                onGuardada={fetchLeads}
            />
        </div>
    );
}
