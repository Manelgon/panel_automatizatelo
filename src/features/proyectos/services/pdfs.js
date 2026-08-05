import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// =============================================================================
// PDFs DE PROYECTO: presupuesto y recibo de pago
// =============================================================================
// Antes vivían incrustados en ProjectDetail.jsx, y el del presupuesto estaba
// COPIADO dos veces: una al generarlo y otra al re-descargarlo. Dos copias del
// mismo dibujo terminan divergiendo en cuanto alguien toca una sola.
//
// Son funciones puras: reciben datos, devuelven el documento jsPDF. Quien llama
// decide si guardarlo, subirlo o las dos cosas. Nada de estado ni de Supabase
// aquí dentro.
//
// `emisor` es la fila de company_settings; `receptor` es
// { nombre, nif, direccion, email }. Ambos opcionales: sin ellos el documento
// sale como antes, pero un presupuesto sin las dos partes identificadas vale
// poco como documento comercial.
// =============================================================================

const TINTA_CABECERA = [30, 30, 40];
const NARANJA = [255, 140, 50];
const VERDE = [80, 200, 120];
const GRIS_CLARO = [180, 180, 190];
const GRIS_TEXTO = [60, 60, 70];

/** Cabecera oscura: título + líneas a la izquierda, identidad del emisor a la derecha. */
function cabecera(doc, titulo, lineas, color, emisor) {
    doc.setFillColor(...TINTA_CABECERA);
    doc.rect(0, 0, 220, 42, 'F');
    doc.setTextColor(...color);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(titulo, 15, 22);
    doc.setFontSize(10);
    doc.setTextColor(...GRIS_CLARO);
    lineas.forEach((l, i) => doc.text(l, 15, 32 + i * 6));

    // Emisor a la derecha: nombre, NIF, dirección y contacto
    const nombre = emisor?.emisor_nombre || 'Automátízatelo';
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(nombre, 195, 14, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS_CLARO);
    const lineasEmisor = [
        emisor?.emisor_nif ? `NIF: ${emisor.emisor_nif}` : null,
        emisor?.emisor_direccion || null,
        [emisor?.emisor_cp, emisor?.emisor_ciudad, emisor?.emisor_provincia].filter(Boolean).join(' · ') || null,
        [emisor?.emisor_email, emisor?.emisor_telefono].filter(Boolean).join(' · ') || null,
        emisor?.emisor_web || 'automatizatelo.com',
    ].filter(Boolean);
    lineasEmisor.forEach((l, i) => doc.text(l, 195, 20 + i * 4.5, { align: 'right' }));
}

