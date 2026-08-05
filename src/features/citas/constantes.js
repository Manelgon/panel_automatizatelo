// Vocabulario de las citas. Debe coincidir con los CHECK de la migración 015.

export const TIPOS_CITA = {
    diagnostico: 'Diagnóstico · 30 min',
    seguimiento: 'Seguimiento',
    formacion: 'Formación',
    auditoria: 'Auditoría',
    otro: 'Otro',
};

export const MODALIDADES_CITA = {
    videollamada: 'Videollamada',
    telefono: 'Teléfono',
    presencial: 'Presencial',
};

export const ESTADOS_CITA = {
    propuesta: { label: 'Propuesta', clase: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    confirmada: { label: 'Confirmada', clase: 'text-sky-400 bg-sky-500/10 border-sky-500/30' },
    realizada: { label: 'Realizada', clase: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    no_asistio: { label: 'No asistió', clase: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
    cancelada: { label: 'Cancelada', clase: 'text-variable-muted bg-white/5 border-variable' },
};

/** De dónde vino la reserva. Hoy todas son 'panel'; ver el pie de la migración 015. */
export const ORIGENES_CITA = {
    panel: 'Creada a mano',
    cal_com: 'Reservada en Cal.com',
    web: 'Desde la web',
    otro: 'Otro',
};

/** Fecha y hora para un <input type="datetime-local">, en horario local. */
export const paraInputLocal = (fecha) => {
    const d = fecha ? new Date(fecha) : new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** La próxima hora en punto: el valor por defecto razonable al agendar. */
export const proximaHoraEnPunto = () => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return paraInputLocal(d);
};
