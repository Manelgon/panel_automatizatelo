import { supabase } from './supabase';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// =============================================================================
// VALIDADOR NIF / NIE / CIF (algoritmos oficiales)
// =============================================================================
// Bloqueante antes de emitir: un NIF mal contamina la cadena Verifactu y la
// AEAT rechaza el envío. Mejor abortar aquí.

const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE';
const LETRAS_CIF_CONTROL = 'JABCDEFGHI';

function normalizarNif(input) {
  return String(input || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function validarNif(s) {
  if (!/^\d{8}[A-Z]$/.test(s)) return false;
  const num = parseInt(s.slice(0, 8), 10);
  return s[8] === LETRAS_NIF[num % 23];
}

function validarNie(s) {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(s)) return false;
  const prefijo = { X: '0', Y: '1', Z: '2' }[s[0]];
  const num = parseInt(prefijo + s.slice(1, 8), 10);
  return s[8] === LETRAS_NIF[num % 23];
}

function validarCif(s) {
  if (!/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[\dA-J]$/.test(s)) return false;
  const digitos = s.slice(1, 8);
  let sumaPar = 0, sumaImpar = 0;
  for (let i = 0; i < 7; i++) {
    const d = parseInt(digitos[i], 10);
    if (i % 2 === 0) {
      const doble = d * 2;
      sumaImpar += Math.floor(doble / 10) + (doble % 10);
    } else {
      sumaPar += d;
    }
  }
  const total = sumaPar + sumaImpar;
  const digitoControl = (10 - (total % 10)) % 10;
  const ultimo = s[8];
  const letraEsperada = LETRAS_CIF_CONTROL[digitoControl];
  const exigeLetra = 'PQRSNW'.includes(s[0]);
  if (exigeLetra) return ultimo === letraEsperada;
  return ultimo === String(digitoControl) || ultimo === letraEsperada;
}

export function validarIdFiscal(input) {
  if (!input || !String(input).trim()) {
    return { valido: false, error: 'NIF/CIF vacío' };
  }
  const s = normalizarNif(input);
  if (s.length !== 9) {
    return { valido: false, error: 'NIF/CIF debe tener 9 caracteres' };
  }
  if (/^\d{8}[A-Z]$/.test(s)) {
    return validarNif(s)
      ? { valido: true, normalizado: s, tipo: 'NIF' }
      : { valido: false, error: 'NIF: letra de control incorrecta' };
  }
  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) {
    return validarNie(s)
      ? { valido: true, normalizado: s, tipo: 'NIE' }
      : { valido: false, error: 'NIE: letra de control incorrecta' };
  }
  if (/^[A-Z]\d{7}[\dA-J]$/.test(s)) {
    return validarCif(s)
      ? { valido: true, normalizado: s, tipo: 'CIF' }
      : { valido: false, error: 'CIF: dígito de control incorrecto' };
  }
  return { valido: false, error: 'Formato no reconocido como NIF/NIE/CIF' };
}


