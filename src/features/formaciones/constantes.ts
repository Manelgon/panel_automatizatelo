// Vocabulario compartido de las formaciones. Debe coincidir con los CHECK de la
// migración 014: si aquí aparece un valor que la base de datos no admite, el
// insert falla; si falta uno, la fila se ve sin etiqueta.

export const TIPOS = {
    art4: {
        corto: 'Alfabetización Art. 4',
        largo: 'Alfabetización en IA · Art. 4 del Reglamento (UE) 2024/1689',
    },
    ia_empresas: {
        corto: 'IA para empresas',
        largo: 'Inteligencia artificial aplicada a la empresa',
    },
    ia_centros: {
        corto: 'IA para centros educativos',
        largo: 'Inteligencia artificial aplicada a la docencia',
    },
    a_medida: {
        corto: 'A medida',
        largo: 'Formación a medida',
    },
    scorm: {
        corto: 'Curso SCORM',
        largo: 'Formación en línea',
    },
};

export const MODALIDADES = {
    presencial: 'Presencial',
    remoto: 'En remoto',
    mixta: 'Mixta',
    scorm: 'En línea (SCORM)',
};

export const ESTADOS = {
    propuesta: {
        label: 'Propuesta',
        plural: 'Propuestas',
        clase: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    },
    confirmada: {
        label: 'Confirmada',
        plural: 'Confirmadas',
        clase: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
    },
    impartida: {
        label: 'Impartida',
        plural: 'Impartidas',
        clase: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
    },
    certificada: {
        label: 'Certificada',
        plural: 'Certificadas',
        clase: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    },
    cancelada: {
        label: 'Cancelada',
        plural: 'Canceladas',
        clase: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    },
};

export const APROVECHAMIENTO = {
    pendiente: { label: 'Pendiente', clase: 'text-variable-muted bg-white/5 border-variable' },
    apto: { label: 'Apto', clase: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    no_apto: { label: 'No apto', clase: 'text-rose-400 bg-rose-500/10 border-rose-500/30' },
    no_asistio: { label: 'No asistió', clase: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
};

/** La empresa si la hay; si no, la persona. Mismo criterio que en Proyectos. */
type ClienteNombrable = {
    company_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    email?: string | null;
} | null | undefined;

export const nombreCliente = (c: ClienteNombrable) =>
    (c?.company_name || '').trim()
    || [c?.first_name, c?.last_name].filter(Boolean).join(' ')
    || c?.email
    || 'Cliente';
