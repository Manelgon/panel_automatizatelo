// =============================================================================
// EDGE FUNCTION: verifactu-registrar
// =============================================================================
// Endpoints:
//   POST  body { facturaId, tipo: 'alta' | 'anulacion' }
//
// Flujo:
//   1. Valida JWT del usuario y rol admin (RLS de Supabase + check explícito).
//   2. Lee factura + emisor (company_settings).
//   3. Valida NIF emisor (y cliente si tipo='alta').
//   4. Lee última huella de verifactu_registros (linealiza con índice único).
//   5. SHA-256 según fórmula Anexo I Orden HAC/1177/2024.
//   6. Construye XML (esquema AEAT SuministroLR).
//   7. INSERT en verifactu_registros (reintenta 3× ante 23505).
//   8. UPDATE facturas.verifactu_*_id + qr_url (en alta).
//
// Despliegue:
//   supabase functions deploy verifactu-registrar --no-verify-jwt=false
// =============================================================================

// @ts-nocheck  // editor local sin tipos Deno; el runtime sí los tiene
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { create } from 'npm:xmlbuilder2@3.1.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// =============================================================================
// VALIDADOR NIF / NIE / CIF
// =============================================================================
const LETRAS_NIF = 'TRWAGMYFPDXBNJZSQVHLCKE';
const LETRAS_CIF_CONTROL = 'JABCDEFGHI';

function normalizar(input: string): string {
  return String(input || '').trim().toUpperCase().replace(/[\s-]/g, '');
}

function validarNif(s: string): boolean {
  if (!/^\d{8}[A-Z]$/.test(s)) return false;
  const num = parseInt(s.slice(0, 8), 10);
  return s[8] === LETRAS_NIF[num % 23];
}
function validarNie(s: string): boolean {
  if (!/^[XYZ]\d{7}[A-Z]$/.test(s)) return false;
  const prefijo = { X: '0', Y: '1', Z: '2' }[s[0] as 'X' | 'Y' | 'Z'];
  const num = parseInt(prefijo + s.slice(1, 8), 10);
  return s[8] === LETRAS_NIF[num % 23];
}
function validarCif(s: string): boolean {
  if (!/^[ABCDEFGHJKLMNPQRSUVW]\d{7}[\dA-J]$/.test(s)) return false;
  const digitos = s.slice(1, 8);
  let sumaPar = 0, sumaImpar = 0;
  for (let i = 0; i < 7; i++) {
    const d = parseInt(digitos[i], 10);
    if (i % 2 === 0) {
      const doble = d * 2;
      sumaImpar += Math.floor(doble / 10) + (doble % 10);
    } else { sumaPar += d; }
  }
  const total = sumaPar + sumaImpar;
  const dc = (10 - (total % 10)) % 10;
  const ultimo = s[8];
  const letraEsperada = LETRAS_CIF_CONTROL[dc];
  const exigeLetra = 'PQRSNW'.includes(s[0]);
  if (exigeLetra) return ultimo === letraEsperada;
  return ultimo === String(dc) || ultimo === letraEsperada;
}
type ResValidacion = { valido: true; normalizado: string } | { valido: false; error: string };
function validarIdFiscal(input: string | null | undefined): ResValidacion {
  if (!input || !String(input).trim()) return { valido: false, error: 'NIF/CIF vacío' };
  const s = normalizar(input);
  if (s.length !== 9) return { valido: false, error: 'NIF/CIF debe tener 9 caracteres' };
  if (/^\d{8}[A-Z]$/.test(s)) return validarNif(s) ? { valido: true, normalizado: s } : { valido: false, error: 'NIF: letra de control incorrecta' };
  if (/^[XYZ]\d{7}[A-Z]$/.test(s)) return validarNie(s) ? { valido: true, normalizado: s } : { valido: false, error: 'NIE: letra de control incorrecta' };
  if (/^[A-Z]\d{7}[\dA-J]$/.test(s)) return validarCif(s) ? { valido: true, normalizado: s } : { valido: false, error: 'CIF: dígito de control incorrecto' };
  return { valido: false, error: 'Formato no reconocido' };
}

