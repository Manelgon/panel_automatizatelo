import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, Mail, Phone, MapPin, Hash, Building2, User, Edit3,
    FolderOpen, FileText, Wallet, Receipt, Files, Flag, X,
    ChevronRight, Calendar, CheckCircle
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import Sidebar from '../components/Sidebar';
import CustomSelect from '../components/CustomSelect';
import { useNotifications } from '../context/NotificationContext';

export default function ClienteDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [cliente, setCliente] = useState(null);
    const [activeTab, setActiveTab] = useState('proyectos');
    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({});
    const [saving, setSaving] = useState(false);

    const tabs = [
        { id: 'proyectos', label: 'Proyectos', icon: FolderOpen },
        { id: 'facturas', label: 'Facturas', icon: Receipt },
        { id: 'presupuestos', label: 'Presupuestos', icon: Wallet },
        { id: 'hitos', label: 'Hitos', icon: Flag },
        { id: 'pagos', label: 'Pagos', icon: FileText },
        { id: 'archivos', label: 'Archivos', icon: Files },
    ];

    const fetchCliente = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('clients')
                .select(`
                    *,
                    projects (
                        id, name, status, total_hours, alias, description, created_at,
                        project_invoices (id, invoice_number, total_amount, status, issue_date),
                        project_budgets (id, total_amount, status, created_at),
                        project_milestones (id, title, status, due_date),
                        project_payments (id, amount, payment_date, method, status),
                        project_files (id, file_name, file_url, uploaded_at)
                    )
                `)
                .eq('id', id)
                .single();

            if (error) throw error;
            setCliente(data);
            setEditForm({
                first_name: data.first_name || '',
                last_name: data.last_name || '',
                email: data.email || '',
                phone: data.phone || '',
                client_type: data.client_type || 'particular',
                company_name: data.company_name || '',
                tax_id: data.tax_id || '',
                billing_address: data.billing_address || '',
                billing_postal_code: data.billing_postal_code || '',
                billing_city: data.billing_city || '',
                billing_country: data.billing_country || 'España',
                notes: data.notes || '',
                status: data.status || 'active',
            });
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
            navigate('/clientes');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchCliente(); }, [id]);

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            const { error } = await supabase
                .from('clients')
                .update(editForm)
                .eq('id', id);

            if (error) throw error;
            showNotification('Cliente actualizado', 'success');
            setEditOpen(false);
            fetchCliente();
        } catch (err) {
            showNotification(`Error: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

    // Agregados desde proyectos
    const allInvoices = (cliente?.projects || []).flatMap(p =>
        (p.project_invoices || []).map(i => ({ ...i, project_name: p.name, project_id: p.id }))
    );
    const allBudgets = (cliente?.projects || []).flatMap(p =>
        (p.project_budgets || []).map(b => ({ ...b, project_name: p.name, project_id: p.id }))
    );
    const allMilestones = (cliente?.projects || []).flatMap(p =>
        (p.project_milestones || []).map(m => ({ ...m, project_name: p.name, project_id: p.id }))
    );
    const allPayments = (cliente?.projects || []).flatMap(p =>
        (p.project_payments || []).map(pay => ({ ...pay, project_name: p.name, project_id: p.id }))
    );
    const allFiles = (cliente?.projects || []).flatMap(p =>
        (p.project_files || []).map(f => ({ ...f, project_name: p.name, project_id: p.id }))
    );

    const totalFacturado = allInvoices.reduce((s, i) => s + (parseFloat(i.total_amount) || 0), 0);
    const totalCobrado = allPayments
        .filter(p => p.status === 'completed' || p.status === 'paid')
        .reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);

    if (loading) {
        return (
            <div className="flex min-h-screen">
                <Sidebar />
                <main className="flex-1 flex items-center justify-center">
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    if (!cliente) return null;

    const displayName = cliente.company_name || `${cliente.first_name} ${cliente.last_name || ''}`.trim();

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => navigate('/clientes')}
                        className="p-3 glass rounded-2xl text-variable-muted hover:text-primary transition-all"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div className="flex-1">
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Cliente</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main">{displayName}</h1>
                    </div>
                    <button
                        onClick={() => setEditOpen(true)}
                        className="bg-primary text-white px-5 py-3 rounded-2xl font-bold flex items-center gap-2 hover:brightness-110 transition-all"
                    >
                        <Edit3 size={16} /> Editar
                    </button>
                </div>

                {/* Info cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
                    <div className="glass rounded-2xl p-6 border border-variable">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-3">Contacto</p>
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center gap-2 text-variable-main">
                                {cliente.client_type === 'empresa' || cliente.client_type === 'agencia'
                                    ? <Building2 size={14} className="text-primary" />
                                    : <User size={14} className="text-primary" />}
                                <span>{displayName}</span>
                            </div>
                            <div className="flex items-center gap-2 text-variable-main">
                                <Mail size={14} className="text-primary" />
                                <a href={`mailto:${cliente.email}`} className="hover:text-primary">{cliente.email}</a>
                            </div>
                            {cliente.phone && (
                                <div className="flex items-center gap-2 text-variable-main">
                                    <Phone size={14} className="text-primary" />
                                    <a href={`tel:${cliente.phone}`} className="hover:text-primary">{cliente.phone}</a>
                                </div>
                            )}
                            {cliente.tax_id && (
                                <div className="flex items-center gap-2 text-variable-main">
                                    <Hash size={14} className="text-primary" />
                                    <span className="font-mono">{cliente.tax_id}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="glass rounded-2xl p-6 border border-variable">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-3">Dirección facturación</p>
                        {cliente.billing_address ? (
                            <div className="text-sm text-variable-main flex items-start gap-2">
                                <MapPin size={14} className="text-primary mt-1 flex-shrink-0" />
                                <div>
                                    <p>{cliente.billing_address}</p>
                                    <p>{[cliente.billing_postal_code, cliente.billing_city].filter(Boolean).join(' ')}</p>
                                    <p>{cliente.billing_country}</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-variable-muted text-sm italic">Sin dirección de facturación</p>
                        )}
                    </div>

                    <div className="glass rounded-2xl p-6 border border-variable">
                        <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-3">Resumen económico</p>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-variable-muted">Facturado</span>
                                <span className="font-bold text-variable-main">{totalFacturado.toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-variable-muted">Cobrado</span>
                                <span className="font-bold text-emerald-500">{totalCobrado.toFixed(2)}€</span>
                            </div>
                            <div className="flex justify-between pt-2 border-t border-variable">
                                <span className="text-variable-muted">Pendiente</span>
                                <span className="font-bold text-amber-500">{(totalFacturado - totalCobrado).toFixed(2)}€</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6 bg-white/5 p-1.5 rounded-[1.5rem] border border-variable w-fit overflow-x-auto">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === tab.id
                                    ? 'bg-primary text-white shadow-lg shadow-primary/20'
                                    : 'text-variable-muted hover:text-variable-main hover:bg-white/5'
                                    }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Tab content */}
                <div className="glass rounded-2xl p-6 border border-variable min-h-[300px]">
                    {activeTab === 'proyectos' && (
                        <TabList
                            items={cliente.projects || []}
                            emptyText="Este cliente no tiene proyectos todavía"
                            renderItem={(p) => (
                                <Link
                                    key={p.id}
                                    to={`/projects/${p.id}`}
                                    className="flex items-center justify-between p-4 rounded-xl border border-variable hover:border-primary/40 hover:bg-primary/5 transition-all"
                                >
                                    <div>
                                        <p className="font-bold text-variable-main">{p.name}</p>
                                        <p className="text-xs text-variable-muted">{p.alias || p.description?.slice(0, 60) || '—'}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase font-bold text-variable-muted">{p.status}</span>
                                        <span className="text-xs text-variable-muted">{p.total_hours}h</span>
                                        <ChevronRight size={16} className="text-primary" />
                                    </div>
                                </Link>
                            )}
                        />
                    )}

                    {activeTab === 'facturas' && (
                        <TabList
                            items={allInvoices}
                            emptyText="Sin facturas emitidas"
                            renderItem={(i) => (
                                <div key={i.id} className="flex items-center justify-between p-4 rounded-xl border border-variable">
                                    <div>
                                        <p className="font-bold text-variable-main">{i.invoice_number || `Factura #${i.id.slice(0, 8)}`}</p>
                                        <p className="text-xs text-variable-muted">Proyecto: {i.project_name}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase font-bold text-variable-muted">{i.status}</span>
                                        <span className="font-bold text-variable-main">{parseFloat(i.total_amount || 0).toFixed(2)}€</span>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'presupuestos' && (
                        <TabList
                            items={allBudgets}
                            emptyText="Sin presupuestos creados"
                            renderItem={(b) => (
                                <div key={b.id} className="flex items-center justify-between p-4 rounded-xl border border-variable">
                                    <div>
                                        <p className="font-bold text-variable-main">Presupuesto #{b.id.slice(0, 8)}</p>
                                        <p className="text-xs text-variable-muted">Proyecto: {b.project_name}</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase font-bold text-variable-muted">{b.status}</span>
                                        <span className="font-bold text-variable-main">{parseFloat(b.total_amount || 0).toFixed(2)}€</span>
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'hitos' && (
                        <TabList
                            items={allMilestones}
                            emptyText="Sin hitos definidos"
                            renderItem={(m) => (
                                <div key={m.id} className="flex items-center justify-between p-4 rounded-xl border border-variable">
                                    <div className="flex items-center gap-3">
                                        <CheckCircle size={16} className={m.status === 'completed' ? 'text-emerald-500' : 'text-variable-muted'} />
                                        <div>
                                            <p className="font-bold text-variable-main">{m.title}</p>
                                            <p className="text-xs text-variable-muted">Proyecto: {m.project_name}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase font-bold text-variable-muted">{m.status}</span>
                                        {m.due_date && <span className="text-xs text-variable-muted flex items-center gap-1"><Calendar size={12} />{new Date(m.due_date).toLocaleDateString('es-ES')}</span>}
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'pagos' && (
                        <TabList
                            items={allPayments}
                            emptyText="Sin pagos registrados"
                            renderItem={(p) => (
                                <div key={p.id} className="flex items-center justify-between p-4 rounded-xl border border-variable">
                                    <div>
                                        <p className="font-bold text-variable-main">Pago de {parseFloat(p.amount || 0).toFixed(2)}€</p>
                                        <p className="text-xs text-variable-muted">{p.method || 'Sin método'} · {p.project_name}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <span className="px-2 py-1 rounded-md bg-white/5 text-[10px] uppercase font-bold text-variable-muted">{p.status}</span>
                                        {p.payment_date && <span className="text-xs text-variable-muted">{new Date(p.payment_date).toLocaleDateString('es-ES')}</span>}
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'archivos' && (
                        <TabList
                            items={allFiles}
                            emptyText="Sin archivos subidos"
                            renderItem={(f) => (
                                <a
                                    key={f.id}
                                    href={f.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-between p-4 rounded-xl border border-variable hover:border-primary/40 hover:bg-primary/5 transition-all"
                                >
                                    <div className="flex items-center gap-3">
                                        <Files size={16} className="text-primary" />
                                        <div>
                                            <p className="font-bold text-variable-main">{f.file_name}</p>
                                            <p className="text-xs text-variable-muted">{f.project_name}</p>
                                        </div>
                                    </div>
                                    {f.uploaded_at && <span className="text-xs text-variable-muted">{new Date(f.uploaded_at).toLocaleDateString('es-ES')}</span>}
                                </a>
                            )}
                        />
                    )}
                </div>
            </main>

            {/* Modal edición */}
            <AnimatePresence>
                {editOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setEditOpen(false)}
                            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-2xl glass rounded-[2rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto"
                        >
                            <button onClick={() => setEditOpen(false)} className="absolute top-6 right-6 text-variable-muted hover:text-primary">
                                <X size={24} />
                            </button>

                            <h2 className="text-2xl font-bold text-variable-main mb-6">Editar cliente</h2>

                            <form onSubmit={handleSave} className="space-y-4">
                                <p className="text-[10px] font-black text-primary uppercase tracking-widest border-b border-variable pb-2">Tipo y datos</p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="Tipo">
                                        <select
                                            value={editForm.client_type}
                                            onChange={(e) => setEditForm({ ...editForm, client_type: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50"
                                        >
                                            <option value="particular">Particular</option>
                                            <option value="empresa">Empresa</option>
                                            <option value="agencia">Agencia</option>
                                            <option value="otro">Otro</option>
                                        </select>
                                    </Field>
                                    <Field label="Estado">
                                        <select
                                            value={editForm.status}
                                            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50"
                                        >
                                            <option value="active">Activo</option>
                                            <option value="inactive">Inactivo</option>
                                            <option value="archived">Archivado</option>
                                        </select>
                                    </Field>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="Nombre"><Input value={editForm.first_name} onChange={(v) => setEditForm({ ...editForm, first_name: v })} required /></Field>
                                    <Field label="Apellidos"><Input value={editForm.last_name} onChange={(v) => setEditForm({ ...editForm, last_name: v })} /></Field>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="Email"><Input type="email" value={editForm.email} onChange={(v) => setEditForm({ ...editForm, email: v })} required /></Field>
                                    <Field label="Teléfono"><Input value={editForm.phone} onChange={(v) => setEditForm({ ...editForm, phone: v })} /></Field>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Field label="Empresa (si aplica)"><Input value={editForm.company_name} onChange={(v) => setEditForm({ ...editForm, company_name: v })} /></Field>
                                    <Field label="NIF/CIF"><Input value={editForm.tax_id} onChange={(v) => setEditForm({ ...editForm, tax_id: v })} /></Field>
                                </div>

                                <p className="text-[10px] font-black text-primary uppercase tracking-widest border-b border-variable pb-2 pt-3">Dirección facturación</p>

                                <Field label="Dirección"><Input value={editForm.billing_address} onChange={(v) => setEditForm({ ...editForm, billing_address: v })} /></Field>

                                <div className="grid grid-cols-3 gap-3">
                                    <Field label="C.P."><Input value={editForm.billing_postal_code} onChange={(v) => setEditForm({ ...editForm, billing_postal_code: v })} /></Field>
                                    <Field label="Ciudad"><Input value={editForm.billing_city} onChange={(v) => setEditForm({ ...editForm, billing_city: v })} /></Field>
                                    <Field label="País"><Input value={editForm.billing_country} onChange={(v) => setEditForm({ ...editForm, billing_country: v })} /></Field>
                                </div>

                                <Field label="Notas internas">
                                    <textarea
                                        value={editForm.notes}
                                        onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                                        rows={3}
                                        className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50 resize-none"
                                    />
                                </Field>

                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="w-full py-4 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all disabled:opacity-50"
                                >
                                    {saving ? 'Guardando...' : 'Guardar cambios'}
                                </button>
                            </form>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-variable-muted uppercase tracking-widest ml-1 block">{label}</label>
            {children}
        </div>
    );
}

function Input({ value, onChange, type = 'text', required = false }) {
    return (
        <input
            type={type}
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            required={required}
            className="w-full bg-white/5 border border-variable rounded-2xl px-4 py-3 text-variable-main text-sm focus:outline-none focus:border-primary/50"
        />
    );
}

function TabList({ items, emptyText, renderItem }) {
    if (!items || items.length === 0) {
        return <p className="text-center text-variable-muted py-12 italic">{emptyText}</p>;
    }
    return <div className="space-y-2">{items.map(renderItem)}</div>;
}
