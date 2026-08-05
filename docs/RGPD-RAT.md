# Registro de Actividades de Tratamiento (RAT)

**Responsable del tratamiento:** Manel Méndez González (Automatízatelo)
· NIF y domicilio: los de Ajustes del emisor
· Contacto: serincosol@gmail.com
· Delegado de Protección de Datos: no exigible (art. 37 RGPD; sin tratamiento a gran escala)

Documento exigido por el **art. 30 RGPD**. Describe los tratamientos que realiza
el panel de gestión tal como está construido — los plazos de conservación no son
declaraciones de intenciones: **los ejecuta la migración 018 cada noche**.

Revisión: agosto de 2026. Revisar al añadir cualquier tratamiento nuevo.

---

## T1 · Captación y gestión de leads

| | |
|---|---|
| **Finalidad** | Atender solicitudes de contacto de la web y gestionar el ciclo comercial |
| **Base jurídica** | Consentimiento (art. 6.1.a) — casilla de privacidad del formulario, guardada en `privacy_accepted`; medidas precontractuales (art. 6.1.b) al avanzar el ciclo |
| **Interesados** | Personas que rellenan el formulario de automatizatelo.com o se dan de alta a mano |
| **Categorías de datos** | Identificativos (nombre, apellidos), contacto (email, teléfono), profesionales (empresa, sector, tamaño), técnicos (IP, tipo de dispositivo — 90 días), mensaje libre |
| **Destinatarios** | Ninguno externo. Aviso interno por WhatsApp (n8n) con datos mínimos |
| **Transferencias internacionales** | Alojamiento en Supabase (ver Encargados) |
| **Conservación** | IP y dispositivo: **90 días**. Lead perdido sin interacción: **2 años → anonimización automática**. Derecho de supresión: función `forget_lead_by_email` desde el panel, con anonimización en lugar de borrado si hay facturación que conservar (art. 17.3.b) |
| **Medidas** | RLS solo-admin, cifrado en tránsito (TLS) y en reposo (Supabase), registro de auditoría del ejercicio de derechos |

## T2 · Clientes y facturación

| | |
|---|---|
| **Finalidad** | Ejecución del contrato, emisión de facturas y cumplimiento fiscal (Veri\*factu, RD 1007/2023) |
| **Base jurídica** | Contrato (art. 6.1.b) y obligación legal (art. 6.1.c — normativa tributaria) |
| **Interesados** | Clientes y sus personas de contacto |
| **Categorías de datos** | Identificativos, NIF, domicilio de facturación, email, datos económicos (importes, cobros, forma de pago) |
| **Destinatarios** | **AEAT** (registros de facturación cuando se complete el modo VERI\*FACTU); asesoría fiscal si la hubiera |
| **Conservación** | Facturas y registros: **los plazos fiscales** (mínimo 4 años, recomendado 6 por el Código de Comercio). Las facturas son inmutables por diseño (triggers de la migración 003) y no se borran: se anulan |
| **Medidas** | Inmutabilidad de campos fiscales por trigger, cadena de huellas SHA-256, RLS solo-admin, auditoría de emisión/cobro/anulación |

## T3 · Alumnos de formaciones (Art. 4 del Reglamento de IA)

| | |
|---|---|
| **Finalidad** | Acreditar la formación impartida: registro formativo y certificados nominales con código de verificación |
| **Base jurídica** | Ejecución del contrato con el cliente (art. 6.1.b) e interés legítimo del cliente en documentar el cumplimiento del art. 4 del Reglamento (UE) 2024/1689 (art. 6.1.f) |
| **Interesados** | Empleados de los clientes que asisten a las formaciones |
| **Categorías de datos** | Nombre, apellidos, email, cargo, asistencia y aprovechamiento. **DNI solo si el cliente lo exige** (opcional por diseño) |
| **Destinatarios** | El cliente (empleador), que recibe los certificados |
| **Conservación** | Mientras el certificado deba poder reexpedirse y acreditarse: **6 años** desde la emisión (alineado con la vida útil de la evidencia del art. 4) |
| **Medidas** | Certificados en bucket **privado** con URL firmada de caducidad corta; RLS solo-admin; emisión auditada |