// =============================================================================
// FORMATTERS (compartidos hash ↔ XML, no pueden divergir)
// =============================================================================
function fmtImporte(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}
function fmtFechaEsp(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
function fmtFechaHoraUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// =============================================================================
// TIPO FACTURA AEAT
// =============================================================================
type TipoFacturaAeat = 'F1' | 'F2' | 'F3' | 'R1' | 'R2' | 'R3' | 'R4' | 'R5';
function tipoFacturaAeatDeSerie(serie: string): TipoFacturaAeat {
  switch (serie) {
    case 'F': return 'F1';
    case 'R': return 'R1';
    case 'A': return 'R4';
    default:  return 'F1';
  }
}

// =============================================================================
// SHA-256 (Anexo I Orden HAC/1177/2024)
// =============================================================================
async function sha256HexUpper(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

type InputHashAlta = {
  nifEmisor: string;
  numeroFactura: string;
  fechaEmision: string;
  tipoFacturaAeat: TipoFacturaAeat;
  cuotaTotal: number;
  importeTotal: number;
  huellaAnterior: string | null;
  fechaHoraGeneracion: Date;
};
async function calcularHuellaAlta(i: InputHashAlta): Promise<{ huella: string; payload: string }> {
  const payload =
    'IDEmisorFactura=' + i.nifEmisor +
    '&NumSerieFactura=' + i.numeroFactura +
    '&FechaExpedicionFactura=' + fmtFechaEsp(i.fechaEmision) +
    '&TipoFactura=' + i.tipoFacturaAeat +
    '&CuotaTotal=' + fmtImporte(i.cuotaTotal) +
    '&ImporteTotal=' + fmtImporte(i.importeTotal) +
    '&Huella=' + (i.huellaAnterior ?? '') +
    '&FechaHoraHusoGenRegistro=' + fmtFechaHoraUtc(i.fechaHoraGeneracion);
  return { huella: await sha256HexUpper(payload), payload };
}

type InputHashAnulacion = {
  nifEmisor: string;
  numeroFactura: string;
  fechaEmision: string;
  huellaAnterior: string | null;
  fechaHoraGeneracion: Date;
};
async function calcularHuellaAnulacion(i: InputHashAnulacion): Promise<{ huella: string; payload: string }> {
  const payload =
    'IDEmisorFacturaAnulada=' + i.nifEmisor +
    '&NumSerieFacturaAnulada=' + i.numeroFactura +
    '&FechaExpedicionFacturaAnulada=' + fmtFechaEsp(i.fechaEmision) +
    '&Huella=' + (i.huellaAnterior ?? '') +
    '&FechaHoraHusoGenRegistro=' + fmtFechaHoraUtc(i.fechaHoraGeneracion);
  return { huella: await sha256HexUpper(payload), payload };
}

// =============================================================================
// SISTEMA INFORMATICO (bloque AEAT)
// =============================================================================
type SistemaInformatico = {
  nombreRazon: string;
  nif: string;
  nombreSistemaInformatico: string;
  idSistemaInformatico: string;
  version: string;
  numeroInstalacion: string;
  tipoUsoPosibleSoloVerifactu: 'S' | 'N';
  tipoUsoPosibleMultiOT: 'S' | 'N';
  indicadorMultiplesOT: 'S' | 'N';
};

function getSistemaInformatico(emisor: { nombreRazon: string; nif: string }, bd: Record<string, string>): SistemaInformatico {
  return {
    nombreRazon:              bd.verifactu_productor_nombre?.trim() || emisor.nombreRazon,
    nif:                      bd.verifactu_productor_nif?.trim()    || emisor.nif,
    nombreSistemaInformatico: bd.verifactu_sistema_nombre?.trim()   || 'Automatizatelo Panel',
    idSistemaInformatico:     bd.verifactu_sistema_id?.trim()       || 'AT',
    version:                  bd.verifactu_version?.trim()          || '1.0',
    numeroInstalacion:        bd.verifactu_numero_instalacion?.trim()|| 'AT-01',
    tipoUsoPosibleSoloVerifactu: 'S',
    tipoUsoPosibleMultiOT: 'N',
    indicadorMultiplesOT: 'N',
  };
}

// =============================================================================
// XML BUILDER
// =============================================================================
const NS_SUM  = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd';
const NS_SUM1 = 'https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd';

type EncadenamientoAlta =
  | { primerRegistro: true }
  | { primerRegistro: false; anterior: { emisorNif: string; numero: string; fechaEmision: string; huella: string } };

function construirXmlAlta(input: {
  emisor: { nombreRazon: string; nif: string };
  factura: {
    numero: string;
    fechaEmision: string;
    tipoFacturaAeat: TipoFacturaAeat;
    cliente: { nombreRazon: string; nif: string | null };
    descripcionOperacion: string;
    baseImponible: number;
    ivaPorcentaje: number;
    ivaImporte: number;
    importeTotal: number;
  };
  encadenamiento: EncadenamientoAlta;
  sistemaInformatico: SistemaInformatico;
  fechaHoraGeneracion: Date;
  huella: string;
}): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const root = doc.ele(NS_SUM, 'sum:RegFactuSistemaFacturacion')
    .att('xmlns:sum', NS_SUM).att('xmlns:sum1', NS_SUM1);

  const cabecera = root.ele('sum:Cabecera');
  const obligado = cabecera.ele('sum1:ObligadoEmision');
  obligado.ele('sum1:NombreRazon').txt(input.emisor.nombreRazon);
  obligado.ele('sum1:NIF').txt(input.emisor.nif);

  const regFactura = root.ele('sum:RegistroFactura');
  const alta = regFactura.ele('sum1:RegistroAlta');
  alta.ele('sum1:IDVersion').txt('1.0');

  const idF = alta.ele('sum1:IDFactura');
  idF.ele('sum1:IDEmisorFactura').txt(input.emisor.nif);
  idF.ele('sum1:NumSerieFactura').txt(input.factura.numero);
  idF.ele('sum1:FechaExpedicionFactura').txt(fmtFechaEsp(input.factura.fechaEmision));

  alta.ele('sum1:NombreRazonEmisor').txt(input.emisor.nombreRazon);
  alta.ele('sum1:TipoFactura').txt(input.factura.tipoFacturaAeat);
  alta.ele('sum1:DescripcionOperacion').txt(input.factura.descripcionOperacion);

  if (input.factura.cliente.nif) {
    const dest = alta.ele('sum1:Destinatarios').ele('sum1:IDDestinatario');
    dest.ele('sum1:NombreRazon').txt(input.factura.cliente.nombreRazon);
    dest.ele('sum1:NIF').txt(input.factura.cliente.nif);
  }

  const des = alta.ele('sum1:Desglose').ele('sum1:DetalleDesglose');
  des.ele('sum1:Impuesto').txt('01');
  des.ele('sum1:ClaveRegimen').txt('01');
  des.ele('sum1:CalificacionOperacion').txt('S1');
  des.ele('sum1:TipoImpositivo').txt(fmtImporte(input.factura.ivaPorcentaje));
  des.ele('sum1:BaseImponibleOimporteNoSujeto').txt(fmtImporte(input.factura.baseImponible));
  des.ele('sum1:CuotaRepercutida').txt(fmtImporte(input.factura.ivaImporte));

  alta.ele('sum1:CuotaTotal').txt(fmtImporte(input.factura.ivaImporte));
  alta.ele('sum1:ImporteTotal').txt(fmtImporte(input.factura.importeTotal));

  const enc = alta.ele('sum1:Encadenamiento');
  if (input.encadenamiento.primerRegistro) {
    enc.ele('sum1:PrimerRegistro').txt('S');
  } else {
    const ant = enc.ele('sum1:RegistroAnterior');
    ant.ele('sum1:IDEmisorFactura').txt(input.encadenamiento.anterior.emisorNif);
    ant.ele('sum1:NumSerieFactura').txt(input.encadenamiento.anterior.numero);
    ant.ele('sum1:FechaExpedicionFactura').txt(fmtFechaEsp(input.encadenamiento.anterior.fechaEmision));
    ant.ele('sum1:Huella').txt(input.encadenamiento.anterior.huella);
  }

  const si = alta.ele('sum1:SistemaInformatico');
  si.ele('sum1:NombreRazon').txt(input.sistemaInformatico.nombreRazon);
  if (input.sistemaInformatico.nif) si.ele('sum1:NIF').txt(input.sistemaInformatico.nif);
  si.ele('sum1:NombreSistemaInformatico').txt(input.sistemaInformatico.nombreSistemaInformatico);
  si.ele('sum1:IdSistemaInformatico').txt(input.sistemaInformatico.idSistemaInformatico);
  si.ele('sum1:Version').txt(input.sistemaInformatico.version);
  si.ele('sum1:NumeroInstalacion').txt(input.sistemaInformatico.numeroInstalacion);
  si.ele('sum1:TipoUsoPosibleSoloVerifactu').txt(input.sistemaInformatico.tipoUsoPosibleSoloVerifactu);
  si.ele('sum1:TipoUsoPosibleMultiOT').txt(input.sistemaInformatico.tipoUsoPosibleMultiOT);
  si.ele('sum1:IndicadorMultiplesOT').txt(input.sistemaInformatico.indicadorMultiplesOT);

  alta.ele('sum1:FechaHoraHusoGenRegistro').txt(fmtFechaHoraUtc(input.fechaHoraGeneracion));
  alta.ele('sum1:TipoHuella').txt('01');
  alta.ele('sum1:Huella').txt(input.huella);

  return doc.end({ prettyPrint: true });
}

function construirXmlAnulacion(input: {
  emisor: { nombreRazon: string; nif: string };
  factura: { numero: string; fechaEmision: string };
  encadenamiento: EncadenamientoAlta;
  sistemaInformatico: SistemaInformatico;
  fechaHoraGeneracion: Date;
  huella: string;
}): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' });
  const root = doc.ele(NS_SUM, 'sum:RegFactuSistemaFacturacion')
    .att('xmlns:sum', NS_SUM).att('xmlns:sum1', NS_SUM1);

  const cabecera = root.ele('sum:Cabecera');
  const obligado = cabecera.ele('sum1:ObligadoEmision');
  obligado.ele('sum1:NombreRazon').txt(input.emisor.nombreRazon);
  obligado.ele('sum1:NIF').txt(input.emisor.nif);

  const regFactura = root.ele('sum:RegistroFactura');
  const anul = regFactura.ele('sum1:RegistroAnulacion');
  anul.ele('sum1:IDVersion').txt('1.0');

  const idF = anul.ele('sum1:IDFactura');
  idF.ele('sum1:IDEmisorFacturaAnulada').txt(input.emisor.nif);
  idF.ele('sum1:NumSerieFacturaAnulada').txt(input.factura.numero);
  idF.ele('sum1:FechaExpedicionFacturaAnulada').txt(fmtFechaEsp(input.factura.fechaEmision));

  const enc = anul.ele('sum1:Encadenamiento');
  if (input.encadenamiento.primerRegistro) {
    enc.ele('sum1:PrimerRegistro').txt('S');
  } else {
    const ant = enc.ele('sum1:RegistroAnterior');
    ant.ele('sum1:IDEmisorFactura').txt(input.encadenamiento.anterior.emisorNif);
    ant.ele('sum1:NumSerieFactura').txt(input.encadenamiento.anterior.numero);
    ant.ele('sum1:FechaExpedicionFactura').txt(fmtFechaEsp(input.encadenamiento.anterior.fechaEmision));
    ant.ele('sum1:Huella').txt(input.encadenamiento.anterior.huella);
  }

  const si = anul.ele('sum1:SistemaInformatico');
  si.ele('sum1:NombreRazon').txt(input.sistemaInformatico.nombreRazon);
  if (input.sistemaInformatico.nif) si.ele('sum1:NIF').txt(input.sistemaInformatico.nif);
  si.ele('sum1:NombreSistemaInformatico').txt(input.sistemaInformatico.nombreSistemaInformatico);
  si.ele('sum1:IdSistemaInformatico').txt(input.sistemaInformatico.idSistemaInformatico);
  si.ele('sum1:Version').txt(input.sistemaInformatico.version);
  si.ele('sum1:NumeroInstalacion').txt(input.sistemaInformatico.numeroInstalacion);
  si.ele('sum1:TipoUsoPosibleSoloVerifactu').txt(input.sistemaInformatico.tipoUsoPosibleSoloVerifactu);
  si.ele('sum1:TipoUsoPosibleMultiOT').txt(input.sistemaInformatico.tipoUsoPosibleMultiOT);
  si.ele('sum1:IndicadorMultiplesOT').txt(input.sistemaInformatico.indicadorMultiplesOT);

  anul.ele('sum1:FechaHoraHusoGenRegistro').txt(fmtFechaHoraUtc(input.fechaHoraGeneracion));
  anul.ele('sum1:TipoHuella').txt('01');
  anul.ele('sum1:Huella').txt(input.huella);

  return doc.end({ prettyPrint: true });
}

