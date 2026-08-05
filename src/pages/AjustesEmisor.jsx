import React, { useEffect, useState } from 'react';
import { Settings, Save, Sun, Moon, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { validarIdFiscal } from '../lib/facturas';
import Sidebar from '../components/Sidebar';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../context/NotificationContext';

const SECCIONES = {
    emisor: 'Datos del emisor',
    fiscal: 'Defaults fiscales',
    numeracion: 'Numeración de facturas',
    verifactu: 'Sistema informático (Veri*factu)',
};

const CAMPOS_EMISOR = [
    { name: 'emisor_nombre', label: 'Nombre / Razón social', required: true },
    { name: 'emisor_nif', label: 'NIF / CIF', required: true, validate: 'nif' },
    { name: 'emisor_direccion', label: 'Dirección' },
    { name: 'emisor_cp', label: 'Código postal' },
    { name: 'emisor_ciudad', label: 'Ciudad' },
    { name: 'emisor_provincia', label: 'Provincia' },
    { name: 'emisor_pais', label: 'País' },
    { name: 'emisor_email', label: 'Email' },
    { name: 'emisor_telefono', label: 'Teléfono' },
    { name: 'emisor_web', label: 'Web' },
    { name: 'emisor_iban', label: 'IBAN' },
];

const CAMPOS_FISCAL = [
    { name: 'iva_default', label: 'IVA por defecto (%)', type: 'number' },
    { name: 'irpf_default', label: 'IRPF por defecto (%)', type: 'number' },
    { name: 'dias_vencimiento_default', label: 'Días de vencimiento', type: 'number' },
];

const CAMPOS_NUMERACION = [
    { name: 'serie_default', label: 'Serie por defecto (1 letra)', maxLength: 3 },
    { name: 'prefijo_anio', label: 'Incluir año en numeración (F-2026-0001)', type: 'boolean' },
];

const CAMPOS_VERIFACTU = [
    { name: 'verifactu_productor_nombre', label: 'Productor del software (opcional, por defecto el emisor)' },
    { name: 'verifactu_productor_nif', label: 'NIF del productor (opcional)', validate: 'nif-opcional' },
    { name: 'verifactu_sistema_nombre', label: 'Nombre del sistema informático', maxLength: 30 },
    { name: 'verifactu_sistema_id', label: 'ID sistema (1-2 caracteres alfanuméricos)', maxLength: 2 },
    { name: 'verifactu_version', label: 'Versión', maxLength: 50 },
    { name: 'verifactu_numero_instalacion', label: 'Número de instalación', maxLength: 100 },
];

export default function AjustesEmisor() {
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('emisor');
    const [form, setForm] = useState({});
    const [errors, setErrors] = useState({});

    useEffect(() => {
        (async () => {
            const { data, error } = await supabase
                .from('company_settings')
                .select('*')
                .eq('id', 1)
                .maybeSingle();
            if (error) {
                showNotification(`Error cargando ajustes: ${error.message}`, 'error');
            } else {
                setForm(data || {});
            }
            setLoading(false);
        })();
    }, []);

    const handleChange = (name, value) => {
        setForm(prev => ({ ...prev, [name]: value }));
        if (errors[name]) setErrors(prev => ({ ...prev, [name]: null }));
    };

    const validar = () => {
        const errs = {};
        for (const c of CAMPOS_EMISOR) {
            if (c.required && !form[c.name]) {
                errs[c.name] = 'Obligatorio';
            }
            if (c.validate === 'nif' && form[c.name]) {
                const r = validarIdFiscal(form[c.name]);
                if (!r.valido) errs[c.name] = r.error;
            }
        }
        for (const c of CAMPOS_VERIFACTU) {
            if (c.validate === 'nif-opcional' && form[c.name]?.trim()) {
                const r = validarIdFiscal(form[c.name]);
                if (!r.valido) errs[c.name] = r.error;
            }
        }
        if (form.verifactu_sistema_id) {
            if (!/^[A-Z0-9]{1,2}$/.test(form.verifactu_sistema_id.trim().toUpperCase())) {
                errs.verifactu_sistema_id = '1-2 caracteres alfanuméricos';
            }
        }
        setErrors(errs);
        return Object.keys(errs).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validar()) {
            showNotification('Revisa los campos marcados', 'error');
            return;
        }
        setSaving(true);
        try {
            const payload = { ...form };
            // Normalizar NIF emisor a mayúsculas sin espacios
            if (payload.emisor_nif) {
                payload.emisor_nif = payload.emisor_nif.trim().toUpperCase().replace(/[\s-]/g, '');
            }
            if (payload.verifactu_productor_nif) {
                payload.verifactu_productor_nif = payload.verifactu_productor_nif.trim().toUpperCase().replace(/[\s-]/g, '');
            }
            if (payload.verifactu_sistema_id) {
                payload.verifactu_sistema_id = payload.verifactu_sistema_id.trim().toUpperCase();
            }
            delete payload.id;
            delete payload.updated_at;

            const { error } = await supabase
                .from('company_settings')
                .update(payload)
                .eq('id', 1);
            if (error) throw error;
            showNotification('Ajustes guardados ✅', 'success');
        } catch (err) {
            showNotification(`Error guardando: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    };

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

    const isEmisorIncompleto = !form.emisor_nombre || !form.emisor_nif;

    const renderCampo = (c) => {
        const val = form[c.name] ?? '';
        const err = errors[c.name];
        const cls = `w-full glass border rounded-xl px-4 py-3 text-sm text-variable-main placeholder:text-variable-muted outline-none transition-colors ${
            err ? 'border-red-500/60' : 'border-variable focus:border-primary'
        }`;
        if (c.type === 'boolean') {
            return (
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!val}
                        onChange={(e) => handleChange(c.name, e.target.checked)}
                        className="size-4 accent-primary"
                    />
                    <span className="text-sm text-variable-main">{c.label}</span>
                </label>
            );
        }
        return (
            <div>
                <label className="text-[10px] uppercase font-black tracking-widest text-variable-muted block mb-2">
                    {c.label} {c.required && <span className="text-red-400">*</span>}
                </label>
                <input
                    type={c.type || 'text'}
                    value={val}
                    onChange={(e) => handleChange(c.name, c.type === 'number' ? e.target.value : e.target.value)}
                    maxLength={c.maxLength}
                    className={cls}
                />
                {err && <p className="text-xs text-red-400 mt-1">{err}</p>}
            </div>
        );
    };

    return (
        <div className="flex min-h-screen transition-colors duration-300 overflow-hidden">
            <Sidebar />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-32 md:pb-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Configuración</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <Settings className="text-primary" /> Ajustes del emisor
                        </h1>
                    </div>
                    <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary self-start sm:self-auto">
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>

                {/* Alerta si falta emisor */}
                {isEmisorIncompleto ? (
                    <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-5 mb-6 flex items-start gap-3">
                        <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-bold text-red-300">Configura los datos del emisor antes de emitir facturas</p>
                            <p className="text-xs text-red-300/80 mt-1">
                                Sin nombre/razón social y NIF válidos del emisor no se podrá registrar ninguna factura en Veri*factu.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 mb-6 flex items-start gap-3">
                        <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-bold text-emerald-300">Emisor configurado</p>
                            <p className="text-xs text-emerald-300/80 mt-1">
                                {form.emisor_nombre} · {form.emisor_nif}
                            </p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {Object.entries(SECCIONES).map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                                activeTab === id ? 'bg-primary text-white' : 'glass border border-variable text-variable-muted hover:text-primary'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className="glass rounded-2xl border border-variable p-6 sm:p-8">
                    {activeTab === 'emisor' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_EMISOR.map(c => <div key={c.name}>{renderCampo(c)}</div>)}
                        </div>
                    )}

                    {activeTab === 'fiscal' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_FISCAL.map(c => <div key={c.name}>{renderCampo(c)}</div>)}
                            <div className="sm:col-span-2">
                                <label className="text-[10px] uppercase font-black tracking-widest text-variable-muted block mb-2">
                                    Forma de pago por defecto
                                </label>
                                <select
                                    value={form.forma_pago_default ?? 'transferencia'}
                                    onChange={(e) => handleChange('forma_pago_default', e.target.value)}
                                    className="w-full glass border border-variable rounded-xl px-4 py-3 text-sm text-variable-main outline-none focus:border-primary"
                                >
                                    <option value="transferencia">Transferencia</option>
                                    <option value="efectivo">Efectivo</option>
                                    <option value="bizum">Bizum</option>
                                    <option value="tarjeta">Tarjeta</option>
                                    <option value="domiciliacion">Domiciliación</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2">
                                <label className="text-[10px] uppercase font-black tracking-widest text-variable-muted block mb-2">
                                    Pie de página (aparece en el PDF)
                                </label>
                                <textarea
                                    rows={2}
                                    value={form.pie_pagina ?? ''}
                                    onChange={(e) => handleChange('pie_pagina', e.target.value)}
                                    className="w-full glass border border-variable rounded-xl px-4 py-3 text-sm text-variable-main outline-none focus:border-primary resize-none"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'numeracion' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_NUMERACION.map(c => <div key={c.name}>{renderCampo(c)}</div>)}
                            <div className="sm:col-span-2 glass border border-variable rounded-xl p-4 bg-amber-500/5">
                                <p className="text-xs text-amber-300 font-semibold mb-1">⚠️ Numeración fiscal</p>
                                <p className="text-xs text-variable-muted">
                                    Por ley los correlativos deben ser únicos y consecutivos dentro de cada serie y año.
                                    Cambiar la serie o desactivar el año reinicia la cuenta para esa combinación.
                                    No se pueden modificar facturas ya emitidas.
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'verifactu' && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_VERIFACTU.map(c => <div key={c.name}>{renderCampo(c)}</div>)}
                            <div className="sm:col-span-2 glass border border-variable rounded-xl p-4 bg-blue-500/5">
                                <p className="text-xs text-blue-300 font-semibold mb-1">ℹ️ Bloque SistemaInformatico</p>
                                <p className="text-xs text-variable-muted leading-relaxed">
                                    Estos datos van en cada registro Veri*factu enviado a la AEAT. Si el software se usa internamente,
                                    el productor coincide con el emisor (puedes dejarlos en blanco). Solo cambia el ID de sistema si rotas
                                    a un instalador distinto — afecta a la trazabilidad pero no rompe la cadena.
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end pt-6 mt-6 border-t border-variable">
                        <button
                            type="submit"
                            disabled={saving}
                            className="bg-primary text-white px-6 py-3 rounded-2xl font-bold flex items-center gap-2 hover:brightness-110 transition-all disabled:opacity-50"
                        >
                            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar cambios'}
                        </button>
                    </div>
                </form>
            </main>
        </div>
    );
}