/** Bloque PROYECTO + datos del receptor debajo de la cabecera. Devuelve la Y donde acaba. */
function fichaPartes(doc, proyecto, receptor) {
    const nombreProyecto = proyecto?.name || 'Proyecto';
    const alias = proyecto?.id_alias || '';

    doc.setTextColor(...GRIS_TEXTO);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PROYECTO:', 15, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`${nombreProyecto}${alias ? ` (${alias})` : ''}`, 50, 55);

    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', 15, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(receptor?.nombre || proyecto?.client || 'Cliente', 50, 62);

    let y = 69;
    if (receptor?.nif) {
        doc.setFont('helvetica', 'bold');
        doc.text('NIF:', 15, y);
        doc.setFont('helvetica', 'normal');
        doc.text(receptor.nif, 50, y);
        y += 7;
    }
    if (receptor?.direccion) {
        doc.setFont('helvetica', 'bold');
        doc.text('DIRECCIÓN:', 15, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const lineas = doc.splitTextToSize(receptor.direccion, 130);
        doc.text(lineas, 50, y);
        doc.setFontSize(10);
        y += lineas.length * 5 + 2;
    }
    return y;
}

/**
 * Presupuesto. `lineas` con la forma del snapshot de project_budgets:
 * { description, quantity, unit_price, iva_percent, base, total }.
 * Una sola implementación para generar y para re-descargar.
 */
export function generarPdfPresupuesto({ numero, fecha, proyecto, lineas, subtotal, ivaTotal, total, emisor, receptor }) {
    const doc = new jsPDF();
    const fechaTxt = fecha ? new Date(fecha).toLocaleDateString('es-ES') : new Date().toLocaleDateString('es-ES');

    cabecera(doc, 'PRESUPUESTO', [numero ? `N.º ${numero}` : null, `Fecha: ${fechaTxt}`].filter(Boolean), NARANJA, emisor);
    const finFicha = fichaPartes(doc, proyecto, receptor);

    autoTable(doc, {
        startY: Math.max(76, finFicha + 4),
        head: [['Concepto', 'Cant.', 'Precio Unit.', 'IVA', 'Base', 'Total']],
        body: (lineas || []).map(l => [
            l.description,
            l.quantity?.toString() || '1',
            `€${parseFloat(l.unit_price || 0).toFixed(2)}`,
            `${l.iva_percent || 21}%`,
            `€${parseFloat(l.base || 0).toFixed(2)}`,
            `€${parseFloat(l.total || 0).toFixed(2)}`,
        ]),
        headStyles: { fillColor: NARANJA, textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9, textColor: [50, 50, 60] },
        alternateRowStyles: { fillColor: [245, 245, 248] },
        columnStyles: {
            0: { cellWidth: 60 },
            1: { halign: 'center', cellWidth: 18 },
            2: { halign: 'right', cellWidth: 28 },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'right', cellWidth: 28 },
            5: { halign: 'right', cellWidth: 28 },
        },
        margin: { left: 15, right: 15 },
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 90);
    doc.text('Subtotal (Base):', 120, finalY + 8);
    doc.text(`€${parseFloat(subtotal || 0).toFixed(2)}`, 195, finalY + 8, { align: 'right' });
    doc.text('IVA Total:', 120, finalY + 16);
    doc.text(`€${parseFloat(ivaTotal || 0).toFixed(2)}`, 195, finalY + 16, { align: 'right' });
    doc.setFontSize(13);
    doc.setTextColor(...NARANJA);
    doc.text('TOTAL:', 120, finalY + 28);
    doc.text(`€${parseFloat(total || 0).toFixed(2)}`, 195, finalY + 28, { align: 'right' });

    return doc;
}

/**
 * Recibo de pago. `totalCobrado` es lo cobrado ANTES de este pago: el resumen
 * de cuenta suma el pago actual él solo, igual que hacía el código original.
 */
export function generarPdfRecibo({ pago, metodoEtiqueta, proyecto, totalFacturado, totalCobrado, emisor, receptor }) {
    const doc = new jsPDF();

    cabecera(doc, 'RECIBO DE PAGO', [
        `N.º ${pago.payment_number}`,
        `Fecha: ${new Date(pago.payment_date).toLocaleDateString('es-ES')}`,
    ], VERDE, emisor);
    const finFicha = fichaPartes(doc, proyecto, receptor);

    // Caja del importe
    const cajaY = Math.max(75, finFicha + 4);
    doc.setFillColor(245, 250, 245);
    doc.roundedRect(15, cajaY, 180, 60, 4, 4, 'F');
    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, cajaY, 180, 60, 4, 4, 'S');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...GRIS_TEXTO);
    doc.text('IMPORTE RECIBIDO:', 25, cajaY + 15);
    doc.setFontSize(28);
    doc.setTextColor(...VERDE);
    doc.text(`€${parseFloat(pago.amount).toFixed(2)}`, 25, cajaY + 33);

    doc.setFontSize(10);
    doc.setTextColor(80, 80, 90);
    doc.setFont('helvetica', 'bold');
    doc.text('Método de Pago:', 120, cajaY + 15);
    doc.setFont('helvetica', 'normal');
    doc.text(metodoEtiqueta || 'Otro', 120, cajaY + 25);

    if (pago.notes) {
        doc.setFont('helvetica', 'bold');
        doc.text('Notas:', 120, cajaY + 40);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(doc.splitTextToSize(pago.notes, 65), 120, cajaY + 48);
    }

    // Resumen de cuenta
    const y = cajaY + 75;
    doc.setDrawColor(200, 200, 210);
    doc.line(15, y, 195, y);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 90);
    doc.text('RESUMEN DE CUENTA', 15, y + 10);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Total Facturado:', 15, y + 22);
    doc.text(`€${(totalFacturado || 0).toFixed(2)}`, 195, y + 22, { align: 'right' });

    const cobradoConEste = (totalCobrado || 0) + parseFloat(pago.amount || 0);
    doc.text('Total Cobrado (inc. este pago):', 15, y + 32);
    doc.setTextColor(...VERDE);
    doc.text(`€${cobradoConEste.toFixed(2)}`, 195, y + 32, { align: 'right' });

    doc.setDrawColor(...VERDE);
    doc.setLineWidth(0.5);
    doc.line(15, y + 36, 195, y + 36);

    const pendiente = (totalFacturado || 0) - cobradoConEste;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    if (pendiente <= 0) {
        doc.setTextColor(...VERDE);
        doc.text('SALDO PENDIENTE:', 15, y + 46);
        doc.text('€0.00 - PAGADO COMPLETO ✓', 195, y + 46, { align: 'right' });
    } else {
        doc.setTextColor(220, 120, 50);
        doc.text('SALDO PENDIENTE:', 15, y + 46);
        doc.text(`€${pendiente.toFixed(2)}`, 195, y + 46, { align: 'right' });
    }

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 160);
    doc.text(`Este recibo ha sido generado automáticamente por el Panel de ${emisor?.emisor_nombre || 'Automátízatelo'}.`, 105, 285, { align: 'center' });

    return doc;
}