// =============================================================================
// QR URL VERIFICACIÓN (F2: propia. F4: AEAT real)
// =============================================================================
function urlVerificacion(facturaId: string, hashFactura: string, siteUrl: string): string {
  const base = (siteUrl || '').replace(/\/$/, '');
  const params = new URLSearchParams({ h: hashFactura.slice(0, 16) });
  return `${base}/verificar/${facturaId}?${params.toString()}`;
}

// =============================================================================
// HANDLER
// =============================================================================
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SITE_URL = Deno.env.get('SITE_URL') || Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://panel.automatizatelo.com';

    // 1. Validar JWT del usuario y rol admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonErr(401, 'Falta cabecera Authorization');

    const userClient = createClient(SUPABASE_URL, SERVICE_ROLE, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return jsonErr(401, 'No autenticado');

    const { data: profile } = await userClient
      .from('users')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();
    if (!profile || profile.role !== 'admin') return jsonErr(403, 'Solo admins');

    // 2. Body
    const body = await req.json();
    const facturaId: string | undefined = body.facturaId;
    const tipo: 'alta' | 'anulacion' = body.tipo === 'anulacion' ? 'anulacion' : 'alta';
    if (!facturaId) return jsonErr(400, 'Falta facturaId');

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    return tipo === 'alta'
      ? await registrarAlta(admin, facturaId, SITE_URL)
      : await registrarAnulacion(admin, facturaId);
  } catch (err) {
    console.error('verifactu-registrar fatal:', err);
    return jsonErr(500, (err as Error).message || 'Error interno');
  }
});

