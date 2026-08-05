// =============================================================================
// TIPOS DE LA BASE DE DATOS
// =============================================================================
// Escritos a mano desde el volcado real del esquema (agosto 2026) más las
// migraciones 014 (formaciones), 015 (citas), 016 (sprints) y 017 (renombrado
// a castellano: las claves de Tables usan los nombres nuevos). Es la referencia
// que el cliente de Supabase usa para tipar cada .from().
//
// MANTENIMIENTO: cuando cambie el esquema, este fichero cambia en el mismo
// commit que la migración. El día que se use la CLI de Supabase, sustituir por
// `supabase gen types typescript` y borrar esta cabecera.
//
// Insert/Update van como Partial<Row> a propósito: menos estricto que los tipos
// generados, pero suficiente para cazar columnas inexistentes y typos — que es
// la clase de fallo que este panel ha sufrido de verdad (users.full_name,
// status 'pendiente'…).
//
// ALCANCE REAL con supabase-js 2.97 (comprobado con sondeos):
//   · ESCRITURAS tipadas: un update/insert con columna inexistente NO compila ✓
//   · LECTURAS: el parser de resultados exige la forma exacta de los tipos
//     generados y devuelve `never` — en ficheros TS, convertir el data con
//     `as Tipo[]` hasta sustituir este fichero por `supabase gen types`
//   · rpc(): resuelve por una ruta sin tipos; rodeo local en auditoria.ts
// =============================================================================

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Fila<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: never[] };

// ── Núcleo ───────────────────────────────────────────────────────────────────

export interface Usuario {
    id: string;
    email: string;
    avatar_url: string | null;
    role: 'user' | 'editor' | 'admin';
    nombre: string | null;      // renombrados en la migración 013: antes name /
    apellido1: string | null;   // first_name / second_name significaban otra cosa
    apellido2: string | null;
    birth_date: string | null;
    phone_prefix: string | null;
    phone: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    address: string | null;
    status: string | null;
    created_at: string;
    updated_at: string;
}

export interface Lead {
    id: string;
    first_name: string;
    last_name: string | null;
    phone: string;
    email: string;
    client_type: string | null;
    service_interest: string | null;
    message: string | null;
    privacy_accepted: boolean;
    company: string | null;
    status: 'nuevo' | 'en_proceso' | 'contactado' | 'convertido' | 'perdido';
    source: string | null;
    score: number;
    ip_address: string | null;
    city: string | null;
    country: string | null;
    device_type: string | null;
    // fusionadas en la migración 012 (antes service_segmentation / funnel_flows)
    company_size: string | null;
    sector: string | null;
    automation_goal: string | null;
    flow_name: string | null;
    activity: 'lead_activo' | 'lead_inactivo';
    received_keyword: string | null;
    process_tags: Json;
    last_interaction_date: string | null;
    created_at: string;
    updated_at: string;
}

export interface Cliente {
    id: string;
    lead_id: string | null;
    client_type: 'particular' | 'empresa' | 'agencia' | 'otro';
    first_name: string;
    last_name: string | null;
    email: string;
    phone: string | null;
    company_name: string | null;
    tax_id: string | null;
    billing_address: string | null;
    billing_postal_code: string | null;
    billing_city: string | null;
    billing_country: string | null;
    notes: string | null;
    status: 'active' | 'inactive' | 'archived';
    created_at: string;
    updated_at: string;
}

