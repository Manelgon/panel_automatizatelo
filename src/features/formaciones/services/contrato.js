import jsPDF from 'jspdf';
import { supabase } from '../../../lib/supabase';
import { getCompanySettings } from '../../../lib/facturas';
import { registrarAccion } from '../../../lib/auditoria';
import { TIPOS, MODALIDADES } from '../constantes';

// =============================================================================
// CONTRATO DE PRESTACIÓN DE SERVICIOS DE FORMACIÓN
// =============================================================================
// Se genera con los datos del cliente y de la formación, nace "pendiente de
// firma" y guarda el PDF en el bucket privado `contratos`. Cuando el cliente
// lo devuelve firmado, se sube esa versión y el contrato pasa a "firmado"
// conservando las dos. Generar uno nuevo anula el pendiente anterior.
// =============================================================================

const NARANJA = [243, 121, 27];
const TINTA = [30, 30, 40];
const GRIS = [120, 120, 132];

const fechaLarga = (d) =>
    (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

const nombreCliente = (c) =>
    (c?.company_name || '').trim() || [c?.first_name, c?.last_name].filter(Boolean).join(' ') || 'Cliente';

/** Construye el PDF del contrato. Devuelve el jsPDF sin guardarlo. */
export function generarPdfContrato({ formacion, cliente, sesiones = [], settings }) {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210;
    const MARGEN = 22;
    const ANCHO = W - MARGEN * 2;
    let y = 0;

    const emisor = {
        nombre: settings?.emisor_nombre || 'Automatízatelo',
        nif: settings?.emisor_nif || '',
        direccion: [
            settings?.emisor_direccion,
            [settings?.emisor_cp, settings?.emisor_ciudad, settings?.emisor_provincia].filter(Boolean).join(' '),
        ].filter(Boolean).join(', '),
        contacto: [settings?.emisor_email, settings?.emisor_telefono].filter(Boolean).join(' · '),
    };

    const clienteNombre = nombreCliente(cliente);
    const clienteDireccion = [
        cliente?.billing_address,
        [cliente?.billing_postal_code, cliente?.billing_city].filter(Boolean).join(' '),
        cliente?.billing_country,
    ].filter(Boolean).join(', ');

    // ── Utilidades de maquetación con salto de página ────────────────────────
    const nuevaPagina = () => {
        doc.addPage();
        y = 24;
    };
    const necesita = (mm) => {
        if (y + mm > 275) nuevaPagina();
    };
    const titulo = (texto) => {
        necesita(14);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...NARANJA);
        doc.text(texto.toUpperCase(), MARGEN, y, { charSpace: 0.6 });
        y += 6;
    };
    const parrafo = (texto, opts = {}) => {
        doc.setFont('helvetica', opts.negrita ? 'bold' : 'normal');
        doc.setFontSize(9.5);
        doc.setTextColor(...(opts.gris ? GRIS : TINTA));
        const lineas = doc.splitTextToSize(texto, ANCHO);
        for (const linea of lineas) {
            necesita(5);
            doc.text(linea, MARGEN, y);
            y += 4.6;
        }
        y += opts.sinHueco ? 0 : 2.5;
    };

    // ── Cabecera ─────────────────────────────────────────────────────────────
    y = 26;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NARANJA);
    doc.text(emisor.nombre.toUpperCase(), W / 2, y, { align: 'center', charSpace: 1.4 });
    y += 10;

    doc.setFontSize(16);
    doc.setTextColor(...TINTA);
    doc.text('CONTRATO DE PRESTACIÓN DE SERVICIOS DE FORMACIÓN', W / 2, y, { align: 'center', maxWidth: ANCHO });
    y += 14;

    doc.setDrawColor(...NARANJA);
    doc.setLineWidth(0.8);
    doc.line(MARGEN, y, W - MARGEN, y);
    y += 10;

    // ── Reunidos ─────────────────────────────────────────────────────────────
    titulo('Reunidos');
    parrafo(
        `De una parte, ${emisor.nombre}${emisor.nif ? `, con NIF ${emisor.nif}` : ''}` +
        `${emisor.direccion ? `, con domicilio en ${emisor.direccion}` : ''}` +
        `${emisor.contacto ? ` (${emisor.contacto})` : ''}, en adelante «el PRESTADOR».`
    );
    parrafo(
        `De otra parte, ${clienteNombre}${cliente?.tax_id ? `, con NIF/CIF ${cliente.tax_id}` : ''}` +
        `${clienteDireccion ? `, con domicilio en ${clienteDireccion}` : ''}` +
        `${cliente?.email ? ` (${cliente.email})` : ''}, en adelante «el CLIENTE».`
    );
    parrafo('Ambas partes se reconocen capacidad legal suficiente para suscribir el presente contrato y, a tal efecto,');

    // ── Cláusulas ────────────────────────────────────────────────────────────
    titulo('Cláusulas');

    const horas = Number(formacion?.horas_totales || 0);
    const desde = fechaLarga(formacion?.fecha_inicio);
    const hasta = fechaLarga(formacion?.fecha_fin);
    const periodo = desde && hasta && desde !== hasta ? `del ${desde} al ${hasta}` : (desde || 'fechas por concretar');

    parrafo('PRIMERA — Objeto.', { negrita: true, sinHueco: true });
    parrafo(
        `El PRESTADOR impartirá para el CLIENTE la acción formativa «${formacion?.titulo || 'Formación'}»` +
        `${TIPOS[formacion?.tipo]?.largo ? ` (${TIPOS[formacion.tipo].largo})` : ''}, en modalidad ` +
        `${(MODALIDADES[formacion?.modalidad] || 'presencial').toLowerCase()}, dirigida al personal que el CLIENTE designe.`
    );

    parrafo('SEGUNDA — Duración y calendario.', { negrita: true, sinHueco: true });
    parrafo(
        `La formación tiene una duración de ${horas || '—'} horas lectivas, a impartir ${periodo}` +
        `${formacion?.lugar ? `, en ${formacion.lugar}` : ''}.` +
        (sesiones.length ? ' El calendario de sesiones acordado figura como anexo al final de este contrato.' : '')
    );

    parrafo('TERCERA — Precio y forma de pago.', { negrita: true, sinHueco: true });
    parrafo(
        `El precio de la formación es de ${Number(formacion?.precio_cerrado || 0).toFixed(2)} € (IVA no incluido), ` +
        'a precio cerrado por la acción formativa completa con independencia del número de asistentes. ' +
        'Se abonará contra factura emitida por el PRESTADOR, en las condiciones de pago que consten en ella.'
    );

    parrafo('CUARTA — Obligaciones del PRESTADOR.', { negrita: true, sinHueco: true });
    parrafo(
        'Impartir la formación con la diligencia y calidad debidas, aportar los materiales didácticos necesarios, ' +
        'llevar registro de asistencia y aprovechamiento de los alumnos y emitir, para quienes resulten aptos, ' +
        'certificado individual de aprovechamiento con código de verificación.'
    );

    parrafo('QUINTA — Obligaciones del CLIENTE.', { negrita: true, sinHueco: true });
    parrafo(
        'Facilitar la relación de asistentes con antelación suficiente, poner a disposición los medios acordados ' +
        '(sala, equipos y conexión cuando la formación sea en sus instalaciones) y abonar el precio pactado.'
    );

    parrafo('SEXTA — Protección de datos.', { negrita: true, sinHueco: true });
    parrafo(
        'Los datos de los asistentes se tratarán conforme al Reglamento (UE) 2016/679 (RGPD) y la LO 3/2018, ' +
        'con la única finalidad de gestionar la formación y emitir los certificados, y se conservarán durante los ' +
        'plazos legalmente exigibles. Cada parte es responsable de sus propios tratamientos.'
    );

    parrafo('SÉPTIMA — Confidencialidad.', { negrita: true, sinHueco: true });
    parrafo(
        'Las partes guardarán confidencialidad sobre la información no pública de la otra parte a la que accedan ' +
        'con ocasión de este contrato, obligación que subsiste tras su terminación.'
    );

    parrafo('OCTAVA — Resolución y ley aplicable.', { negrita: true, sinHueco: true });
    parrafo(
        'El incumplimiento grave de cualquiera de las cláusulas faculta a la otra parte para resolver el contrato. ' +
        'Este contrato se rige por la legislación española.'
    );

    // ── Firmas ───────────────────────────────────────────────────────────────
    necesita(50);
    y += 6;
    parrafo(`Y en prueba de conformidad, ambas partes lo firman a ${fechaLarga(new Date())}.`, { gris: true });
    y += 14;

    const colIzq = MARGEN + ANCHO * 0.25;
    const colDer = MARGEN + ANCHO * 0.75;
    doc.setDrawColor(150, 150, 160);
    doc.setLineWidth(0.3);
    doc.line(colIzq - 32, y, colIzq + 32, y);
    doc.line(colDer - 32, y, colDer + 32, y);
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TINTA);
    doc.text('El PRESTADOR', colIzq, y, { align: 'center' });
    doc.text('El CLIENTE', colDer, y, { align: 'center' });
    y += 4.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(emisor.nombre, colIzq, y, { align: 'center' });
    doc.text(clienteNombre, colDer, y, { align: 'center' });

    // ── Anexo: calendario de sesiones ────────────────────────────────────────
    if (sesiones.length) {
        nuevaPagina();
        titulo('Anexo — Calendario de sesiones');
        sesiones.forEach((s, i) => {
            const horario = [s.hora_inicio?.slice(0, 5), s.hora_fin?.slice(0, 5)].filter(Boolean).join('–');
            parrafo(
                `Sesión ${i + 1}: ${fechaLarga(s.fecha)}` +
                `${horario ? `, ${horario}` : ''}${s.horas ? ` (${s.horas} h)` : ''}${s.lugar ? ` — ${s.lugar}` : ''}`,
                { sinHueco: true }
            );
        });
    }

    return doc;
}

