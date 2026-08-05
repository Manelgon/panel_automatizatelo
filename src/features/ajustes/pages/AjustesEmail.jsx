import React, { useEffect, useState } from 'react';
import {
    Mail, Save, Send, Sun, Moon, AlertTriangle, CheckCircle2,
    Inbox, Zap, FileCode2, History, RefreshCw, KeyRound
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import { useTheme } from '../../../context/ThemeContext';
import { useNotifications } from '../../../context/NotificationContext';

const SECCIONES = {
    smtp: { label: 'Envío (SMTP)', icon: Send },
    imap: { label: 'Bandeja (IMAP)', icon: Inbox },
    automatico: { label: 'Email automático', icon: Zap },
    plantillas: { label: 'Plantillas', icon: FileCode2 },
    historial: { label: 'Historial', icon: History },
};

const CAMPOS_SMTP = [
    { name: 'smtp_host', label: 'Servidor SMTP', placeholder: 'smtp.tudominio.com' },
    { name: 'smtp_port', label: 'Puerto', type: 'number', placeholder: '465' },
    { name: 'smtp_user', label: 'Usuario / dirección', placeholder: 'hola@automatizatelo.com' },
    { name: 'smtp_password', label: 'Contraseña', type: 'password', secreto: true },
    { name: 'smtp_encryption', label: 'Cifrado', type: 'select', opciones: [['ssl', 'SSL/TLS directo (puerto 465)'], ['starttls', 'STARTTLS (puerto 587)']] },
    { name: 'smtp_from_name', label: 'Nombre del remitente', placeholder: 'Manel · Automatizatelo' },
    { name: 'smtp_reply_to', label: 'Responder a (opcional)', placeholder: 'serincosol@gmail.com' },
];

const CAMPOS_IMAP = [
    { name: 'imap_host', label: 'Servidor IMAP', placeholder: 'imap.tudominio.com' },
    { name: 'imap_port', label: 'Puerto', type: 'number', placeholder: '993' },
    { name: 'imap_user', label: 'Usuario / dirección', placeholder: 'hola@automatizatelo.com' },
    { name: 'imap_password', label: 'Contraseña', type: 'password', secreto: true },
    { name: 'imap_encryption', label: 'Cifrado', type: 'select', opciones: [['ssl', 'SSL/TLS (puerto 993)'], ['starttls', 'STARTTLS (puerto 143)']] },
];

const CAMPOS_AUTOMATICO = [
    { name: 'agenda_url', label: 'Enlace de agenda (Cal.com)', placeholder: 'https://cal.com/manel/30min', ancho: true },
    { name: 'whatsapp_url', label: 'Enlace de WhatsApp', placeholder: 'https://wa.me/34678399182', ancho: true },
    { name: 'edge_url', label: 'URL de la Edge Function', placeholder: 'https://xxxx.supabase.co/functions/v1/email', ancho: true },
    { name: 'edge_secret', label: 'Secreto compartido (lo usa la base de datos)', type: 'password', secreto: true, ancho: true },
];

const ESTADO_COLOR = {
    enviado: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    error: 'text-red-400 bg-red-500/10 border-red-500/30',
    pendiente: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
};

export default function AjustesEmail() {
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification } = useNotifications();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [probando, setProbando] = useState(false);
    const [activeTab, setActiveTab] = useState('smtp');

    const [form, setForm] = useState({});
    const [flags, setFlags] = useState({});
    const [claveOk, setClaveOk] = useState(true);
    const [funcionCaida, setFuncionCaida] = useState(false);
    const [emailPrueba, setEmailPrueba] = useState('');

    const [plantillas, setPlantillas] = useState([]);
    const [plantillaSel, setPlantillaSel] = useState(null);
    const [envios, setEnvios] = useState([]);

    // -------------------------------------------------------------------------
    // Carga
    // -------------------------------------------------------------------------
    const llamar = async (body) => {
        const { data, error } = await supabase.functions.invoke('email', { body });
        if (error) {
            // El cuerpo de error de la función viene en error.context
            let detalle = error.message;
            try {
                const j = await error.context?.json();
                if (j?.error) detalle = j.error;
            } catch { /* el error no traía JSON */ }

            // supabase-js devuelve este mensaje genérico cuando ni siquiera
            // consigue hablar con la función. Casi siempre es una de dos cosas.
            if (/failed to send a request/i.test(detalle)) {
                setFuncionCaida(true);
                detalle = 'No se llega a la Edge Function «email». O no está desplegada todavía, o la ruta /functions no llega a Supabase.';
            }
            throw new Error(detalle);
        }
        if (data?.error) throw new Error(data.error);
        return data;
    };

    const cargarConfig = async () => {
        try {
            const data = await llamar({ accion: 'leer-config' });
            const cfg = data.config || {};
            setFlags({
                smtp: cfg.smtp_password_guardada,
                imap: cfg.imap_password_guardada,
                edge: cfg.edge_secret_guardado,
            });
            setClaveOk(!!data.clave_cifrado_ok);
            // Las contraseñas nunca vuelven del servidor: campos siempre vacíos
            setForm({ ...cfg, smtp_password: '', imap_password: '', edge_secret: '' });
            if (!emailPrueba && cfg.smtp_user) setEmailPrueba(cfg.smtp_user);
        } catch (err) {
            showNotification(`No se pudo cargar la configuración: ${err.message}`, 'error');
        }
        setLoading(false);
    };

    const cargarPlantillas = async () => {
        const { data, error } = await supabase.from('email_plantillas').select('*').order('clave');
        if (error) return showNotification(`Error cargando plantillas: ${error.message}`, 'error');
        setPlantillas(data || []);
        setPlantillaSel((prev) => prev ?? (data?.[0] ?? null));
    };

    const cargarEnvios = async () => {
        const { data, error } = await supabase
            .from('email_envios')
            .select('id, para, asunto, plantilla, origen, estado, error, sent_at, created_at')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) return showNotification(`Error cargando historial: ${error.message}`, 'error');
        setEnvios(data || []);
    };

    useEffect(() => { cargarConfig(); }, []);
    useEffect(() => {
        if (activeTab === 'plantillas') cargarPlantillas();
        if (activeTab === 'historial') cargarEnvios();
    }, [activeTab]);

    // -------------------------------------------------------------------------
    // Acciones
    // -------------------------------------------------------------------------
    const handleChange = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

    const guardar = async (e) => {
        e?.preventDefault();
        setSaving(true);
        try {
            await llamar({ accion: 'guardar-config', config: form });
            showNotification('Configuración guardada', 'success');
            await cargarConfig();
        } catch (err) {
            showNotification(`No se pudo guardar: ${err.message}`, 'error');
        }
        setSaving(false);
    };

    const probar = async () => {
        if (!emailPrueba.trim()) return showNotification('Escribe una dirección de prueba', 'error');
        setProbando(true);
        try {
            const r = await llamar({ accion: 'probar', to: emailPrueba.trim() });
            showNotification(r.mensaje || 'Correo de prueba enviado', 'success');
        } catch (err) {
            showNotification(`Falló el envío de prueba: ${err.message}`, 'error');
        }
        setProbando(false);
    };

    const guardarPlantilla = async () => {
        if (!plantillaSel) return;
        setSaving(true);
        const { error } = await supabase
            .from('email_plantillas')
            .update({
                asunto: plantillaSel.asunto,
                html: plantillaSel.html,
                activa: plantillaSel.activa,
                updated_at: new Date().toISOString(),
            })
            .eq('clave', plantillaSel.clave);
        setSaving(false);
        if (error) return showNotification(`No se pudo guardar la plantilla: ${error.message}`, 'error');
        showNotification('Plantilla guardada', 'success');
        cargarPlantillas();
    };

    // -------------------------------------------------------------------------
    // Render de campos
    // -------------------------------------------------------------------------
    const inputCls = 'w-full glass border border-variable focus:border-primary rounded-xl px-4 py-3 text-sm text-variable-main placeholder:text-variable-muted outline-none transition-colors';

    const renderCampo = (c, guardada) => {
        const val = form[c.name] ?? '';
        return (
            <div className={c.ancho ? 'sm:col-span-2' : ''}>
                <label className="text-[10px] uppercase font-black tracking-widest text-variable-muted block mb-2">
                    {c.label}
                    {c.secreto && guardada && (
                        <span className="ml-2 text-emerald-400 normal-case tracking-normal font-bold">· guardada</span>
                    )}
                </label>
                {c.type === 'select' ? (
                    <select value={val} onChange={(e) => handleChange(c.name, e.target.value)} className={inputCls}>
                        {c.opciones.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                ) : (
                    <input
                        type={c.type || 'text'}
                        value={val}
                        autoComplete={c.type === 'password' ? 'new-password' : 'off'}
                        placeholder={c.secreto && guardada ? '•••••••• (déjalo vacío para no cambiarla)' : c.placeholder}
                        onChange={(e) => handleChange(c.name, e.target.value)}
                        className={inputCls}
                    />
                )}
            </div>
        );
    };

    const smtpListo = !!form.smtp_host && !!form.smtp_user && !!flags.smtp;

    if (loading) {
        return (
            <div className="flex flex-col min-h-screen">
                <BarraNavegacion />
                <main className="flex-1 flex items-center justify-center">
                    <div className="size-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                </main>
            </div>
        );
    }

    return (
        <div className="flex flex-col min-h-screen transition-colors duration-300 overflow-hidden">
            <BarraNavegacion />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-10">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">Configuración</p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3">
                            <Mail className="text-primary" /> Correo del panel
                        </h1>
                    </div>
                    <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary self-start sm:self-auto">
                        {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                    </button>
                </div>

                {/* Estado */}
                {funcionCaida && (
                    <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-5 mb-6">
                        <div className="flex items-start gap-3">
                            <AlertTriangle className="text-red-400 shrink-0 mt-0.5" size={20} />
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-red-300">No se llega a la Edge Function «email»</p>
                                <p className="text-xs text-red-300/80 mt-1 leading-relaxed">
                                    Sin ella esta pantalla no puede leer ni guardar nada: las contraseñas
                                    se cifran allí, nunca en el navegador. Suele ser una de estas dos:
                                </p>
                                <ol className="text-xs text-red-300/80 mt-3 space-y-2 list-decimal pl-4 leading-relaxed">
                                    <li>
                                        <strong className="text-red-200">La función no está desplegada.</strong>{' '}
                                        En Supabase → Edge Functions, crea una llamada <code>email</code> y pega
                                        el contenido de <code>supabase/functions/email/index.ts</code>.
                                        Después, en Settings → Edge Functions → Secrets, añade{' '}
                                        <code>EMAIL_ENCRYPTION_KEY</code> con 64 caracteres hexadecimales.
                                    </li>
                                    <li>
                                        <strong className="text-red-200">La ruta no llega a Supabase.</strong>{' '}
                                        Si el panel habla con Supabase a través de su propio dominio, en{' '}
                                        <code>vercel.json</code> tiene que existir la regla de{' '}
                                        <code>/functions/(.*)</code>, no solo las de <code>/rest</code> y{' '}
                                        <code>/auth</code>.
                                    </li>
                                </ol>
                                <p className="text-[11px] text-red-300/60 mt-3 font-mono break-all">
                                    URL de Supabase en uso: {import.meta.env.VITE_PUBLIC_SUPABASE_URL || '(sin definir)'}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {!claveOk && !funcionCaida && (
                    <div className="glass rounded-2xl border border-red-500/30 bg-red-500/5 p-5 mb-4 flex items-start gap-3">
                        <KeyRound className="text-red-400 shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-bold text-red-300">Falta la clave de cifrado</p>
                            <p className="text-xs text-red-300/80 mt-1">
                                La Edge Function no tiene <code>EMAIL_ENCRYPTION_KEY</code> (64 caracteres hex).
                                Sin ella no se pueden guardar ni leer las contraseñas.
                            </p>
                        </div>
                    </div>
                )}

                {smtpListo ? (
                    <div className="glass rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5 mb-6 flex items-start gap-3">
                        <CheckCircle2 className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-bold text-emerald-300">Envío configurado</p>
                            <p className="text-xs text-emerald-300/80 mt-1">
                                {form.smtp_user} · {form.smtp_host}:{form.smtp_port}
                                {form.bienvenida_activa
                                    ? ' · el email de bienvenida está ACTIVO'
                                    : ' · el email de bienvenida está desactivado'}
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 mb-6 flex items-start gap-3">
                        <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-bold text-amber-300">SMTP sin configurar</p>
                            <p className="text-xs text-amber-300/80 mt-1">
                                Rellena servidor, usuario y contraseña, guarda y lanza un correo de prueba.
                            </p>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="flex flex-wrap gap-2 mb-6">
                    {Object.entries(SECCIONES).map(([id, { label, icon: Icon }]) => (
                        <button
                            key={id}
                            type="button"
                            onClick={() => setActiveTab(id)}
                            className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                                activeTab === id ? 'bg-primary text-white' : 'glass border border-variable text-variable-muted hover:text-primary'
                            }`}
                        >
                            <Icon size={15} /> {label}
                        </button>
                    ))}
                </div>

                {/* ---------------------------------------------------------------- */}
                {activeTab === 'smtp' && (
                    <form onSubmit={guardar} className="glass rounded-2xl border border-variable p-6 sm:p-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_SMTP.map((c) => <React.Fragment key={c.name}>{renderCampo(c, flags.smtp)}</React.Fragment>)}
                        </div>

                        <div className="mt-8 pt-6 border-t border-variable">
                            <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mb-3">Probar la configuración</p>
                            <div className="flex flex-col sm:flex-row gap-3">
                                <input
                                    type="email"
                                    value={emailPrueba}
                                    onChange={(e) => setEmailPrueba(e.target.value)}
                                    placeholder="tu@correo.com"
                                    className={inputCls + ' sm:flex-1'}
                                />
                                <button
                                    type="button"
                                    onClick={probar}
                                    disabled={probando || !smtpListo}
                                    className="px-5 py-3 rounded-xl glass border border-variable text-sm font-bold text-variable-main hover:text-primary hover:border-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {probando ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                                    Enviar prueba
                                </button>
                            </div>
                            <p className="text-xs text-variable-muted mt-2">
                                Guarda primero los cambios: la prueba usa lo que hay en la base de datos, no lo que ves en pantalla.
                            </p>
                        </div>

                        <BotonGuardar saving={saving} />
                    </form>
                )}

                {/* ---------------------------------------------------------------- */}
                {activeTab === 'imap' && (
                    <form onSubmit={guardar} className="glass rounded-2xl border border-variable p-6 sm:p-8">
                        <div className="rounded-xl border border-variable bg-white/5 p-4 mb-6 flex items-start gap-3">
                            <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={18} />
                            <p className="text-xs text-variable-muted leading-relaxed">
                                <strong className="text-variable-main">Guardado, pero todavía sin usar.</strong> Leer la bandeja
                                de entrada necesita un cliente IMAP con sockets, y las Edge Functions no lo permiten de
                                forma fiable. Estas credenciales quedan cifradas aquí para cuando exista un servicio que
                                pueda usarlas. El <strong className="text-variable-main">envío</strong> (pestaña SMTP) sí
                                funciona y es lo que quita la dependencia de n8n.
                            </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_IMAP.map((c) => <React.Fragment key={c.name}>{renderCampo(c, flags.imap)}</React.Fragment>)}
                        </div>
                        <BotonGuardar saving={saving} />
                    </form>
                )}

                {/* ---------------------------------------------------------------- */}
                {activeTab === 'automatico' && (
                    <form onSubmit={guardar} className="glass rounded-2xl border border-variable p-6 sm:p-8">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                            {CAMPOS_AUTOMATICO.map((c) => (
                                <React.Fragment key={c.name}>
                                    {renderCampo(c, c.name === 'edge_secret' ? flags.edge : false)}
                                </React.Fragment>
                            ))}

                            <div className="sm:col-span-2 pt-4 border-t border-variable">
                                <label className="flex items-start gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={!!form.bienvenida_activa}
                                        onChange={(e) => handleChange('bienvenida_activa', e.target.checked)}
                                        className="size-4 accent-primary mt-1"
                                    />
                                    <span>
                                        <span className="text-sm font-bold text-variable-main block">
                                            Enviar el email de bienvenida automáticamente
                                        </span>
                                        <span className="text-xs text-variable-muted block mt-1">
                                            Cada lead nuevo recibe la plantilla <code>lead_bienvenida</code>.
                                            Desactiva antes el flujo equivalente en n8n o llegarán dos correos.
                                        </span>
                                    </span>
                                </label>
                            </div>
                        </div>
                        <BotonGuardar saving={saving} />
                    </form>
                )}

                {/* ---------------------------------------------------------------- */}
                {activeTab === 'plantillas' && (
                    <div className="glass rounded-2xl border border-variable p-6 sm:p-8">
                        <div className="flex flex-wrap gap-2 mb-6">
                            {plantillas.map((p) => (
                                <button
                                    key={p.clave}
                                    type="button"
                                    onClick={() => setPlantillaSel(p)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                                        plantillaSel?.clave === p.clave ? 'bg-primary text-white' : 'glass border border-variable text-variable-muted hover:text-primary'
                                    }`}
                                >
                                    {p.nombre}
                                </button>
                            ))}
                        </div>

                        {plantillaSel && (
                            <div className="space-y-5">
                                <div>
                                    <label className="text-[10px] uppercase font-black tracking-widest text-variable-muted block mb-2">Asunto</label>
                                    <input
                                        value={plantillaSel.asunto}
                                        onChange={(e) => setPlantillaSel({ ...plantillaSel, asunto: e.target.value })}
                                        className={inputCls}
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] uppercase font-black tracking-widest text-variable-muted block mb-2">
                                        Cuerpo HTML
                                    </label>
                                    <textarea
                                        value={plantillaSel.html}
                                        onChange={(e) => setPlantillaSel({ ...plantillaSel, html: e.target.value })}
                                        rows={18}
                                        spellCheck={false}
                                        className={inputCls + ' font-mono text-xs leading-relaxed'}
                                    />
                                    <p className="text-xs text-variable-muted mt-2">
                                        Variables: <code>{'{{saludo}}'}</code> <code>{'{{nombre}}'}</code>{' '}
                                        <code>{'{{servicio}}'}</code> <code>{'{{empresa}}'}</code>{' '}
                                        <code>{'{{email}}'}</code> <code>{'{{cta}}'}</code>
                                        {' — '}<code>{'{{cta}}'}</code> se convierte en el botón de agenda si has puesto el
                                        enlace en «Email automático», y si no, en el bloque que pide responder al correo.
                                    </p>
                                </div>

                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={plantillaSel.activa !== false}
                                        onChange={(e) => setPlantillaSel({ ...plantillaSel, activa: e.target.checked })}
                                        className="size-4 accent-primary"
                                    />
                                    <span className="text-sm text-variable-main">Plantilla activa</span>
                                </label>

                                <button
                                    type="button"
                                    onClick={guardarPlantilla}
                                    disabled={saving}
                                    className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                                >
                                    <Save size={16} /> {saving ? 'Guardando…' : 'Guardar plantilla'}
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* ---------------------------------------------------------------- */}
                {activeTab === 'historial' && (
                    <div className="glass rounded-2xl border border-variable p-6 sm:p-8">
                        <div className="flex items-center justify-between mb-5">
                            <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted">Últimos 50 envíos</p>
                            <button
                                onClick={cargarEnvios}
                                className="p-2 rounded-xl glass border border-variable text-variable-muted hover:text-primary"
                                title="Actualizar"
                            >
                                <RefreshCw size={15} />
                            </button>
                        </div>

                        {envios.length === 0 ? (
                            <p className="text-sm text-variable-muted py-8 text-center">Todavía no se ha enviado ningún correo desde el panel.</p>
                        ) : (
                            <div className="overflow-x-auto -mx-2">
                                <table className="w-full text-sm min-w-[640px]">
                                    <thead>
                                        <tr className="text-[10px] uppercase tracking-widest text-variable-muted">
                                            <th className="text-left font-black px-2 pb-3">Fecha</th>
                                            <th className="text-left font-black px-2 pb-3">Para</th>
                                            <th className="text-left font-black px-2 pb-3">Asunto</th>
                                            <th className="text-left font-black px-2 pb-3">Origen</th>
                                            <th className="text-left font-black px-2 pb-3">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {envios.map((e) => (
                                            <tr key={e.id} className="border-t border-variable">
                                                <td className="px-2 py-3 text-variable-muted whitespace-nowrap text-xs">
                                                    {new Date(e.created_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                                                </td>
                                                <td className="px-2 py-3 text-variable-main">{e.para}</td>
                                                <td className="px-2 py-3 text-variable-muted">{e.asunto}</td>
                                                <td className="px-2 py-3 text-variable-muted text-xs">
                                                    {e.origen === 'trigger' ? 'automático' : 'panel'}
                                                </td>
                                                <td className="px-2 py-3">
                                                    <span
                                                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold ${ESTADO_COLOR[e.estado] || ''}`}
                                                        title={e.error || ''}
                                                    >
                                                        {e.estado}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}

function BotonGuardar({ saving }) {
    return (
        <div className="mt-8 pt-6 border-t border-variable">
            <button
                type="submit"
                disabled={saving}
                className="px-6 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
                <Save size={16} /> {saving ? 'Guardando…' : 'Guardar configuración'}
            </button>
        </div>
    );
}
