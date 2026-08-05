import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CalendarClock, Video } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CustomDropdown from '../../components/CustomDropdown';
import { useNotifications } from '../../context/NotificationContext';
import { TIPOS_CITA, MODALIDADES_CITA, proximaHoraEnPunto } from './constantes';

/**
 * Modal para agendar una cita con un lead o con un cliente.
 *
 * Se usa desde la lista de Leads y desde la ficha del cliente, así que recibe
 * el contacto ya resuelto en vez de ir a buscarlo: quien llama ya lo tiene.
 *
 *   contacto = { leadId?, clienteId?, nombre, email }
 */
export default function AgendarCitaModal({ abierto, contacto, onCerrar, onGuardada }) {
    const { showNotification } = useNotifications();
    const [guardando, setGuardando] = useState(false);

    const formInicial = {
        titulo: 'Diagnóstico · 30 minutos',
        tipo: 'diagnostico',
        start_at: proximaHoraEnPunto(),
        duracion: 30,
        modalidad: 'videollamada',
        enlace: '',
        lugar: '',
        notas: '',
    };
    const [form, setForm] = useState(formInicial);

    const cerrar = () => {
        if (guardando) return;
        setForm(formInicial);
        onCerrar?.();
    };

    const guardar = async (e) => {
        e.preventDefault();
        if (!form.start_at) return showNotification('La cita necesita fecha y hora', 'error');

        setGuardando(true);
        const inicio = new Date(form.start_at);
        const fin = new Date(inicio.getTime() + (parseInt(form.duracion, 10) || 30) * 60000);

        const { error } = await supabase.from('citas').insert([{
            lead_id: contacto?.leadId || null,
            cliente_id: contacto?.clienteId || null,
            contacto_nombre: contacto?.nombre || 'Sin nombre',
            contacto_email: contacto?.email || null,
            titulo: form.titulo.trim() || 'Cita',
            tipo: form.tipo,
            estado: 'confirmada',
            start_at: inicio.toISOString(),
            end_at: fin.toISOString(),
            modalidad: form.modalidad,
            enlace: form.modalidad === 'videollamada' ? (form.enlace.trim() || null) : null,
            lugar: form.modalidad === 'presencial' ? (form.lugar.trim() || null) : null,
            notas: form.notas.trim() || null,
            origen: 'panel',
        }]);

        setGuardando(false);
        if (error) return showNotification(`No se pudo agendar: ${error.message}`, 'error');

        showNotification('Cita agendada', 'success');
        setForm(formInicial);
        onGuardada?.();
        onCerrar?.();
    };

    const input = 'w-full glass border border-variable focus:border-primary rounded-2xl px-4 py-3 text-sm text-variable-main placeholder:text-variable-muted outline-none transition-colors';
    const label = 'text-xs font-black text-primary uppercase tracking-[0.2em] ml-1 block mb-2';

    return (
        <AnimatePresence>
            {abierto && (
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[200] flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-black/50 backdrop-blur-sm"
                    onClick={cerrar}
                >
                    <motion.form
                        initial={{ scale: 0.96, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 12 }}
                        onClick={(e) => e.stopPropagation()}
                        onSubmit={guardar}
                        className="glass border border-variable rounded-3xl w-full max-w-lg p-6 sm:p-8 my-8"
                    >
                        <div className="flex items-start justify-between mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-variable-main flex items-center gap-2">
                                    <CalendarClock className="text-primary" size={22} /> Agendar cita
                                </h2>
                                <p className="text-sm text-variable-muted italic mt-1">
                                    Con {contacto?.nombre || 'este contacto'}
                                    {contacto?.email && ` · ${contacto.email}`}
                                </p>
                            </div>
                            <button type="button" onClick={cerrar} className="text-variable-muted hover:text-primary">
                                <X size={22} />
                            </button>
                        </div>

                        <div className="space-y-5">
                            <div>
                                <label className={label}>Título</label>
                                <input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} className={input} />
                            </div>

                            <div>
                                <label className={label}>Tipo</label>
                                <CustomDropdown
                                    value={form.tipo}
                                    onChange={(v) => setForm({
                                        ...form,
                                        tipo: v,
                                        // El diagnóstico es la oferta de la web: 30 minutos
                                        duracion: v === 'diagnostico' ? 30 : form.duracion,
                                    })}
                                    options={Object.entries(TIPOS_CITA).map(([v, l]) => ({ value: v, label: l }))}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={label}>Cuándo</label>
                                    <input
                                        type="datetime-local"
                                        value={form.start_at}
                                        onChange={(e) => setForm({ ...form, start_at: e.target.value })}
                                        className={input}
                                    />
                                </div>
                                <div>
                                    <label className={label}>Duración (min)</label>
                                    <input
                                        type="number"
                                        step="15"
                                        min="15"
                                        value={form.duracion}
                                        onChange={(e) => setForm({ ...form, duracion: e.target.value })}
                                        className={input}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className={label}>Modalidad</label>
                                <CustomDropdown
                                    value={form.modalidad}
                                    onChange={(v) => setForm({ ...form, modalidad: v })}
                                    options={Object.entries(MODALIDADES_CITA).map(([v, l]) => ({ value: v, label: l }))}
                                />
                            </div>

                            {form.modalidad === 'videollamada' && (
                                <div>
                                    <label className={label}>Enlace de la videollamada</label>
                                    <input
                                        value={form.enlace}
                                        onChange={(e) => setForm({ ...form, enlace: e.target.value })}
                                        className={input}
                                        placeholder="https://meet.google.com/…"
                                    />
                                </div>
                            )}

                            {form.modalidad === 'presencial' && (
                                <div>
                                    <label className={label}>Dónde</label>
                                    <input
                                        value={form.lugar}
                                        onChange={(e) => setForm({ ...form, lugar: e.target.value })}
                                        className={input}
                                        placeholder="Oficinas del cliente, Barcelona"
                                    />
                                </div>
                            )}

                            <div>
                                <label className={label}>Notas para antes de la llamada</label>
                                <textarea
                                    rows={3}
                                    value={form.notas}
                                    onChange={(e) => setForm({ ...form, notas: e.target.value })}
                                    className={input}
                                    placeholder="Qué pedía, de qué sector, qué mirar antes de llamar…"
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={guardando}
                            className="w-full mt-8 py-4 rounded-2xl bg-primary text-white font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            <Video size={18} /> {guardando ? 'Agendando…' : 'Agendar'}
                        </button>

                        {contacto?.leadId && (
                            <p className="text-[11px] text-variable-muted text-center mt-3">
                                El lead pasará automáticamente a «contactado».
                            </p>
                        )}
                    </motion.form>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