/**
 * Genera el contrato de una formación: PDF a Storage + fila pendiente_firma.
 * Si había otro pendiente de firma, lo anula (el vigente es el último).
 */
export async function generarContrato(formacionId) {
    const { data: formacion, error: errF } = await supabase
        .from('formaciones')
        .select('*, clients:clientes(*)')
        .eq('id', formacionId)
        .single();
    if (errF) return { error: errF.message };
    if (!formacion?.clients) return { error: 'La formación no tiene cliente' };
    if (!formacion.clients.tax_id) {
        return { error: 'El cliente no tiene NIF/CIF. Complétalo en su ficha antes de generar el contrato.' };
    }

    const { data: sesiones } = await supabase
        .from('formacion_sesiones')
        .select('*')
        .eq('formacion_id', formacionId)
        .order('fecha');

    const settings = await getCompanySettings();
    const doc = generarPdfContrato({ formacion, cliente: formacion.clients, sesiones: sesiones || [], settings });

    const ruta = `${formacionId}/contrato-${Date.now()}.pdf`;
    const { error: errSubida } = await supabase.storage
        .from('contratos')
        .upload(ruta, doc.output('blob'), { contentType: 'application/pdf', upsert: true });
    if (errSubida) return { error: `No se pudo guardar el contrato: ${errSubida.message}` };

    // El vigente es el último: los pendientes anteriores quedan anulados
    await supabase
        .from('formacion_contratos')
        .update({ estado: 'anulado' })
        .eq('formacion_id', formacionId)
        .eq('estado', 'pendiente_firma');

    const { data: contrato, error: errInsert } = await supabase
        .from('formacion_contratos')
        .insert([{ formacion_id: formacionId, ruta_pdf: ruta }])
        .select('*')
        .single();
    if (errInsert) return { error: `Contrato generado pero no registrado: ${errInsert.message}` };

    registrarAccion('contrato.generado', { tipo: 'contrato', id: contrato.id, label: formacion.titulo });
    return { ok: true, doc, contrato };
}