function jsonErr(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
function jsonOk(data: Record<string, unknown>) {
  return new Response(JSON.stringify({ ok: true, ...data }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// =============================================================================
// REGISTRAR ALTA
// =============================================================================
async function registrarAlta(admin: ReturnType<typeof createClient>, facturaId: string, siteUrl: string, intentos = 0): Promise<Response> {
  const { data: factura } = await admin
    .from('facturas')
    .select('id, numero, serie, fecha_emision, iva_importe, base_imponible, iva_porcentaje, total, cliente_nombre, cliente_nif, factura_rectificada_id, motivo_rectificacion, verifactu_alta_id')
    .eq('id', facturaId)
    .maybeSingle();
  if (!factura) return jsonErr(404, 'Factura no encontrada');
  if (factura.verifactu_alta_id) return jsonErr(409, 'La factura ya tiene un registro Veri*factu de alta');

  const { data: settings } = await admin.from('company_settings').select('*').eq('id', 1).maybeSingle();
  if (!settings?.emisor_nif) return jsonErr(400, 'Falta NIF del emisor en ajustes');
  if (!settings?.emisor_nombre) return jsonErr(400, 'Falta nombre del emisor en ajustes');

  const nifEmisor = validarIdFiscal(settings.emisor_nif);
  if (!nifEmisor.valido) return jsonErr(400, `NIF del emisor inválido: ${nifEmisor.error}`);

  let nifClienteNorm: string | null = null;
  if (factura.cliente_nif) {
    const nc = validarIdFiscal(factura.cliente_nif);
    if (!nc.valido) return jsonErr(400, `NIF del cliente inválido: ${nc.error}`);
    nifClienteNorm = nc.normalizado;
  }

  // Concepto desde factura_lineas
  const { data: lineas } = await admin
    .from('factura_lineas')
    .select('concepto, orden')
    .eq('factura_id', facturaId)
    .order('orden', { ascending: true });
  const descripcion = (lineas ?? []).map((l: any) => l.concepto).filter(Boolean).join(' · ').slice(0, 500) || 'Prestación de servicios';

  // Último registro de la cadena
  const { data: anteriorRow } = await admin
    .from('verifactu_registros')
    .select('huella, nif_emisor, numero_factura, fecha_emision')
    .order('num_registro', { ascending: false })
    .limit(1)
    .maybeSingle();
  const anterior = anteriorRow as { huella: string; nif_emisor: string; numero_factura: string; fecha_emision: string } | null;

  const fechaHoraGeneracion = new Date();
  const tipoFacturaAeat = tipoFacturaAeatDeSerie(factura.serie);
  const cuotaTotal = Number(factura.iva_importe);
  const importeTotal = +(Number(factura.base_imponible) + Number(factura.iva_importe)).toFixed(2);

  const { huella } = await calcularHuellaAlta({
    nifEmisor: nifEmisor.normalizado,
    numeroFactura: factura.numero,
    fechaEmision: factura.fecha_emision,
    tipoFacturaAeat,
    cuotaTotal,
    importeTotal,
    huellaAnterior: anterior?.huella ?? null,
    fechaHoraGeneracion,
  });

  const encadenamiento: EncadenamientoAlta = anterior
    ? { primerRegistro: false, anterior: { emisorNif: anterior.nif_emisor, numero: anterior.numero_factura, fechaEmision: anterior.fecha_emision, huella: anterior.huella } }
    : { primerRegistro: true };

  const xmlPayload = construirXmlAlta({
    emisor: { nombreRazon: settings.emisor_nombre, nif: nifEmisor.normalizado },
    factura: {
      numero: factura.numero,
      fechaEmision: factura.fecha_emision,
      tipoFacturaAeat,
      cliente: { nombreRazon: factura.cliente_nombre, nif: nifClienteNorm },
      descripcionOperacion: descripcion,
      baseImponible: Number(factura.base_imponible),
      ivaPorcentaje: Number(factura.iva_porcentaje),
      ivaImporte: cuotaTotal,
      importeTotal,
    },
    encadenamiento,
    sistemaInformatico: getSistemaInformatico({ nombreRazon: settings.emisor_nombre, nif: nifEmisor.normalizado }, settings),
    fechaHoraGeneracion,
    huella,
  });

  const { data: registro, error } = await admin
    .from('verifactu_registros')
    .insert({
      factura_id: facturaId,
      tipo: 'alta',
      huella,
      huella_anterior: anterior?.huella ?? null,
      hash_factura: huella,
      nif_emisor: nifEmisor.normalizado,
      numero_factura: factura.numero,
      fecha_emision: factura.fecha_emision,
      tipo_factura_aeat: tipoFacturaAeat,
      cuota_total: cuotaTotal,
      importe_total: importeTotal,
      fecha_hora_generacion: fechaHoraGeneracion.toISOString(),
      xml_payload: xmlPayload,
    })
    .select('id')
    .single();

  if (error || !registro) {
    if (intentos < 3 && (error as any)?.code === '23505') {
      return registrarAlta(admin, facturaId, siteUrl, intentos + 1);
    }
    return jsonErr(500, error?.message || 'No se pudo crear el registro Verifactu');
  }

  const qrUrl = urlVerificacion(facturaId, huella, siteUrl);
  await admin.from('facturas').update({ verifactu_alta_id: registro.id, qr_url: qrUrl }).eq('id', facturaId);

  return jsonOk({ tipo: 'alta', registroId: registro.id, huella, qrUrl });
}

// =============================================================================
// REGISTRAR ANULACION
// =============================================================================
async function registrarAnulacion(admin: ReturnType<typeof createClient>, facturaId: string, intentos = 0): Promise<Response> {
  const { data: factura } = await admin
    .from('facturas')
    .select('id, numero, serie, fecha_emision, iva_importe, base_imponible, verifactu_anulacion_id')
    .eq('id', facturaId)
    .maybeSingle();
  if (!factura) return jsonErr(404, 'Factura no encontrada');
  if (factura.verifactu_anulacion_id) return jsonErr(409, 'La factura ya tiene un registro Veri*factu de anulación');

  const { data: settings } = await admin.from('company_settings').select('*').eq('id', 1).maybeSingle();
  if (!settings?.emisor_nif) return jsonErr(400, 'Falta NIF del emisor');

  const nifEmisor = validarIdFiscal(settings.emisor_nif);
  if (!nifEmisor.valido) return jsonErr(400, `NIF del emisor inválido: ${nifEmisor.error}`);

  const { data: anteriorRow } = await admin
    .from('verifactu_registros')
    .select('huella, nif_emisor, numero_factura, fecha_emision')
    .order('num_registro', { ascending: false })
    .limit(1)
    .maybeSingle();
  const anterior = anteriorRow as { huella: string; nif_emisor: string; numero_factura: string; fecha_emision: string } | null;

  const fechaHoraGeneracion = new Date();
  const { huella } = await calcularHuellaAnulacion({
    nifEmisor: nifEmisor.normalizado,
    numeroFactura: factura.numero,
    fechaEmision: factura.fecha_emision,
    huellaAnterior: anterior?.huella ?? null,
    fechaHoraGeneracion,
  });

  const encadenamiento: EncadenamientoAlta = anterior
    ? { primerRegistro: false, anterior: { emisorNif: anterior.nif_emisor, numero: anterior.numero_factura, fechaEmision: anterior.fecha_emision, huella: anterior.huella } }
    : { primerRegistro: true };

  const tipoFacturaAeat = tipoFacturaAeatDeSerie(factura.serie);
  const xmlPayload = construirXmlAnulacion({
    emisor: { nombreRazon: settings.emisor_nombre, nif: nifEmisor.normalizado },
    factura: { numero: factura.numero, fechaEmision: factura.fecha_emision },
    encadenamiento,
    sistemaInformatico: getSistemaInformatico({ nombreRazon: settings.emisor_nombre, nif: nifEmisor.normalizado }, settings),
    fechaHoraGeneracion,
    huella,
  });

  const { data: registro, error } = await admin
    .from('verifactu_registros')
    .insert({
      factura_id: facturaId,
      tipo: 'anulacion',
      huella,
      huella_anterior: anterior?.huella ?? null,
      hash_factura: huella,
      nif_emisor: nifEmisor.normalizado,
      numero_factura: factura.numero,
      fecha_emision: factura.fecha_emision,
      tipo_factura_aeat: tipoFacturaAeat,
      cuota_total: Number(factura.iva_importe),
      importe_total: +(Number(factura.base_imponible) + Number(factura.iva_importe)).toFixed(2),
      fecha_hora_generacion: fechaHoraGeneracion.toISOString(),
      xml_payload: xmlPayload,
    })
    .select('id')
    .single();

  if (error || !registro) {
    if (intentos < 3 && (error as any)?.code === '23505') {
      return registrarAnulacion(admin, facturaId, intentos + 1);
    }
    return jsonErr(500, error?.message || 'No se pudo crear el registro de anulación');
  }

  await admin.from('facturas').update({ verifactu_anulacion_id: registro.id, estado: 'anulada' }).eq('id', facturaId);

  return jsonOk({ tipo: 'anulacion', registroId: registro.id, huella });
}