## T4 · Citas y agenda

| | |
|---|---|
| **Finalidad** | Gestionar las reuniones de diagnóstico y seguimiento |
| **Base jurídica** | Medidas precontractuales / contrato (art. 6.1.b) |
| **Categorías de datos** | Nombre, email, fecha y hora, enlace de videollamada, notas y resultado |
| **Conservación** | Las citas de leads caen con el lead (borrado en cascada al ejercer supresión); las notas se anonimizan si hay retención fiscal |

## T5 · Comunicaciones por correo

| | |
|---|---|
| **Finalidad** | Correo de bienvenida a leads y envío de documentos (presupuestos, facturas) |
| **Base jurídica** | La del tratamiento al que sirve (T1 o T2) |
| **Categorías de datos** | Destinatario, asunto y cuerpo HTML de cada envío |
| **Destinatarios** | Proveedor SMTP propio (ver Encargados) |
| **Conservación** | El asiento del envío se conserva; **el cuerpo HTML se vacía al año** (automático) |
| **Medidas** | Credenciales SMTP cifradas AES-256-GCM con clave solo en la Edge Function |

## T6 · Equipo del panel

| | |
|---|---|
| **Finalidad** | Gestión de acceso y asignación de trabajo |
| **Base jurídica** | Contrato / relación con el colaborador (art. 6.1.b) |
| **Categorías de datos** | Identificativos, contacto, rol, actividad (registro de auditoría) |
| **Conservación** | Mientras dure la relación; el registro de auditoría, según T7 |
| **Medidas** | El rol no es autoasignable (trigger), MFA pendiente de activar |

## T7 · Registro de auditoría

| | |
|---|---|
| **Finalidad** | Trazabilidad de las acciones sensibles (facturación, cobros, certificados, ejercicio de derechos) — interés legítimo (art. 6.1.f) y soporte de obligaciones legales |
| **Categorías de datos** | Usuario, acción, recurso afectado, fecha |
| **Conservación** | 6 años (alineado con los plazos fiscales a los que da soporte) |
| **Medidas** | Solo escritura por función con el usuario de la sesión; solo lectura por admin; sin UPDATE ni DELETE desde el panel |

---

## Encargados del tratamiento (art. 28)

| Encargado | Servicio | Datos que trata | Garantías |
|---|---|---|---|
| **Supabase** | Base de datos, almacenamiento, Edge Functions | Todos los del panel | DPA de Supabase; verificar región del proyecto y, si es fuera de la UE, las SCC del DPA |
| **Vercel** | Alojamiento del panel y de la web | Tránsito (no almacena datos de negocio) | DPA de Vercel; SCC |
| **Proveedor SMTP** | Envío de correo | Destinatarios y contenido de los envíos | Rellenar cuando el SMTP esté configurado: proveedor, región y DPA |
| **n8n (autoalojado)** | Aviso interno de leads por WhatsApp | Datos mínimos del lead | Servidor propio: es infraestructura del responsable, no encargado externo. Meta (WhatsApp) recibe el contenido del aviso |

> **Pendiente al configurar el SMTP:** anotar aquí el proveedor y comprobar su DPA.
> **Pendiente:** confirmar la región del proyecto de Supabase y anotarla.

## Derechos de los interesados

Acceso, rectificación, supresión, oposición, limitación y portabilidad:
**serincosol@gmail.com**. La supresión de leads está implementada en el panel
(`forget_lead_by_email`) con previsualización del alcance, re-autenticación del
admin y anonimización cuando la facturación obliga a conservar. Autoridad de
control: AEPD (aepd.es).

## Violaciones de seguridad (art. 33)

Ante un incidente: contener y rotar credenciales (procedimiento en
`CREDENCIALES.md`), evaluar el riesgo para los interesados, y si lo hay,
notificar a la AEPD en **72 horas**. El registro de auditoría y `email_envios`
son las fuentes para reconstruir el alcance.

---

*Este RAT describe el sistema tal como está construido a agosto de 2026. Los
plazos de conservación de T1 y T5 los ejecuta automáticamente la migración 018
(función `aplicar_retencion`, cada noche a las 04:15).*