/** Sube el PDF firmado que devuelve el cliente y marca el contrato como firmado. */
export async function subirContratoFirmado(contrato, file) {
    if (!file) return { error: 'Elige el PDF firmado' };
    if (file.type !== 'application/pdf') return { error: 'El contrato firmado tiene que ser un PDF' };
    if (file.size > 10 * 1024 * 1024) return { error: 'El PDF firmado no puede pasar de 10 MB' };

    const ruta = `${contrato.formacion_id}/firmado-${contrato.id}.pdf`;
    const { error: errSubida } = await supabase.storage
        .from('contratos')
        .upload(ruta, file, { contentType: 'application/pdf', upsert: true });
    if (errSubida) return { error: `No se pudo subir: ${errSubida.message}` };

    const { error: errUpdate } = await supabase
        .from('formacion_contratos')
        .update({ estado: 'firmado', ruta_pdf_firmado: ruta, firmado_at: new Date().toISOString() })
        .eq('id', contrato.id);
    if (errUpdate) return { error: `Subido pero no registrado: ${errUpdate.message}` };

    registrarAccion('contrato.firmado', { tipo: 'contrato', id: contrato.id });
    return { ok: true };
}

/** URL temporal para descargar cualquiera de las dos versiones. */
export async function urlContrato(ruta, segundos = 120) {
    const { data, error } = await supabase.storage.from('contratos').createSignedUrl(ruta, segundos);
    if (error) return { error: error.message };
    return { url: data.signedUrl };
}