// =============================================================================
// COMPANY SETTINGS
// =============================================================================
export async function getCompanySettings() {
  const { data, error } = await supabase
    .from('company_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data;
}


// =============================================================================
// CREAR FACTURA
// =============================================================================
// Flujo:
//   1. Valida cliente y NIF (bloqueante)
//   2. Reserva número atómico vía RPC next_numero_factura
//   3. Calcula importes desglosados
//   4. INSERT facturas + factura_lineas
//
// lineas: [{ concepto, cantidad, precio_unitario, descuento_porcentaje? }]
export async function crearFactura({
  clientId,
  projectId = null,
  formacionId = null,
  lineas,
  ivaPorcentaje = 21,
  irpfPorcentaje = 0,
  formaPago = null,
  fechaVencimiento = null,
  notas = null,
  serie = null,
}) {
  if (!clientId) return { error: 'Cliente obligatorio para emitir factura' };
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return { error: 'La factura debe tener al menos una línea' };
  }

  // 1. Cliente + NIF
  const { data: cliente, error: cliErr } = await supabase
    .from('clientes')
    .select('id, tax_id, first_name, last_name, company_name, email, billing_address, billing_postal_code, billing_city, billing_country')
    .eq('id', clientId)
    .single();
  if (cliErr || !cliente) return { error: 'Cliente no encontrado' };

  const nif = validarIdFiscal(cliente.tax_id);
  if (!nif.valido) {
    return {
      error: `NIF del cliente inválido (${nif.error}). Edita el cliente y corrige el NIF antes de facturar.`,
    };
  }

  // 2. Reserva número
  const { data: numeroRows, error: numErr } = await supabase.rpc('next_numero_factura', { p_serie: serie });
  if (numErr || !numeroRows || numeroRows.length === 0) {
    return { error: numErr?.message || 'No se pudo reservar número de factura' };
  }
  const num = numeroRows[0];

  // 3. Importes
  const lineasNorm = lineas.map((l, idx) => {
    const cantidad = parseFloat(l.cantidad) || 1;
    const precio = parseFloat(l.precio_unitario) || 0;
    const descuento = parseFloat(l.descuento_porcentaje) || 0;
    const base = +(cantidad * precio * (1 - descuento / 100)).toFixed(2);
    return {
      orden: idx + 1,
      concepto: l.concepto || 'Servicio',
      cantidad,
      precio_unitario: precio,
      descuento_porcentaje: descuento,
      base_linea: base,
    };
  });
  const baseImponible = +lineasNorm.reduce((s, l) => s + l.base_linea, 0).toFixed(2);
  const ivaImporte = +(baseImponible * ivaPorcentaje / 100).toFixed(2);
  const irpfImporte = +(baseImponible * irpfPorcentaje / 100).toFixed(2);
  const total = +(baseImponible + ivaImporte - irpfImporte).toFixed(2);

  // 4. Snapshot cliente
  const clienteNombre = cliente.company_name
    || `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim()
    || 'Cliente';
  const clienteDireccion = [
    cliente.billing_address,
    cliente.billing_postal_code,
    cliente.billing_city,
    cliente.billing_country,
  ].filter(Boolean).join(', ');

  // 5. Defaults desde Ajustes del emisor: vencimiento y forma de pago.
  // Quien llame puede pasarlos explícitos; si no, mandan los ajustes.
  const settings = await getCompanySettings();

  let vencimiento = fechaVencimiento;
  if (!vencimiento) {
    const dias = settings?.dias_vencimiento_default || 30;
    const d = new Date();
    d.setDate(d.getDate() + dias);
    vencimiento = d.toISOString().split('T')[0];
  }

  const formaPagoFinal = formaPago || settings?.forma_pago_default || 'transferencia';

  // 6. INSERT factura
  const { data: factura, error: facErr } = await supabase
    .from('facturas')
    .insert([{
      serie: num.serie,
      anio: num.anio,
      correlativo: num.correlativo,
      numero: num.numero,
      client_id: clientId,
      project_id: projectId,
      formacion_id: formacionId,
      cliente_nombre: clienteNombre,
      cliente_nif: nif.normalizado,
      cliente_direccion: clienteDireccion || null,
      cliente_email: cliente.email || null,
      base_imponible: baseImponible,
      iva_porcentaje: ivaPorcentaje,
      iva_importe: ivaImporte,
      irpf_porcentaje: irpfPorcentaje,
      irpf_importe: irpfImporte,
      total,
      forma_pago: formaPagoFinal,
      fecha_vencimiento: vencimiento,
      notas,
    }])
    .select()
    .single();
  if (facErr) return { error: facErr.message };

  // 7. INSERT líneas (si falla, deshacemos la factura para no dejarla sin líneas)
  const lineasFinal = lineasNorm.map(l => ({ ...l, factura_id: factura.id }));
  const { error: linErr } = await supabase.from('factura_lineas').insert(lineasFinal);
  if (linErr) {
    await supabase.from('facturas').delete().eq('id', factura.id);
    return { error: `Error insertando líneas: ${linErr.message}` };
  }

  return { ok: true, factura, lineas: lineasFinal };
}


// =============================================================================
// GET FACTURA COMPLETA (factura + líneas ordenadas)
// =============================================================================
// =============================================================================
// PDF FACTURA (reutilizable: pages/ProjectDetail, pages/Facturas, etc.)
// =============================================================================
// Espera `factura` con `factura_lineas` embebidas y opcionalmente `projects:proyectos(name, id_alias)`.
// `settings` es la fila company_settings. `proyecto` (opcional) sobreescribe el del join.
export function generarPdfFactura(factura, settings, proyecto = null) {
    const doc = new jsPDF();
    const p = proyecto || factura.projects || null;
    const pName = p?.name || '—';
    const pAlias = p?.id_alias || '';
    const emisorNombre = settings?.emisor_nombre || 'Automatízatelo';
    const emisorWeb = settings?.emisor_web || 'automatizatelo.com';
    const emisorNif = settings?.emisor_nif || '';
    const lineas = (factura.factura_lineas || []).slice().sort((a, b) => a.orden - b.orden);

    doc.setFillColor(30, 30, 40);
    doc.rect(0, 0, 220, 42, 'F');
    doc.setTextColor(255, 140, 50);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('FACTURA', 15, 22);
    doc.setFontSize(10);
    doc.setTextColor(180, 180, 190);
    doc.text(`N.º ${factura.numero}`, 15, 32);
    doc.text(`Fecha: ${new Date(factura.fecha_emision).toLocaleDateString('es-ES')}`, 15, 38);

    // Emisor completo a la derecha: el RD 1619/2012 exige nombre, NIF y
    // domicilio de las dos partes, no solo de una.
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(emisorNombre, 195, 14, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(180, 180, 190);
    const lineasEmisor = [
        emisorNif ? `NIF: ${emisorNif}` : null,
        settings?.emisor_direccion || null,
        [settings?.emisor_cp, settings?.emisor_ciudad, settings?.emisor_provincia].filter(Boolean).join(' · ') || null,
        [settings?.emisor_email, settings?.emisor_telefono].filter(Boolean).join(' · ') || null,
        emisorWeb,
    ].filter(Boolean);
    lineasEmisor.forEach((l, i) => doc.text(l, 195, 20 + i * 4.5, { align: 'right' }));

    doc.setTextColor(60, 60, 70);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('PROYECTO:', 15, 55);
    doc.setFont('helvetica', 'normal');
    doc.text(`${pName}${pAlias ? ` (${pAlias})` : ''}`, 50, 55);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE:', 15, 62);
    doc.setFont('helvetica', 'normal');
    doc.text(factura.cliente_nombre || 'Cliente', 50, 62);
    let cabY = 69;
    if (factura.cliente_nif) {
        doc.setFont('helvetica', 'bold');
        doc.text('NIF:', 15, cabY);
        doc.setFont('helvetica', 'normal');
        doc.text(factura.cliente_nif, 50, cabY);
        cabY += 7;
    }
    // El domicilio del receptor ya se congelaba en la factura; solo faltaba imprimirlo
    if (factura.cliente_direccion) {
        doc.setFont('helvetica', 'bold');
        doc.text('DIRECCIÓN:', 15, cabY);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        const dirLineas = doc.splitTextToSize(factura.cliente_direccion, 130);
        doc.text(dirLineas, 50, cabY);
        doc.setFontSize(10);
        cabY += dirLineas.length * 5 + 2;
    }

    const tableRows = lineas.map(l => [
        l.concepto,
        (l.cantidad ?? 1).toString(),
        `€${parseFloat(l.precio_unitario || 0).toFixed(2)}`,
        l.descuento_porcentaje > 0 ? `${l.descuento_porcentaje}%` : '-',
        `€${parseFloat(l.base_linea || 0).toFixed(2)}`,
    ]);

    autoTable(doc, {
        startY: Math.max(76, cabY + 4),
        head: [['Concepto', 'Cant.', 'Precio Unit.', 'Dto.', 'Base']],
        body: tableRows,
        headStyles: { fillColor: [255, 140, 50], textColor: 255, fontSize: 9, fontStyle: 'bold' },
        bodyStyles: { fontSize: 9, textColor: [50, 50, 60] },
        alternateRowStyles: { fillColor: [245, 245, 248] },
        columnStyles: {
            0: { cellWidth: 75 },
            1: { halign: 'center', cellWidth: 18 },
            2: { halign: 'right', cellWidth: 28 },
            3: { halign: 'center', cellWidth: 18 },
            4: { halign: 'right', cellWidth: 35 },
        },
        margin: { left: 15, right: 15 },
    });

    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setDrawColor(200, 200, 210);
    doc.line(120, finalY, 195, finalY);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 90);
    doc.text('Base imponible:', 120, finalY + 8);
    doc.text(`€${parseFloat(factura.base_imponible).toFixed(2)}`, 195, finalY + 8, { align: 'right' });
    doc.text(`IVA (${parseFloat(factura.iva_porcentaje).toFixed(0)}%):`, 120, finalY + 15);
    doc.text(`€${parseFloat(factura.iva_importe).toFixed(2)}`, 195, finalY + 15, { align: 'right' });

    let yPos = finalY + 22;
    if (parseFloat(factura.irpf_importe) > 0) {
        doc.text(`IRPF (-${parseFloat(factura.irpf_porcentaje).toFixed(0)}%):`, 120, yPos);
        doc.text(`-€${parseFloat(factura.irpf_importe).toFixed(2)}`, 195, yPos, { align: 'right' });
        yPos += 7;
    }

    doc.setDrawColor(255, 140, 50);
    doc.setLineWidth(0.5);
    doc.line(120, yPos, 195, yPos);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 140, 50);
    doc.text('TOTAL:', 120, yPos + 8);
    doc.text(`€${parseFloat(factura.total).toFixed(2)}`, 195, yPos + 8, { align: 'right' });

    // ── Cómo pagar ──
    // Sin este bloque, el cliente recibía una factura sin saber a qué cuenta
    // transferir. La forma de pago viene de la factura; el IBAN, del emisor.
    const ETIQUETAS_PAGO = {
        transferencia: 'Transferencia bancaria',
        efectivo: 'Efectivo',
        bizum: 'Bizum',
        tarjeta: 'Tarjeta',
        domiciliacion: 'Domiciliación bancaria',
    };
    const pagoY = yPos + 22;
    doc.setFillColor(248, 246, 240);
    doc.roundedRect(15, pagoY, 180, factura.forma_pago === 'transferencia' && settings?.emisor_iban ? 26 : 18, 3, 3, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(80, 80, 90);
    doc.text('FORMA DE PAGO:', 22, pagoY + 8);
    doc.setFont('helvetica', 'normal');
    doc.text(ETIQUETAS_PAGO[factura.forma_pago] || 'Transferencia bancaria', 60, pagoY + 8);
    if (factura.fecha_vencimiento) {
        doc.setFont('helvetica', 'bold');
        doc.text('VENCIMIENTO:', 120, pagoY + 8);
        doc.setFont('helvetica', 'normal');
        doc.text(new Date(factura.fecha_vencimiento).toLocaleDateString('es-ES'), 152, pagoY + 8);
    }
    if (factura.forma_pago === 'transferencia' && settings?.emisor_iban) {
        doc.setFont('helvetica', 'bold');
        doc.text('IBAN:', 22, pagoY + 17);
        doc.setFont('courier', 'bold');
        doc.setFontSize(10);
        doc.text(String(settings.emisor_iban).replace(/(.{4})/g, '$1 ').trim(), 60, pagoY + 17);
    }

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 160);
    const pie = settings?.pie_pagina || `Documento generado por el Panel de ${emisorNombre}.`;
    doc.text(pie, 105, 285, { align: 'center' });

    return doc;
}


// =============================================================================
// VERIFACTU: invoca la Edge Function tras emitir o anular
// =============================================================================
// Llama a verifactu-registrar con JWT del usuario.
// Devuelve { ok, huella, qrUrl } o { error }.
// Diseñada para ser NO BLOQUEANTE: si falla, la factura ya está creada,
// solo muestra warning al usuario para que reintente luego.
export async function registrarVerifactu(facturaId, tipo = 'alta') {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { error: 'Sesión expirada' };

    const { data, error } = await supabase.functions.invoke('verifactu-registrar', {
      body: { facturaId, tipo },
    });
    if (error) {
      // Supabase devuelve el body del error en error.context si es FunctionsHttpError
      let msg = error.message || 'Error invocando verifactu-registrar';
      try {
        const ctx = await error.context?.json?.();
        if (ctx?.error) msg = ctx.error;
      } catch { /* noop */ }
      return { error: msg };
    }
    return data || { error: 'Respuesta vacía de la edge function' };
  } catch (err) {
    return { error: err.message || String(err) };
  }
}


export async function getFacturaCompleta(facturaId) {
  const { data: factura, error } = await supabase
    .from('facturas')
    .select('*, factura_lineas(*)')
    .eq('id', facturaId)
    .single();
  if (error) return { error: error.message };

  if (factura?.factura_lineas) {
    factura.factura_lineas.sort((a, b) => a.orden - b.orden);
  }
  return { factura };
}
