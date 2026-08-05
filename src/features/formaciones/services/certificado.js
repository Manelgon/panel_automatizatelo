import jsPDF from 'jspdf';
import { supabase } from '../../../lib/supabase';
import { getCompanySettings } from '../../../lib/facturas';
import { TIPOS, MODALIDADES } from '../constantes';

// =============================================================================
// CERTIFICADOS DE FORMACIÓN
// =============================================================================
// Lo que se vende del Art. 4 del Reglamento de IA no es la clase: es poder
// demostrarla. Este certificado es la prueba, así que lleva lo que una
// inspección esperaría encontrar — quién, qué, cuántas horas, cuándo, impartido
// por quién — y un código de verificación para que no valga cualquier PDF.
// =============================================================================

const NARANJA = [243, 121, 27];
const TINTA = [30, 30, 40];
const GRIS = [120, 120, 132];

export const nombreCompletoAlumno = (a) =>
    [a?.nombre, a?.apellidos].filter(Boolean).join(' ').trim() || 'Alumno';

const fecha = (d) => (d ? new Date(d).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

/**
 * Construye el PDF. Apaisado, que es como se leen los certificados.
 * Devuelve el documento jsPDF sin guardarlo: quien llama decide si descargar,
 * subir a Storage o las dos cosas.
 */
export function generarPdfCertificado({ alumno, formacion, cliente, settings }) {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const W = 297;
    const emisor = settings?.emisor_nombre || 'Automatízatelo';
    const emisorNif = settings?.emisor_nif || '';
    const emisorWeb = settings?.emisor_web || 'automatizatelo.com';

    // Marco
    doc.setDrawColor(...NARANJA);
    doc.setLineWidth(1.2);
    doc.rect(12, 12, W - 24, 186);
    doc.setLineWidth(0.3);
    doc.rect(16, 16, W - 32, 178);

    // Cabecera
    doc.setTextColor(...NARANJA);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(emisor.toUpperCase(), W / 2, 30, { align: 'center', charSpace: 1.6 });

    doc.setTextColor(...TINTA);
    doc.setFontSize(30);
    doc.text('CERTIFICADO DE APROVECHAMIENTO', W / 2, 48, { align: 'center' });

    // A quién
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...GRIS);
    doc.text('Se certifica que', W / 2, 66, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(...TINTA);
    doc.text(nombreCompletoAlumno(alumno), W / 2, 80, { align: 'center' });

    if (alumno?.dni) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...GRIS);
        doc.text(`DNI ${alumno.dni}`, W / 2, 87, { align: 'center' });
    }

    // Qué
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...GRIS);
    doc.text('ha superado con aprovechamiento la formación', W / 2, 99, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...TINTA);
    doc.text(doc.splitTextToSize(formacion?.titulo || 'Formación', W - 80), W / 2, 110, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(...GRIS);
    doc.text(TIPOS[formacion?.tipo]?.largo || '', W / 2, 122, { align: 'center' });

    // Los datos que hacen que esto sirva como prueba
    const horas = Number(alumno?.asistencia_horas ?? formacion?.horas_totales ?? 0);
    const desde = fecha(formacion?.fecha_inicio);
    const hasta = fecha(formacion?.fecha_fin);
    const periodo = desde && hasta && desde !== hasta ? `del ${desde} al ${hasta}` : (desde || hasta || '');

    const datos = [
        ['Duración', `${horas} horas lectivas`],
        ['Fechas', periodo || '—'],
        ['Modalidad', MODALIDADES[formacion?.modalidad] || '—'],
        ['Entidad', cliente?.company_name || [cliente?.first_name, cliente?.last_name].filter(Boolean).join(' ') || '—'],
    ];

    let x = 40;
    const anchoCol = (W - 80) / datos.length;
    datos.forEach(([etiqueta, valor]) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...NARANJA);
        doc.text(etiqueta.toUpperCase(), x + anchoCol / 2, 138, { align: 'center', charSpace: 0.8 });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...TINTA);
        doc.text(doc.splitTextToSize(String(valor), anchoCol - 6), x + anchoCol / 2, 145, { align: 'center' });
        x += anchoCol;
    });

    // Temario: sin contenidos, un certificado no acredita gran cosa
    if (formacion?.contenidos) {
        doc.setDrawColor(225, 225, 230);
        doc.setLineWidth(0.3);
        doc.line(40, 155, W - 40, 155);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...NARANJA);
        doc.text('CONTENIDOS', W / 2, 162, { align: 'center', charSpace: 0.8 });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...GRIS);
        const texto = doc.splitTextToSize(formacion.contenidos.replace(/\s*\n\s*/g, ' · '), W - 90);
        doc.text(texto.slice(0, 3), W / 2, 168, { align: 'center' });
    }

    // Firma y verificación
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...TINTA);
    doc.text(emisor, 45, 184, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text([emisorNif && `NIF ${emisorNif}`, emisorWeb].filter(Boolean).join(' · '), 45, 189, { align: 'center' });

    if (alumno?.certificado_codigo) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...NARANJA);
        doc.text('CÓDIGO DE VERIFICACIÓN', W - 45, 182, { align: 'center', charSpace: 0.8 });
        doc.setFont('courier', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...TINTA);
        doc.text(alumno.certificado_codigo, W - 45, 189, { align: 'center' });
    }

    return doc;
}

