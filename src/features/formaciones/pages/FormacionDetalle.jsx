import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, GraduationCap, Plus, Trash2, ShieldCheck, Download, Receipt,
    Clock, Calendar, MapPin, Euro, AlertTriangle, UserPlus,
    FileSignature, Upload, CheckCircle2, Circle
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import CustomDropdown from '../../../components/CustomDropdown';
import { useNotifications } from '../../../context/NotificationContext';
import { useGlobalLoading } from '../../../context/LoadingContext';
import { crearFactura, registrarVerifactu } from '../../../lib/facturas';
import { emitirCertificado, urlCertificado, nombreCompletoAlumno } from '../../formaciones/services/certificado';
import { generarContrato, subirContratoFirmado, urlContrato } from '../../formaciones/services/contrato';
import { TIPOS, MODALIDADES, ESTADOS, APROVECHAMIENTO, nombreCliente } from '../../formaciones/constantes';

export default function FormacionDetalle() {
    const { id } = useParams();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [loading, setLoading] = useState(true);
    const [formacion, setFormacion] = useState(null);
    const [sesiones, setSesiones] = useState([]);
    const [alumnos, setAlumnos] = useState([]);
    const [facturas, setFacturas] = useState([]);
    const [contratos, setContratos] = useState([]);

    const [nuevaSesion, setNuevaSesion] = useState({ fecha: '', hora_inicio: '', hora_fin: '', horas: '', lugar: '' });
    const [nuevoAlumno, setNuevoAlumno] = useState({ nombre: '', apellidos: '', email: '', dni: '', cargo: '' });

    // Paquete de facturación: null = cerrado; si no, {hermanas, seleccion}
    const [modalPaquete, setModalPaquete] = useState(null);

    const cargar = useCallback(async () => {
        const [{ data: f, error }, { data: s }, { data: a }, { data: fac }, { data: con }, { data: facLineas }] = await Promise.all([
            supabase.from('formaciones').select('*, clients:clientes(*)').eq('id', id).single(),
            supabase.from('formacion_sesiones').select('*').eq('formacion_id', id).order('fecha'),
            supabase.from('formacion_alumnos').select('*').eq('formacion_id', id).order('apellidos'),
            supabase.from('facturas').select('id, numero, total, estado, fecha_emision').eq('formacion_id', id),
            supabase.from('formacion_contratos').select('*').eq('formacion_id', id).order('created_at', { ascending: false }),
            // Paquetes (021): facturas que cubren esta formación desde una línea
            supabase.from('factura_lineas').select('facturas(id, numero, total, estado, fecha_emision)').eq('formacion_id', id),
        ]);

        if (error) showNotification(`Error cargando la formación: ${error.message}`, 'error');
        setFormacion(f || null);
        setSesiones(s || []);
        setAlumnos(a || []);
        // Directas + de paquete, sin duplicar (si la 021 no está, facLineas viene null)
        const porLinea = (facLineas || []).map(l => l.facturas).filter(Boolean);
        const vistas = new Set();
        setFacturas([...(fac || []), ...porLinea].filter(x => !vistas.has(x.id) && vistas.add(x.id)));
        setContratos(con || []);
        setLoading(false);
    }, [id]);

    useEffect(() => { cargar(); }, [cargar]);

    const actualizar = async (campos) => {
        const { error } = await supabase.from('formaciones').update(campos).eq('id', id);
        if (error) return showNotification(`No se pudo guardar: ${error.message}`, 'error');
        cargar();
    };

    // ── Sesiones ──────────────────────────────────────────────────────────────
    const anadirSesion = async (e) => {
        e.preventDefault();
        if (!nuevaSesion.fecha) return showNotification('La sesión necesita una fecha', 'error');

        const { error } = await supabase.from('formacion_sesiones').insert([{
            formacion_id: id,
            fecha: nuevaSesion.fecha,
            hora_inicio: nuevaSesion.hora_inicio || null,
            hora_fin: nuevaSesion.hora_fin || null,
            horas: parseFloat(nuevaSesion.horas) || 0,
            lugar: nuevaSesion.lugar || null,
        }]);
        if (error) return showNotification(`No se pudo añadir: ${error.message}`, 'error');
        setNuevaSesion({ fecha: '', hora_inicio: '', hora_fin: '', horas: '', lugar: '' });
        cargar();
    };

    const borrarSesion = async (sid) => {
        await supabase.from('formacion_sesiones').delete().eq('id', sid);
        cargar();
    };

    // ── Alumnos ───────────────────────────────────────────────────────────────
    const anadirAlumno = async (e) => {
        e.preventDefault();
        if (!nuevoAlumno.nombre.trim()) return showNotification('El alumno necesita un nombre', 'error');

        const { error } = await supabase.from('formacion_alumnos').insert([{
            formacion_id: id,
            ...nuevoAlumno,
            email: nuevoAlumno.email.trim() || null,
            dni: nuevoAlumno.dni.trim() || null,
        }]);
        if (error) {
            return showNotification(
                error.code === '23505'
                    ? 'Ya hay un alumno con ese correo en esta formación'
                    : `No se pudo añadir: ${error.message}`,
                'error'
            );
        }
        setNuevoAlumno({ nombre: '', apellidos: '', email: '', dni: '', cargo: '' });
        cargar();
    };

    const cambiarAprovechamiento = async (alumnoId, valor) => {
        await supabase.from('formacion_alumnos').update({ aprovechamiento: valor }).eq('id', alumnoId);
        cargar();
    };

    const borrarAlumno = async (alumnoId) => {
        const ok = await confirm({
            title: '¿Quitar al alumno?',
            message: 'Si ya tenía certificado emitido, el PDF seguirá en el almacén pero dejará de estar enlazado.',
            confirmText: 'Quitar',
        });
        if (!ok) return;
        await supabase.from('formacion_alumnos').delete().eq('id', alumnoId);
        cargar();
    };

    // ── Certificados ──────────────────────────────────────────────────────────
    const certificar = async (alumnoId) => {
        await withLoading(async () => {
            const res = await emitirCertificado(alumnoId);
            if (res.error) return showNotification(res.error, 'error');
            res.doc?.save(`Certificado ${res.codigo}.pdf`);
            showNotification(`Certificado ${res.codigo} emitido`, 'success');
            cargar();
        }, 'Generando certificado...');
    };

    const certificarTodos = async () => {
        const aptos = alumnos.filter(a => a.aprovechamiento === 'apto' && !a.certificado_emitido_at);
        if (aptos.length === 0) return showNotification('No hay alumnos aptos pendientes de certificar', 'error');

        await withLoading(async () => {
            let ok = 0;
            const fallos = [];
            for (const a of aptos) {
                const res = await emitirCertificado(a.id);
                if (res.error) fallos.push(`${nombreCompletoAlumno(a)}: ${res.error}`);
                else ok++;
            }
            // No se descargan en lote: serían N descargas seguidas. Quedan
            // guardados y se bajan uno a uno desde la lista.
            if (fallos.length) showNotification(`${ok} emitidos, ${fallos.length} con error. ${fallos[0]}`, 'error');
            else showNotification(`${ok} certificados emitidos`, 'success');
            if (ok > 0) await actualizar({ estado: 'certificada' });
            cargar();
        }, 'Emitiendo certificados...');
    };

    const descargar = async (ruta) => {
        const res = await urlCertificado(ruta);
        if (res.error) return showNotification(res.error, 'error');
        window.open(res.url, '_blank', 'noopener');
    };

    // ── Contrato ──────────────────────────────────────────────────────────────
    const contratoVigente = contratos.find(c => c.estado !== 'anulado') || null;

    const generarContratoHandler = async () => {
        if (contratoVigente) {
            const ok = await confirm({
                title: '¿Generar un contrato nuevo?',
                message: contratoVigente.estado === 'firmado'
                    ? 'Ya hay un contrato firmado. El nuevo lo sustituirá como vigente, aunque el firmado se conserva.'
                    : 'El contrato pendiente de firma actual quedará anulado y lo sustituirá el nuevo.',
                confirmText: 'Generar',
            });
            if (!ok) return;
        }
        await withLoading(async () => {
            const res = await generarContrato(id);
            if (res.error) return showNotification(res.error, 'error');
            res.doc?.save(`Contrato ${formacion.titulo}.pdf`);
            showNotification('Contrato generado, pendiente de firma', 'success');
            cargar();
        }, 'Generando contrato...');
    };

    const subirFirmadoHandler = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';   // permitir volver a elegir el mismo archivo
        if (!file || !contratoVigente) return;
        await withLoading(async () => {
            const res = await subirContratoFirmado(contratoVigente, file);
            if (res.error) return showNotification(res.error, 'error');
            showNotification('Contrato firmado guardado', 'success');
            cargar();
        }, 'Subiendo contrato firmado...');
    };

    const descargarContrato = async (ruta) => {
        const res = await urlContrato(ruta);
        if (res.error) return showNotification(res.error, 'error');
        window.open(res.url, '_blank', 'noopener');
    };

    // ── Checklist ─────────────────────────────────────────────────────────────
    const marcarManual = (clave) => {
        const actual = formacion.checklist || {};
        actualizar({ checklist: { ...actual, [clave]: !actual[clave] } });
    };

    // ── Facturación ───────────────────────────────────────────────────────────
    // Decisión de Manel: los módulos contratados juntos (alfabetización +
    // troncal) se crean como formaciones separadas pero se cobran en UNA
    // factura con una línea por módulo (migración 021).
    const lineaDe = (f) => {
        const horas = Number(f.horas_totales || 0);
        return {
            // El precio es cerrado: una línea, no horas x tarifa. Las horas
            // van en el concepto porque documentan qué se impartió.
            concepto: `${f.titulo}${horas ? ` — ${horas} horas` : ''}`,
            cantidad: 1,
            precio_unitario: Number(f.precio_cerrado),
            descuento_porcentaje: 0,
            formacionId: f.id,
        };
    };

    const emitirFactura = async (formacionesAFacturar) => {
        await withLoading(async () => {
            const res = await crearFactura({
                clientId: formacion.cliente_id,
                formacionId: formacion.id,
                lineas: formacionesAFacturar.map(lineaDe),
            });

            if (res.error) return showNotification(res.error, 'error');
            showNotification(`Factura ${res.factura.numero} emitida`, 'success');

            // Veri*factu es no bloqueante: la factura ya existe
            const v = await registrarVerifactu(res.factura.id, 'alta');
            if (v?.error) showNotification(`Factura emitida, pero Veri*factu falló: ${v.error}`, 'error');

            setModalPaquete(null);
            cargar();
        }, 'Emitiendo factura...');
    };

    const facturar = async () => {
        if (!formacion?.cliente_id) return showNotification('La formación no tiene cliente', 'error');
        if (!Number(formacion.precio_cerrado)) return showNotification('Pon el precio cerrado antes de facturar', 'error');

        // ¿Hay más formaciones del mismo cliente sin facturar? → ofrecer paquete
        const { data: hermanas } = await supabase
            .from('formaciones')
            .select('id, titulo, horas_totales, precio_cerrado, estado')
            .eq('cliente_id', formacion.cliente_id)
            .neq('id', formacion.id)
            .neq('estado', 'cancelada');

        let sinFacturar = [];
        if (hermanas?.length) {
            const ids = hermanas.map(h => h.id);
            const [{ data: dir }, { data: lin }] = await Promise.all([
                supabase.from('facturas').select('formacion_id').in('formacion_id', ids).neq('estado', 'anulada'),
                supabase.from('factura_lineas').select('formacion_id').in('formacion_id', ids),
            ]);
            const facturadas = new Set([...(dir || []), ...(lin || [])].map(x => x.formacion_id));
            sinFacturar = hermanas.filter(h => !facturadas.has(h.id) && Number(h.precio_cerrado) > 0);
        }

        if (sinFacturar.length > 0) {
            setModalPaquete({ hermanas: sinFacturar, seleccion: {} });
            return;
        }

        const ok = await confirm({
            title: '¿Emitir factura?',
            message: `Se emitirá una factura de €${Number(formacion.precio_cerrado).toFixed(2)} a ${nombreCliente(formacion.clients)}. Una vez emitida no se puede modificar.`,
            confirmText: 'Emitir',
        });
        if (!ok) return;
        await emitirFactura([formacion]);
    };

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

    if (!formacion) {
        return (
            <div className="flex flex-col min-h-screen">
                <BarraNavegacion />
                <main className="flex-1 flex items-center justify-center text-center p-10">
                    <div>
                        <p className="text-variable-main font-bold mb-2">No se encontró la formación</p>
                        <Link to="/formaciones" className="text-primary text-sm">Volver a Formaciones</Link>
                    </div>
                </main>
            </div>
        );
    }

    const input = 'w-full glass border border-variable focus:border-primary rounded-xl px-3 py-2.5 text-sm text-variable-main placeholder:text-variable-muted outline-none';
    const aptos = alumnos.filter(a => a.aprovechamiento === 'apto').length;
    const certificados = alumnos.filter(a => a.certificado_emitido_at).length;
    const sinContenidos = !formacion.contenidos?.trim();

    // Checklist: lo automático se deduce de los datos reales; lo manual se
    // guarda en formaciones.checklist (jsonb) y se marca a mano.
    const checklistAuto = [
        { label: 'Datos fiscales del cliente (NIF y dirección)', ok: !!(formacion.clients?.tax_id && formacion.clients?.billing_address) },
        { label: 'Fechas de la formación definidas', ok: !!formacion.fecha_inicio },
        { label: 'Sesiones planificadas', ok: sesiones.length > 0 },
        { label: 'Precio cerrado puesto', ok: Number(formacion.precio_cerrado) > 0 },
        { label: 'Contenidos del temario', ok: !!formacion.contenidos?.trim() },
        { label: 'Alumnos registrados', ok: alumnos.length > 0 },
        { label: 'Contrato generado', ok: !!contratoVigente },
        { label: 'Contrato firmado por el cliente', ok: contratoVigente?.estado === 'firmado' },
        { label: 'Factura emitida', ok: facturas.length > 0 },
        { label: 'Certificados emitidos a los aptos', ok: aptos > 0 && certificados >= aptos },
    ];
    const checklistManual = [
        { clave: 'asistentes_convocados', label: 'Asistentes convocados por el cliente' },
        { clave: 'sala_confirmada', label: 'Sala y equipos confirmados' },
        { clave: 'material_preparado', label: 'Material didáctico preparado' },
    ];
    const checklistHechas = checklistAuto.filter(i => i.ok).length
        + checklistManual.filter(i => formacion.checklist?.[i.clave]).length;
    const checklistTotal = checklistAuto.length + checklistManual.length;

    return (
        <div className="flex flex-col min-h-screen transition-colors duration-300 overflow-hidden">
            <BarraNavegacion />

            <main className="flex-1 p-4 sm:p-10 overflow-y-auto pb-10">
                <Link to="/formaciones" className="inline-flex items-center gap-2 text-xs font-bold text-variable-muted hover:text-primary mb-6">
                    <ArrowLeft size={14} /> Formaciones
                </Link>

                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8">
                    <div>
                        <p className="text-xs text-variable-muted uppercase tracking-widest font-black">
                            {nombreCliente(formacion.clients)}
                        </p>
                        <h1 className="text-2xl sm:text-3xl font-bold text-variable-main flex items-center gap-3 mt-1">
                            <GraduationCap className="text-primary shrink-0" /> {formacion.titulo}
                        </h1>
                        <p className="text-sm text-variable-muted mt-2">{TIPOS[formacion.tipo]?.largo}</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <CustomDropdown
                            value={formacion.estado}
                            onChange={(v) => actualizar({ estado: v })}
                            options={Object.entries(ESTADOS).map(([v, e]) => ({ value: v, label: e.label }))}
                            className="min-w-[170px]"
                        />
                    </div>
                </div>

                {/* Ficha */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    {[
                        { icon: Clock, label: 'Horas', valor: `${formacion.horas_totales || 0} h` },
                        { icon: Calendar, label: 'Fechas', valor: formacion.fecha_inicio ? new Date(formacion.fecha_inicio).toLocaleDateString('es-ES') : '—' },
                        { icon: MapPin, label: 'Modalidad', valor: MODALIDADES[formacion.modalidad] },
                        { icon: Euro, label: 'Precio cerrado', valor: `€${Number(formacion.precio_cerrado || 0).toFixed(2)}` },
                    ].map(({ icon: Icon, label, valor }) => (
                        <div key={label} className="glass rounded-2xl border border-variable p-5">
                            <Icon className="text-primary mb-3" size={18} />
                            <p className="text-lg font-bold text-variable-main">{valor}</p>
                            <p className="text-[10px] uppercase font-black tracking-widest text-variable-muted mt-1">{label}</p>
                        </div>
                    ))}
                </div>

                {sinContenidos && (
                    <div className="glass rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 mb-8 flex items-start gap-3">
                        <AlertTriangle className="text-amber-400 shrink-0 mt-0.5" size={20} />
                        <div>
                            <p className="text-sm font-bold text-amber-300">Sin contenidos, el certificado acredita poco</p>
                            <p className="text-xs text-amber-300/80 mt-1">
                                El temario se imprime en el certificado. Un certificado del Art. 4 que solo diga
                                «formación en IA» es difícil de defender ante una inspección.
                            </p>
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    {/* ── Sesiones ── */}
                    <section className="glass rounded-2xl border border-variable p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-black uppercase tracking-widest text-variable-muted">Sesiones</h2>
                            <span className="text-xs text-variable-muted">{sesiones.length} · {formacion.horas_totales || 0} h</span>
                        </div>

                        <div className="space-y-2 mb-5">
                            {sesiones.length === 0 && (
                                <p className="text-xs text-variable-muted italic py-4 text-center">
                                    Sin sesiones. Al añadirlas, las horas de la formación se recalculan solas.
                                </p>
                            )}
                            {sesiones.map(s => (
                                <div key={s.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-variable">
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-variable-main">
                                            {new Date(s.fecha).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}
                                        </p>
                                        <p className="text-[11px] text-variable-muted">
                                            {[s.hora_inicio?.slice(0, 5), s.hora_fin?.slice(0, 5)].filter(Boolean).join(' – ')}
                                            {s.horas ? ` · ${s.horas} h` : ''}
                                            {s.lugar ? ` · ${s.lugar}` : ''}
                                        </p>
                                    </div>
                                    <button onClick={() => borrarSesion(s.id)} className="text-variable-muted hover:text-rose-500 shrink-0">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <form onSubmit={anadirSesion} className="grid grid-cols-2 gap-2 pt-5 border-t border-variable">
                            <input type="date" value={nuevaSesion.fecha} onChange={e => setNuevaSesion({ ...nuevaSesion, fecha: e.target.value })} className={input} />
                            <input type="number" step="0.5" placeholder="Horas" value={nuevaSesion.horas} onChange={e => setNuevaSesion({ ...nuevaSesion, horas: e.target.value })} className={input} />
                            <input type="time" value={nuevaSesion.hora_inicio} onChange={e => setNuevaSesion({ ...nuevaSesion, hora_inicio: e.target.value })} className={input} />
                            <input type="time" value={nuevaSesion.hora_fin} onChange={e => setNuevaSesion({ ...nuevaSesion, hora_fin: e.target.value })} className={input} />
                            <input placeholder="Lugar (opcional)" value={nuevaSesion.lugar} onChange={e => setNuevaSesion({ ...nuevaSesion, lugar: e.target.value })} className={`${input} col-span-2`} />
                            <button type="submit" className="col-span-2 py-2.5 rounded-xl glass border border-variable text-sm font-bold text-variable-main hover:text-primary hover:border-primary flex items-center justify-center gap-2">
                                <Plus size={15} /> Añadir sesión
                            </button>
                        </form>
                    </section>

                    {/* ── Alumnos ── */}
                    <section className="glass rounded-2xl border border-variable p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-black uppercase tracking-widest text-variable-muted">
                                Alumnos · registro Art. 4
                            </h2>
                            <span className="text-xs text-variable-muted">
                                {alumnos.length} · {aptos} aptos · {certificados} cert.
                            </span>
                        </div>

                        <div className="space-y-2 mb-5 max-h-80 overflow-y-auto">
                            {alumnos.length === 0 && (
                                <p className="text-xs text-variable-muted italic py-4 text-center">
                                    Sin alumnos. Son los que aparecerán en los certificados.
                                </p>
                            )}
                            {alumnos.map(a => {
                                const ap = APROVECHAMIENTO[a.aprovechamiento] || {};
                                return (
                                    <div key={a.id} className="p-3 rounded-xl bg-white/5 border border-variable">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-variable-main truncate">{nombreCompletoAlumno(a)}</p>
                                                <p className="text-[11px] text-variable-muted truncate">
                                                    {[a.cargo, a.email, a.dni].filter(Boolean).join(' · ') || 'Sin datos de contacto'}
                                                </p>
                                            </div>
                                            <button onClick={() => borrarAlumno(a.id)} className="text-variable-muted hover:text-rose-500 shrink-0">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2 mt-3">
                                            {Object.entries(APROVECHAMIENTO).map(([v, cfg]) => (
                                                <button
                                                    key={v}
                                                    onClick={() => cambiarAprovechamiento(a.id, v)}
                                                    className={`px-2 py-1 rounded-lg border text-[10px] font-bold transition-all ${
                                                        a.aprovechamiento === v ? cfg.clase : 'text-variable-muted border-variable hover:text-primary'
                                                    }`}
                                                >
                                                    {cfg.label}
                                                </button>
                                            ))}

                                            <div className="ml-auto flex items-center gap-2">
                                                {a.certificado_emitido_at ? (
                                                    <button
                                                        onClick={() => descargar(a.certificado_url)}
                                                        title={`Emitido el ${new Date(a.certificado_emitido_at).toLocaleDateString('es-ES')} · ${a.certificado_codigo}`}
                                                        className="px-2.5 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[10px] font-bold flex items-center gap-1.5"
                                                    >
                                                        <Download size={11} /> {a.certificado_codigo}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => certificar(a.id)}
                                                        disabled={a.aprovechamiento !== 'apto'}
                                                        title={a.aprovechamiento !== 'apto' ? 'Solo se certifica a quien consta como apto' : 'Emitir certificado'}
                                                        className="px-2.5 py-1 rounded-lg border border-variable text-[10px] font-bold text-variable-muted hover:text-primary hover:border-primary disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
                                                    >
                                                        <ShieldCheck size={11} /> Certificar
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <form onSubmit={anadirAlumno} className="grid grid-cols-2 gap-2 pt-5 border-t border-variable">
                            <input placeholder="Nombre" value={nuevoAlumno.nombre} onChange={e => setNuevoAlumno({ ...nuevoAlumno, nombre: e.target.value })} className={input} />
                            <input placeholder="Apellidos" value={nuevoAlumno.apellidos} onChange={e => setNuevoAlumno({ ...nuevoAlumno, apellidos: e.target.value })} className={input} />
                            <input placeholder="Email" value={nuevoAlumno.email} onChange={e => setNuevoAlumno({ ...nuevoAlumno, email: e.target.value })} className={input} />
                            <input placeholder="DNI (opcional)" value={nuevoAlumno.dni} onChange={e => setNuevoAlumno({ ...nuevoAlumno, dni: e.target.value })} className={input} />
                            <input placeholder="Cargo (opcional)" value={nuevoAlumno.cargo} onChange={e => setNuevoAlumno({ ...nuevoAlumno, cargo: e.target.value })} className={`${input} col-span-2`} />
                            <button type="submit" className="col-span-2 py-2.5 rounded-xl glass border border-variable text-sm font-bold text-variable-main hover:text-primary hover:border-primary flex items-center justify-center gap-2">
                                <UserPlus size={15} /> Añadir alumno
                            </button>
                        </form>

                        {aptos > certificados && (
                            <button
                                onClick={certificarTodos}
                                className="w-full mt-3 py-3 rounded-xl bg-primary text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2"
                            >
                                <ShieldCheck size={16} /> Certificar a los {aptos - certificados} aptos pendientes
                            </button>
                        )}
                    </section>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">
                    {/* ── Contrato ── */}
                    <section className="glass rounded-2xl border border-variable p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-black uppercase tracking-widest text-variable-muted">
                                Contrato de prestación de servicios
                            </h2>
                            {contratoVigente && (
                                <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold uppercase ${
                                    contratoVigente.estado === 'firmado'
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                                }`}>
                                    {contratoVigente.estado === 'firmado' ? 'Firmado' : 'Pendiente de firma'}
                                </span>
                            )}
                        </div>

                        {!contratoVigente ? (
                            <>
                                <p className="text-xs text-variable-muted mb-4">
                                    Se genera con los datos del cliente y de esta formación (horas, fechas,
                                    precio cerrado y calendario de sesiones como anexo). Nace pendiente de
                                    firma; cuando el cliente lo devuelva firmado, se sube aquí.
                                </p>
                                <button
                                    onClick={generarContratoHandler}
                                    className="px-5 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:opacity-90 flex items-center gap-2"
                                >
                                    <FileSignature size={16} /> Generar contrato
                                </button>
                            </>
                        ) : (
                            <div className="space-y-3">
                                <p className="text-xs text-variable-muted">
                                    Generado el {new Date(contratoVigente.created_at).toLocaleDateString('es-ES')}
                                    {contratoVigente.firmado_at && ` · firmado el ${new Date(contratoVigente.firmado_at).toLocaleDateString('es-ES')}`}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        onClick={() => descargarContrato(contratoVigente.ruta_pdf)}
                                        className="px-3.5 py-2.5 rounded-xl glass border border-variable text-xs font-bold text-variable-main hover:text-primary hover:border-primary flex items-center gap-2"
                                    >
                                        <Download size={14} /> Sin firmar
                                    </button>
                                    {contratoVigente.ruta_pdf_firmado && (
                                        <button
                                            onClick={() => descargarContrato(contratoVigente.ruta_pdf_firmado)}
                                            className="px-3.5 py-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-bold flex items-center gap-2"
                                        >
                                            <Download size={14} /> Firmado
                                        </button>
                                    )}
                                    {contratoVigente.estado === 'pendiente_firma' && (
                                        <label className="px-3.5 py-2.5 rounded-xl bg-primary text-white text-xs font-bold hover:opacity-90 flex items-center gap-2 cursor-pointer">
                                            <Upload size={14} /> Subir firmado
                                            <input type="file" accept="application/pdf" onChange={subirFirmadoHandler} className="hidden" />
                                        </label>
                                    )}
                                    <button
                                        onClick={generarContratoHandler}
                                        className="px-3.5 py-2.5 rounded-xl glass border border-variable text-xs font-bold text-variable-muted hover:text-primary hover:border-primary"
                                        title="Anula el vigente y genera uno nuevo con los datos actuales"
                                    >
                                        Regenerar
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* ── Checklist ── */}
                    <section className="glass rounded-2xl border border-variable p-6">
                        <div className="flex items-center justify-between mb-5">
                            <h2 className="text-sm font-black uppercase tracking-widest text-variable-muted">Checklist</h2>
                            <span className={`text-xs font-bold ${checklistHechas === checklistTotal ? 'text-emerald-400' : 'text-variable-muted'}`}>
                                {checklistHechas}/{checklistTotal}
                            </span>
                        </div>

                        <div className="space-y-1.5">
                            {checklistAuto.map(item => (
                                <div key={item.label} className="flex items-center gap-2.5 py-1" title="Se marca sola con los datos de la ficha">
                                    {item.ok
                                        ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                                        : <Circle size={15} className="text-variable-muted/40 shrink-0" />}
                                    <span className={`text-xs ${item.ok ? 'text-variable-muted line-through decoration-variable-muted/40' : 'text-variable-main'}`}>
                                        {item.label}
                                    </span>
                                </div>
                            ))}
                            <div className="border-t border-variable my-2" />
                            {checklistManual.map(item => {
                                const hecho = !!formacion.checklist?.[item.clave];
                                return (
                                    <button
                                        key={item.clave}
                                        onClick={() => marcarManual(item.clave)}
                                        className="flex items-center gap-2.5 py-1 w-full text-left hover:opacity-80"
                                    >
                                        {hecho
                                            ? <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                                            : <Circle size={15} className="text-variable-muted/40 shrink-0" />}
                                        <span className={`text-xs ${hecho ? 'text-variable-muted line-through decoration-variable-muted/40' : 'text-variable-main'}`}>
                                            {item.label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </section>
                </div>

                {/* ── Facturación ── */}
                <section className="glass rounded-2xl border border-variable p-6 mt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h2 className="text-sm font-black uppercase tracking-widest text-variable-muted mb-1">Facturación</h2>
                            <p className="text-xs text-variable-muted">
                                {facturas.length === 0
                                    ? 'Sin facturar. Se emite una línea con el precio cerrado; las horas van en el concepto.'
                                    : facturas.map(f => `${f.numero} · €${Number(f.total).toFixed(2)} · ${f.estado}`).join('  |  ')}
                            </p>
                        </div>
                        {facturas.length === 0 && (
                            <button
                                onClick={facturar}
                                className="px-5 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2 shrink-0"
                            >
                                <Receipt size={16} /> Emitir factura
                            </button>
                        )}
                    </div>
                </section>

                {/* MODAL: FACTURAR PAQUETE (esta formación + las hermanas que se marquen) */}
                {modalPaquete && (() => {
                    const marcadas = modalPaquete.hermanas.filter(h => modalPaquete.seleccion[h.id]);
                    const total = [formacion, ...marcadas].reduce((s, f) => s + Number(f.precio_cerrado || 0), 0);
                    return (
                        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
                            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setModalPaquete(null)} />
                            <div className="relative glass rounded-3xl border border-variable p-6 sm:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto">
                                <h2 className="text-xl sm:text-2xl font-bold font-display mb-2 text-variable-main">Emitir factura</h2>
                                <p className="text-sm text-variable-muted mb-6">
                                    {nombreCliente(formacion.clients)} tiene más formaciones sin facturar.
                                    Marca las que quieras cobrar en la misma factura: saldrá una línea por formación.
                                </p>

                                <div className="space-y-2 mb-6">
                                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-primary/5 border border-primary/30">
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold text-variable-main truncate">{formacion.titulo}</p>
                                            <p className="text-[11px] text-variable-muted">Esta formación · siempre incluida</p>
                                        </div>
                                        <span className="text-sm font-black text-variable-main shrink-0">€{Number(formacion.precio_cerrado).toFixed(2)}</span>
                                    </div>
                                    {modalPaquete.hermanas.map(h => (
                                        <label key={h.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white/5 border border-variable cursor-pointer hover:border-primary/40">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <input
                                                    type="checkbox"
                                                    checked={!!modalPaquete.seleccion[h.id]}
                                                    onChange={() => setModalPaquete({
                                                        ...modalPaquete,
                                                        seleccion: { ...modalPaquete.seleccion, [h.id]: !modalPaquete.seleccion[h.id] },
                                                    })}
                                                    className="size-4 accent-[var(--primary)] shrink-0"
                                                />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-variable-main truncate">{h.titulo}</p>
                                                    <p className="text-[11px] text-variable-muted">{Number(h.horas_totales || 0)} h</p>
                                                </div>
                                            </div>
                                            <span className="text-sm font-black text-variable-main shrink-0">€{Number(h.precio_cerrado).toFixed(2)}</span>
                                        </label>
                                    ))}
                                </div>

                                <div className="flex items-center justify-between mb-5 pt-4 border-t border-variable">
                                    <span className="text-xs font-black uppercase tracking-widest text-variable-muted">Total (sin IVA)</span>
                                    <span className="text-lg font-black text-variable-main">€{total.toFixed(2)}</span>
                                </div>

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setModalPaquete(null)}
                                        className="flex-1 py-3 rounded-2xl glass border border-variable text-sm font-bold text-variable-muted hover:text-primary"
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        onClick={() => emitirFactura([formacion, ...marcadas])}
                                        className="flex-1 py-3 rounded-2xl bg-primary text-white text-sm font-bold hover:opacity-90 flex items-center justify-center gap-2"
                                    >
                                        <Receipt size={15} />
                                        {marcadas.length > 0 ? `Facturar ${1 + marcadas.length} juntas` : 'Facturar solo esta'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </main>
        </div>
    );
}
