# Veri\*factu: dónde está el panel y qué le falta

Agosto de 2026. El RRSIF (RD 1007/2023 + Orden HAC/1177/2024) obliga a los
autónomos desde el **1 de julio de 2026** a facturar con un sistema que cumpla
uno de dos modos. Este documento dice, sin adornos, en cuál está el panel: **en
ninguno de los dos todavía.** Tiene la base común muy avanzada y le falta la
pieza final de cada camino.

## Lo que YA cumple (la base común a ambos modos)

| Requisito | Estado | Dónde |
|---|---|---|
| Registro de facturación por cada factura | ✓ | `verifactu_registros`, generado por la Edge Function al emitir |
| Huella SHA-256 encadenada (Anexo I de la Orden) | ✓ | `huella` + `huella_anterior`, con índice único que impide bifurcar la cadena |
| Registro de anulación | ✓ | Mismo circuito, tipo `anulacion` |
| XML en esquema AEAT (SuministroLR) | ✓ | Guardado en `xml_payload`, listo para remitir |
| Inmutabilidad de facturas emitidas | ✓ | Triggers de la migración 003: los 17 campos fiscales bloqueados |
| Numeración correlativa por serie y año | ✓ | RPC `next_numero_factura` |
| QR en la factura | ✓ | `qr_url` (verificación propia mientras no haya remisión) |
| Datos del sistema informático (nombre, versión, instalación) | ✓ | `company_settings.verifactu_*` |

## Lo que falta según el modo que se elija

### Común a los dos modos

- **Registro de eventos del sistema** — el RRSIF exige que el propio software
  lleve un diario de eventos (arranques, exportaciones, anomalías, cambios de
  configuración) también encadenado. No existe: haría falta una tabla
  `verifactu_eventos` y que la Edge Function los registre.
- **Declaración responsable del productor** — como el software es propio, Manel
  es también el productor del SIF y debe emitir la declaración responsable de
  que cumple. Los datos para rellenarla ya están en Ajustes del emisor; el
  documento en sí no está redactado.

### Camino A — Modo VERI\*FACTU (remisión a la AEAT)

- **Enviar cada registro a la AEAT** en el momento de expedición, con
  certificado digital, contra su servicio web. El XML ya está construido; falta
  el transporte. `estado_envio` ya contempla el ciclo
  (`pendiente → enviado → aceptado/rechazado`).
- A cambio, este modo **no exige firmar electrónicamente los registros**: la
  remisión sustituye a la firma. Y la factura puede lucir la leyenda «Factura
  verificable en la sede electrónica de la AEAT».

### Camino B — Modo no VERI\*FACTU (conservación local)

- **Firma electrónica de cada registro** (facturación y eventos) en el momento
  de generarse. Firmar XAdES dentro de una Edge Function con el certificado como
  secreto es posible pero delicado.
- Conservación, y **capacidad de volcado** completo cuando la AEAT lo requiera.

## Recomendación

**Apuntar al modo VERI\*FACTU (camino A).** Motivos: la pieza que falta es una —
el transporte —, evita el berenjenal de firmar cada registro, es el modo que la
AEAT favorece, y el QR verificable en sede es un sello de seriedad delante del
cliente. Lo que hace falta para construirlo:

1. Certificado digital de Manel (FNMT de autónomo) exportado y guardado como
   secreto de la Edge Function.
2. Una acción nueva en `verifactu-registrar` (o función aparte) que tome los
   registros `pendiente` y los remita al endpoint de la AEAT, actualizando
   `estado_envio`, `csv_aeat` y `respuesta_aeat`.
3. Reintentos y la pantalla de Veri\*factu ya existente como monitor.

Mientras tanto: el panel **no debe ser el sistema de facturación real** — cada
factura de verdad conviene emitirla con un medio que ya cumpla, hasta cerrar
esto. Los registros que el panel genera ahora no se pierden: la cadena de
huellas es válida y la remisión posterior está contemplada por la norma para los
registros pendientes.
