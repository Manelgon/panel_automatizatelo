import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeft, GraduationCap, Plus, Trash2, ShieldCheck, Download, Receipt,
    Clock, Calendar, MapPin, Euro, Sun, Moon, AlertTriangle, UserPlus
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import BarraNavegacion from '../../../components/BarraNavegacion';
import CustomDropdown from '../../../components/CustomDropdown';
import { useTheme } from '../../../context/ThemeContext';
import { useNotifications } from '../../../context/NotificationContext';
import { useGlobalLoading } from '../../../context/LoadingContext';
import { crearFactura, registrarVerifactu } from '../../../lib/facturas';
import { emitirCertificado, urlCertificado, nombreCompletoAlumno } from '../../formaciones/services/certificado';
import { TIPOS, MODALIDADES, ESTADOS, APROVECHAMIENTO, nombreCliente } from '../../formaciones/constantes';

export default function FormacionDetalle() {
    const { id } = useParams();
    const { darkMode, toggleTheme } = useTheme();
    const { showNotification, confirm } = useNotifications();
    const { withLoading } = useGlobalLoading();

    const [loading, setLoading] = useState(true);
    const [formacion, setFormacion] = useState(null);
    const [sesiones, setSesiones] = useState([]);
    const [alumnos, setAlumnos] = useState([]);
    const [facturas, setFacturas] = useState([]);

    const [nuevaSesion, setNuevaSesion] = useState({ fecha: '', hora_inicio: '', hora_fin: '', horas: '', lugar: '' });
    const [nuevoAlumno, setNuevoAlumno] = useState({ nombre: '', apellidos: '', email: '', dni: '', cargo: '' });

    const cargar = useCallback(async () => {
        const [{ data: f, error }, { data: s }, { data: a }, { data: fac }] = await Promise.all([
            supabase.from('formaciones').select('*, clients:clientes(*)').eq('id', id).single(),
            supabase.from('formacion_sesiones').select('*').eq('formacion_id', id).order('fecha'),
            supabase.from('formacion_alumnos').select('*').eq('formacion_id', id).order('apellidos'),
            supabase.from('facturas').select('id, numero, total, estado, fecha_emision').eq('formacion_id', id),
        ]);

        if (error) showNotification(`Error cargando la formación: ${error.message}`, 'error');
        setFormacion(f || null);
        setSesiones(s || []);
        setAlumnos(a || []);
        setFacturas(fac || []);
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

    // ── Facturación ───────────────────────────────────────────────────────────
    const facturar = async () => {
        if (!formacion?.cliente_id) return showNotification('La formación no tiene cliente', 'error');
        if (!Number(formacion.precio_cerrado)) return showNotification('Pon el precio cerrado antes de facturar', 'error');

        const ok = await confirm({
            title: '¿Emitir factura?',
            message: `Se emitirá una factura de €${Number(formacion.precio_cerrado).toFixed(2)} a ${nombreCliente(formacion.clients)}. Una vez emitida no se puede modificar.`,
            confirmText: 'Emitir',
        });
        if (!ok) return;

        await withLoading(async () => {
            const horas = Number(formacion.horas_totales || 0);
            const res = await crearFactura({
                clientId: formacion.cliente_id,
                formacionId: formacion.id,
                lineas: [{
                    // El precio es cerrado: una línea, no horas x tarifa. Las horas
                    // van en el concepto porque documentan qué se impartió.
                    concepto: `${formacion.titulo}${horas ? ` — ${horas} horas` : ''}`,
                    cantidad: 1,
                    precio_unitario: Number(formacion.precio_cerrado),
                    descuento_porcentaje: 0,
                }],
            });

            if (res.error) return showNotification(res.error, 'error');
            showNotification(`Factura ${res.factura.numero} emitida`, 'success');

            // Veri*factu es no bloqueante: la factura ya existe
            const v = await registrarVerifactu(res.factura.id, 'alta');
            if (v?.error) showNotification(`Factura emitida, pero Veri*factu falló: ${v.error}`, 'error');

            cargar();
        }, 'Emitiendo factura...');
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
                        <button onClick={toggleTheme} className="p-3 glass rounded-2xl text-variable-muted hover:text-primary">
                            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
                        </button>
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
            </main>
        </div>
    );
}