export interface Servicio {
    id: string;
    name: string;
    description: string | null;
    price: number | null;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

// ── Proyectos ────────────────────────────────────────────────────────────────

export interface Proyecto {
    id: string;
    name: string;
    client: string | null;      // etiqueta legible; la verdad es client_id (mig. 011)
    client_id: string;
    status: string;
    description: string | null;
    id_alias: string | null;
    total_hours: number;
    actual_hours: number;
    lead_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProyectoHito {
    id: string;
    project_id: string | null;
    lead_id: string | null;
    assigned_to: string | null;
    title: string;
    description: string | null;
    target_date: string | null;
    start_date: string | null;
    end_date: string | null;
    all_day: boolean;
    status: string;
    created_at: string;
}

export interface ProyectoTarea {
    id: string;
    project_id: string | null;
    title: string;
    status: string;
    priority: string;
    assigned_to: string | null;
    description: string | null;
    sprint_id: string | null;   // migración 016
    created_at: string;
    updated_at: string;
}

export interface ProyectoArchivo {
    id: string;
    project_id: string | null;
    name: string;
    size: string | null;
    file_type: string | null;
    url: string;
    created_at: string;
}

export interface ProyectoMiembro {
    project_id: string;
    user_id: string;
    role: string;
}

export interface ProyectoServicio {
    id: string;                 // PK añadida en la migración 010
    project_id: string | null;
    service_id: string | null;
    unit_price: number;
    quantity: number;
    iva_percent: number;
    invoice_id: string | null;
    created_at: string;
}

export interface ProyectoLineaPresupuesto {
    id: string;
    project_id: string | null;
    description: string;
    unit_price: number;
    quantity: number;
    iva_percent: number;
    invoice_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface ProyectoPresupuesto {
    id: string;
    project_id: string | null;
    budget_number: string;
    budget_date: string;
    subtotal: number;
    iva_total: number;
    total: number;
    line_items: Json;
    status: 'pendiente' | 'confirmado' | 'denegado';
    created_at: string;
}

export interface ProyectoPago {
    id: string;
    project_id: string | null;
    invoice_id: string | null;
    payment_number: string;
    payment_date: string;
    amount: number;
    payment_method: string;
    notes: string | null;
    created_by: string | null;
    created_at: string;
}

export interface ProyectoSprint {
    id: string;
    project_id: string;
    name: string;
    goal: string | null;
    start_date: string | null;
    end_date: string | null;
    status: 'planning' | 'active' | 'completed';
    created_at: string;
}

export interface TareaLogEstado {
    id: string;
    task_id: string;
    status: string;
    changed_at: string;
    changed_by: string | null;
}

export interface TareaSubtarea {
    id: string;
    task_id: string;
    title: string;
    status: 'pending' | 'done';
    created_at: string;
}

export interface TareaComentario {
    id: string;
    task_id: string;
    user_id: string | null;
    content: string;
    created_at: string;
}

// ── Formaciones (migración 014) ──────────────────────────────────────────────

export interface Formacion {
    id: string;
    cliente_id: string;
    lead_id: string | null;
    titulo: string;
    tipo: 'art4' | 'ia_empresas' | 'ia_centros' | 'a_medida' | 'scorm';
    modalidad: 'presencial' | 'remoto' | 'mixta' | 'scorm';
    estado: 'propuesta' | 'confirmada' | 'impartida' | 'certificada' | 'cancelada';
    horas_totales: number;
    precio_cerrado: number;
    fecha_inicio: string | null;
    fecha_fin: string | null;
    lugar: string | null;
    contenidos: string | null;
    notas: string | null;
    created_at: string;
    updated_at: string;
}

export interface FormacionSesion {
    id: string;
    formacion_id: string;
    fecha: string;
    hora_inicio: string | null;
    hora_fin: string | null;
    horas: number;
    modalidad: string | null;
    lugar: string | null;
    notas: string | null;
    created_at: string;
}

export interface FormacionAlumno {
    id: string;
    formacion_id: string;
    nombre: string;
    apellidos: string | null;
    email: string | null;
    dni: string | null;
    cargo: string | null;
    asistencia_horas: number | null;
    aprovechamiento: 'pendiente' | 'apto' | 'no_apto' | 'no_asistio';
    certificado_codigo: string | null;
    certificado_url: string | null;
    certificado_emitido_at: string | null;
    created_at: string;
    updated_at: string;
}

// ── Citas (migración 015) ────────────────────────────────────────────────────

export interface Cita {
    id: string;
    lead_id: string | null;
    cliente_id: string | null;
    contacto_nombre: string;
    contacto_email: string | null;
    titulo: string;
    tipo: 'diagnostico' | 'seguimiento' | 'formacion' | 'auditoria' | 'otro';
    estado: 'propuesta' | 'confirmada' | 'realizada' | 'no_asistio' | 'cancelada';
    start_at: string;
    end_at: string | null;
    modalidad: 'videollamada' | 'telefono' | 'presencial';
    enlace: string | null;
    lugar: string | null;
    notas: string | null;
    resultado: string | null;
    origen: 'panel' | 'cal_com' | 'web' | 'otro';
    externo_id: string | null;
    created_at: string;
    updated_at: string;
}

// ── Facturación ──────────────────────────────────────────────────────────────

export interface Factura {
    id: string;
    serie: string;
    anio: number;
    correlativo: number;
    numero: string;
    client_id: string;
    project_id: string | null;
    formacion_id: string | null;   // migración 014
    cliente_nombre: string;
    cliente_nif: string | null;
    cliente_direccion: string | null;
    cliente_email: string | null;
    fecha_emision: string;
    fecha_vencimiento: string | null;
    base_imponible: number;
    iva_porcentaje: number;
    iva_importe: number;
    irpf_porcentaje: number;
    irpf_importe: number;
    total: number;
    estado: 'pendiente' | 'pagada' | 'vencida' | 'devuelta' | 'anulada';
    forma_pago: 'transferencia' | 'efectivo' | 'bizum' | 'tarjeta' | 'domiciliacion' | null;
    fecha_pago: string | null;
    factura_rectificada_id: string | null;
    motivo_rectificacion: string | null;
    pdf_path: string | null;
    notas: string | null;
    verifactu_alta_id: string | null;
    verifactu_anulacion_id: string | null;
    qr_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface FacturaLinea {
    id: string;
    factura_id: string;
    orden: number;
    concepto: string;
    cantidad: number;
    precio_unitario: number;
    descuento_porcentaje: number;
    base_linea: number;
    created_at: string;
}

export interface VerifactuRegistro {
    id: string;
    factura_id: string;
    tipo: 'alta' | 'anulacion';
    num_registro: number;
    huella: string;
    huella_anterior: string | null;
    hash_factura: string;
    nif_emisor: string;
    numero_factura: string;
    fecha_emision: string;
    tipo_factura_aeat: string;
    cuota_total: number;
    importe_total: number;
    fecha_hora_generacion: string;
    xml_payload: string | null;
    estado_envio: 'pendiente' | 'enviado' | 'aceptado' | 'rechazado' | 'error';
    csv_aeat: string | null;
    respuesta_aeat: Json;
    intentos: number;
    ultimo_error: string | null;
    enviado_at: string | null;
    created_at: string;
}

export interface AjustesEmpresa {
    id: number;
    emisor_nombre: string;
    emisor_nif: string;
    emisor_direccion: string;
    emisor_cp: string;
    emisor_ciudad: string;
    emisor_provincia: string;
    emisor_pais: string;
    emisor_email: string;
    emisor_telefono: string;
    emisor_web: string;
    emisor_iban: string;
    logo_path: string | null;
    firma_path: string | null;
    header_path: string | null;
    footer_path: string | null;
    iva_default: number;
    irpf_default: number;
    forma_pago_default: string | null;
    dias_vencimiento_default: number;
    serie_default: string;
    proximo_numero: number;
    prefijo_anio: boolean;
    pie_pagina: string | null;
    verifactu_productor_nombre: string | null;
    verifactu_productor_nif: string | null;
    verifactu_sistema_nombre: string | null;
    verifactu_sistema_id: string | null;
    verifactu_version: string | null;
    verifactu_numero_instalacion: string | null;
    updated_at: string;
}

// ── Correo (migración 007) ───────────────────────────────────────────────────

export interface EmailAjustes {
    id: number;
    smtp_host: string | null;
    smtp_port: number | null;
    smtp_user: string | null;
    smtp_password: string | null;
    smtp_encryption: string | null;
    smtp_from_name: string | null;
    smtp_reply_to: string | null;
    imap_host: string | null;
    imap_port: number | null;
    imap_user: string | null;
    imap_password: string | null;
    imap_encryption: string | null;
    agenda_url: string | null;
    whatsapp_url: string | null;
    edge_url: string | null;
    edge_secret: string | null;
    bienvenida_activa: boolean;
    updated_at: string;
}

export interface EmailPlantilla {
    clave: string;
    nombre: string;
    asunto: string;
    html: string;
    activa: boolean;
    updated_at: string;
}

export interface EmailEnvio {
    id: string;
    lead_id: string | null;
    para: string;
    asunto: string;
    html: string | null;
    plantilla: string | null;
    origen: string;
    estado: 'pendiente' | 'enviado' | 'error';
    error: string | null;
    sent_at: string | null;
    created_at: string;
}

// ── Auditoría (migración 018) ────────────────────────────────────────────────

export interface Auditoria {
    id: string;
    user_id: string | null;
    accion: string;
    recurso_tipo: string | null;
    recurso_id: string | null;
    recurso_label: string | null;
    metadata: Json;
    created_at: string;
}

// ── Contenidos ───────────────────────────────────────────────────────────────

export interface BlogPost {
    id: string;
    title: string;
    slug: string;
    excerpt: string | null;
    content: string;
    cover_image: string | null;
    author_id: string | null;
    status: string;
    is_visible: boolean;
    tags: string[] | null;
    meta_title: string | null;
    meta_description: string | null;
    published_at: string | null;
    created_at: string;
    updated_at: string;
}

// ── El mapa que consume el cliente de Supabase ───────────────────────────────

export interface Database {
    __InternalSupabase: { PostgrestVersion: '12' };
    public: {
        Tables: {
            users: Fila<Usuario>;
            leads: Fila<Lead>;
            clientes: Fila<Cliente>;
            servicios: Fila<Servicio>;
            proyectos: Fila<Proyecto>;
            proyecto_hitos: Fila<ProyectoHito>;
            tareas: Fila<ProyectoTarea>;
            proyecto_archivos: Fila<ProyectoArchivo>;
            proyecto_miembros: Fila<ProyectoMiembro>;
            proyecto_servicios: Fila<ProyectoServicio>;
            presupuesto_lineas: Fila<ProyectoLineaPresupuesto>;
            presupuestos: Fila<ProyectoPresupuesto>;
            cobros: Fila<ProyectoPago>;
            sprints: Fila<ProyectoSprint>;
            tarea_estados: Fila<TareaLogEstado>;
            tarea_subtareas: Fila<TareaSubtarea>;
            tarea_comentarios: Fila<TareaComentario>;
            formaciones: Fila<Formacion>;
            formacion_sesiones: Fila<FormacionSesion>;
            formacion_alumnos: Fila<FormacionAlumno>;
            citas: Fila<Cita>;
            facturas: Fila<Factura>;
            factura_lineas: Fila<FacturaLinea>;
            verifactu_registros: Fila<VerifactuRegistro>;
            company_settings: Fila<AjustesEmpresa>;
            email_settings: Fila<EmailAjustes>;
            email_plantillas: Fila<EmailPlantilla>;
            email_envios: Fila<EmailEnvio>;
            blog_posts: Fila<BlogPost>;
            audit_logs: Fila<Auditoria>;
        };
        Views: { [_ in never]: never };
        Functions: {
            registrar_accion: {
                Args: {
                    p_accion: string;
                    p_recurso_tipo?: string | null;
                    p_recurso_id?: string | null;
                    p_recurso_label?: string | null;
                    p_metadata?: Json;
                };
                Returns: null;
            };
            aplicar_retencion: { Args: Record<string, never>; Returns: Json };
            generar_codigo_certificado: { Args: Record<string, never>; Returns: string };
            forget_lead_by_email: { Args: { p_email: string; p_dry_run?: boolean }; Returns: Json };
            next_numero_factura: {
                Args: { p_serie: string | null };
                Returns: { serie: string; anio: number; correlativo: number; numero: string }[];
            };
            create_project: {
                Args: {
                    p_name: string;
                    p_client_id: string;
                    p_description?: string;
                    p_alias?: string | null;
                    p_total_hours?: number;
                    p_lead_id?: string | null;
                    p_assigned_users?: string[];
                    p_service_ids?: string[];
                };
                Returns: string;
            };
        };
        Enums: { [_ in never]: never };
        CompositeTypes: { [_ in never]: never };
    };
}