/**
 * Emite el certificado de un alumno: asigna código si no lo tiene, genera el
 * PDF, lo guarda en Storage y lo deja registrado.
 *
 * El código se asigna AQUÍ y no al crear el alumno: un código en un certificado
 * que nunca se emitió no verifica nada.
 */
export async function emitirCertificado(alumnoId) {
    // 1. Todo lo que necesita el documento, de una vez
    const { data: alumno, error: errAlumno } = await supabase
        .from('formacion_alumnos')
        .select('*, formaciones(*, clients:clientes(*))')
        .eq('id', alumnoId)
        .single();

    if (errAlumno) return { error: errAlumno.message };
    if (!alumno) return { error: 'No se encontró el alumno' };

    const formacion = alumno.formaciones;
    if (!formacion) return { error: 'El alumno no está asociado a ninguna formación' };
    if (alumno.aprovechamiento !== 'apto') {
        return { error: 'Solo se certifica a quien consta como apto. Marca primero el aprovechamiento.' };
    }

    // 2. Código de verificación
    let codigo = alumno.certificado_codigo;
    if (!codigo) {
        const { data, error } = await supabase.rpc('generar_codigo_certificado');
        if (error) return { error: `No se pudo generar el código: ${error.message}` };
        codigo = data;
    }

    // 3. El PDF
    const settings = await getCompanySettings();
    const doc = generarPdfCertificado({
        alumno: { ...alumno, certificado_codigo: codigo },
        formacion,
        cliente: formacion.clients,
        settings,
    });

    // 4. A Storage. Bucket privado: el certificado lleva nombre y a veces DNI.
    const ruta = `${formacion.id}/${codigo}.pdf`;
    const { error: errSubida } = await supabase.storage
        .from('certificados')
        .upload(ruta, doc.output('blob'), { contentType: 'application/pdf', upsert: true });

    if (errSubida) return { error: `No se pudo guardar el certificado: ${errSubida.message}` };

    // 5. Dejarlo registrado
    const { error: errUpdate } = await supabase
        .from('formacion_alumnos')
        .update({
            certificado_codigo: codigo,
            certificado_url: ruta,
            certificado_emitido_at: new Date().toISOString(),
        })
        .eq('id', alumnoId);

    if (errUpdate) return { error: `Certificado generado pero no registrado: ${errUpdate.message}` };

    return { ok: true, codigo, ruta, doc };
}

/** URL temporal para descargar un certificado ya emitido. */
export async function urlCertificado(ruta, segundos = 120) {
    const { data, error } = await supabase.storage
        .from('certificados')
        .createSignedUrl(ruta, segundos);
    if (error) return { error: error.message };
    return { url: data.signedUrl };
}
