# Auditoría del panel de Automatízatelo

Fecha: agosto de 2026 · Comparado con el panel de Jennifer Cervera (Next.js)

---

## Resumen en una página

El panel **funciona** y tiene piezas que muchos paneles comerciales no tienen: una
facturación fiscalmente seria con Veri\*factu, encadenamiento de huellas y facturas
inmutables. Eso no es poca cosa y no hay que tocarlo.

El problema no es lo que hace, es **sobre qué está construido**:

1. Cualquier usuario registrado puede convertirse en administrador. Una línea de RLS.
2. El esquema del repositorio **no se puede aplicar**: `facturas` apunta a una tabla
   `clients` que nadie crea. La base de datos real y el repositorio han divergido.
3. Hay **dos sistemas de facturación** conviviendo: el fiscal y uno de juguete.
4. Los proyectos no están unidos a los clientes: `projects.client` es texto libre.
5. **Las formaciones no existen** — la línea de negocio con la que hoy sale a vender.

Y transversalmente: 10.423 líneas repartidas en 16 páginas y 4 componentes. Una sola
página, `ProjectDetail.jsx`, tiene 2.259 líneas.

Nada de esto es grave *todavía* porque no está en producción. Es exactamente el
momento de arreglarlo.

---

## 1. Lo que está bien y hay que conservar

| Pieza | Por qué |
|---|---|
| `facturas` + `factura_lineas` + `verifactu_registros` | Numeración fiscal correlativa, snapshot del cliente congelado, encadenamiento SHA-256, facturas inmutables. Es la parte mejor pensada del proyecto. |
| Edge Function `verifactu-registrar` | Valida NIF, linealiza con índice único, reintenta ante colisión. Buen patrón. |
| `AuthContext` con `profileLoading` separado de `loading` | Evita el clásico «Acceso Denegado» falso mientras carga el perfil. |
| Conversión lead → cliente en `Leads.jsx` | El embudo tiene salida. Falta rematarlo (ver §4). |
| Tema claro/oscuro con variables CSS | Consistente en todo el panel. |

---

## 2. Bloqueantes de seguridad

### 2.1 Escalada de privilegios — cualquiera puede hacerse admin

`supabase/schema.sql:206`

```sql
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE TO authenticated USING (auth.uid() = id);
```

No hay `WITH CHECK`. En Postgres, un `UPDATE` sin `WITH CHECK` hereda el `USING`
para la fila resultante, pero **no restringe qué columnas se cambian**. Un usuario
con rol `user` puede ejecutar:

```sql
update users set role = 'admin' where id = auth.uid();
```

y pasa el filtro. A partir de ahí ve toda la facturación, todos los leads y todos
los clientes.

Se agrava con `schema.sql:202`:

```sql
CREATE POLICY "users_insert_authenticated" ON public.users
  FOR INSERT TO authenticated WITH CHECK (true);
```

Cualquier autenticado puede insertar filas arbitrarias en `users`.

**Arreglo**: quitar `role` del alcance del usuario (columna gestionada solo por
service_role o por una policy con `WITH CHECK` que compare contra el valor previo),
e `INSERT` solo vía trigger sobre `auth.users`.

### 2.2 Las políticas dicen «admin» y no filtran nada

Doce tablas tienen este patrón:

```sql
CREATE POLICY "invoices_all"  ON public.project_invoices FOR ALL TO authenticated USING (true);
CREATE POLICY "files_all_admin" ON public.project_files  FOR ALL TO authenticated USING (true);
```

El nombre promete restricción, el predicado es `true`. Afecta a `project_members`,
`project_milestones`, `project_tasks`, `project_files`, `project_services`,
`project_budgets`, `project_budget_lines`, `project_invoices`, `project_payments`,
`service_segmentation`, `funnel_flows` y `task_*`.

Solo `projects` y `services` tienen filtros reales — y `projects` los pierde igualmente
porque `projects_insert_authenticated` es `WITH CHECK (true)`.

**Consecuencia práctica**: el rol `user` del panel no existe de facto. O eres admin,
o eres admin sin saberlo.

### 2.3 Sin registro de auditoría

Jennifer tiene `audit_logs` + `lib/audit/log-action.ts`, y lo llama en cada acción
sensible. Aquí no hay nada. En un panel que emite facturas con validez fiscal y
guarda datos personales de leads, no poder responder «quién anuló esta factura y
cuándo» es un problema, no un detalle.

---

## 3. El repositorio ya no describe la base de datos

### 3.1 La tabla `clients` no se crea en ningún sitio

`migrations/001_facturacion.sql:132` hace:

```sql
client_id uuid not null references public.clients(id) on delete restrict,
```

Pero `public.clients` no se crea ni en `schema.sql`, ni en ninguna migración, ni en
`supabase_tasks.sql`. Existe solo en la base de datos real, creada a mano. **La
migración 001 fallaría en una base de datos limpia.**

### 3.2 Faltan piezas y sobra un fichero suelto

- Las migraciones van `001, 003, 004, 005, 006`. **No hay `002`.**
- Todo se aplica pegándolo en el SQL Editor, sin CLI. Eso es una decisión legítima,
  pero significa que **nada obliga** a que el fichero exista antes que el cambio:
  la única red es la disciplina.
- `supabase_tasks.sql` está en la raíz con la cabecera *«Ejecutar en el SQL Editor
  de Supabase»*, y referencia `profiles(id)` — una tabla que tampoco existe (aquí
  se llama `users`). Es deriva de esquema institucionalizada.

**Consecuencia**: hoy no puedes levantar un entorno nuevo, ni hacer una copia de
seguridad reproducible, ni saber con certeza qué hay en producción cuando llegue.

---

## 4. Duplicaciones y modelado

### 4.1 Dos facturadores

| | `project_invoices` + `project_budgets` | `facturas` + `factura_lineas` |
|---|---|---|
| Líneas | `jsonb` sin estructura | Tabla real con FK |
| Numeración | `invoice_number text` libre | Serie + año + correlativo, único |
| Snapshot del cliente | No | Sí, congelado para AEAT |
| Inmutabilidad | No | Sí (migración 003) |
| Veri\*factu | No | Sí |
| Cliente | Ninguno | FK obligatoria |

El primero es de la primera versión del panel.

> **Corrección (agosto 2026), tras ver el esquema real.** `project_invoices` ya no
> existe en Supabase: se retiró al pasar a `facturas`, y las columnas `invoice_id`
> de `project_services`, `project_budget_lines` y `project_payments` ya apuntan a
> `facturas`. Queda documentado en la migración 009.
>
> Y me equivoqué con `project_budgets`: **no es un duplicado**. Es el presupuesto
> *emitido*, con sus líneas congeladas en `line_items` — el mismo patrón de
> snapshot que usa `facturas` con los datos del cliente. Las líneas vivas del
> proyecto son `project_services` (del catálogo) y `project_budget_lines`
> (manuales). El diseño es correcto y se queda.

### 4.2 Los proyectos no conocen a sus clientes

```sql
CREATE TABLE public.projects (
    name    text NOT NULL,
    client  text NOT NULL,     -- ← texto libre
    ...
);
```

Mientras tanto `facturas.client_id` es una FK real. Es decir: puedes facturar a
«Serincosol S.L.» un proyecto cuyo campo `client` dice «serincosol» y nada lo
detecta. No puedes abrir un cliente y ver sus proyectos. No puedes sumar lo
facturado por cliente sin cruzar cadenas de texto.

### 4.3 Tablas 1:1 innecesarias

`service_segmentation` y `funnel_flows` tienen exactamente una fila por lead — las
crea el formulario de la web. Son columnas disfrazadas de tablas: obligan a tres
inserciones y tres `join` para leer un lead completo. Con RLS que permite `INSERT`
a `anon`, además.

### 4.4 Nombres en dos idiomas

`leads.first_name`, `projects.name`, `services.price` conviven con
`facturas.cliente_nombre`, `factura_lineas.base_imponible`, `company_settings.emisor_nif`.
Cada consulta obliga a recordar en qué idioma se bautizó esa tabla.

---

## 5. Lo que falta para el negocio de hoy

El posicionamiento actual son tres líneas: **Formar, Cumplir, Automatizar**. El panel
solo sabe de la tercera.

### 5.1 Las formaciones no existen

No hay tabla, ni página, ni participantes, ni certificados. Y precisamente lo que
vende del Art. 4 del AI Act es **la evidencia documental**: certificado nominal por
participante, registro formativo fechado, material entregado.

Hoy eso saldría de un Word. El panel debería emitirlo, guardarlo y poder
reexpedirlo tres años después cuando alguien lo pida.

### 5.2 Sin agenda de citas

Toda la web promete «30 minutos gratis» y el panel no sabe qué es una cita. Jennifer
tiene `citas` + `AgendarCitaModal` + `CitasHistorial`. El `Calendar.jsx` de aquí solo
pinta hitos de proyecto.

### 5.3 Sin nada de RGPD

Jennifer tiene retención automática, RAT firmado, textos de consentimiento
versionados, confirmación de consentimiento y un panel de cumplimiento (migraciones
002, 015, 016, 017, 018). Aquí se guardan datos personales de leads sin política de
retención ni registro de consentimiento más allá de un booleano.

Vender cumplimiento normativo desde un panel que no cumple es un flanco innecesario.

### 5.4 Enlace muerto en el menú

`Sidebar.jsx` — el icono «Documentos» no tiene `to`, así que apunta a `#`. Lleva
tiempo ahí ocupando sitio.

---

## 6. Arquitectura del código

| | Jennifer | Automatízatelo |
|---|---|---|
| Organización | `features/<dominio>/{components,hooks,services}` + `shared/` | 16 páginas planas + 4 componentes |
| Tipos | TypeScript + `database.ts` generado de Supabase | JavaScript sin tipos |
| Página más grande | Repartida en componentes | `ProjectDetail.jsx` — **2.259 líneas** |
| Capa de datos | `actions/` y `services/` separados de la vista | `supabase.from(...)` dentro del JSX |
| Bundle | Next.js con split por ruta | **1,59 MB en un chunk** (457 kB gzip) |
| Lint / tests | `next lint` | Ninguno |

Las cuatro páginas más grandes suman 5.377 líneas — más de la mitad del panel.
Cada una repite su propio patrón de carga, su propio modal, su propia tabla.
`DataTable.jsx` existe pero no lo usan todas.

---

## 7. El panel ideal

### 7.1 Modelo de datos objetivo

Nomenclatura unificada en castellano, un solo idioma:

```
clientes            ← renombrar `clients`; persona o empresa, con datos fiscales
leads               ← + columnas de service_segmentation y funnel_flows fusionadas
                      + cliente_id cuando se convierte

proyectos           ← renombrar `projects`; cliente_id FK NOT NULL (adiós al texto)
proyecto_hitos
proyecto_archivos
proyecto_miembros

formaciones         ← NUEVA: cliente_id, título, línea, modalidad, fechas, precio
formacion_sesiones  ← NUEVA: cada sesión impartida, con horas
formacion_alumnos   ← NUEVA: nombre, email, DNI, asistencia, certificado
                      Esto ES el registro formativo del Art. 4

servicios           ← + columna `linea`: 'formar' | 'cumplir' | 'automatizar'

tareas              ← renombrar `project_tasks`; proyecto_id O formacion_id
tarea_subtareas
tarea_comentarios

presupuestos        ← NUEVA con líneas reales; sustituye a project_budgets (jsonb)
presupuesto_lineas
facturas            ← se queda como está; + formacion_id además de proyecto_id
factura_lineas
verifactu_registros

citas               ← NUEVA: los 30 minutos, con lead_id o cliente_id
audit_logs          ← NUEVA: quién, qué, cuándo, sobre qué recurso
email_settings / email_plantillas / email_envios   ← ya hechas

BORRAR: project_invoices, project_budgets, project_budget_lines,
        project_payments, service_segmentation, funnel_flows,
        supabase_tasks.sql
```

### 7.2 Navegación objetivo

De 10 iconos sueltos + un submenú a 8 destinos con jerarquía real:

| # | Sección | Contiene |
|---|---|---|
| 1 | **Inicio** | Cifras del mes, leads sin contestar, facturas vencidas, próxima cita |
| 2 | **Leads** | Embudo por estado, conversión a cliente |
| 3 | **Clientes** | Ficha con sus proyectos, formaciones, facturas y citas en un sitio |
| 4 | **Proyectos** | Tablero, hitos, tareas, archivos |
| 5 | **Formaciones** | Convocatorias, alumnos, certificados, registro Art. 4 |
| 6 | **Facturación** | Facturas · Presupuestos · Veri\*factu (hoy Veri\*factu es un icono suelto) |
| 7 | **Agenda** | Tareas · Calendario · Citas (hoy son dos iconos separados) |
| 8 | **Contenidos** | Blog · Recursos |
| ⚙ | **Configuración** | Equipo · Catálogo · Emisor · Correo · Cumplimiento |

### 7.3 Arquitectura del front

Copiar el patrón de Jennifer, adaptado a Vite:

```
src/
  features/
    leads/       { components/, hooks/, services/ }
    clientes/
    proyectos/
    formaciones/
    facturacion/
    agenda/
    ajustes/
  shared/
    components/  DataTable, CustomSelect, Modal, SortHeader, EstadoBadge…
    hooks/       useSortable, useUrlState, useSupabaseQuery
    lib/
  lib/supabase.js
```

Más: TypeScript con tipos generados (`supabase gen types`), `React.lazy` por ruta
para partir el bundle, y ESLint en `npm run lint`.

---

## 8. Plan por fases

| Fase | Qué | Riesgo | Esfuerzo |
|---|---|---|---|
| ~~**0**~~ ✅ | Cerrar la escalada de privilegios. Arreglar las políticas mentirosas. Quitar el enlace muerto. → `migrations/008_seguridad_rls.sql` | Nulo | Hecho |
| **1** 🟡 | Reconstruir el esquema como migraciones aplicables. Hecho salvo verificar la parte reconstruida por inferencia (tres consultas de radiografía). → `docs/BASE-DE-DATOS.md` | Bajo | Casi |
| ~~**2**~~ ✅ | Modelo: PK en `project_services`, `projects.client_id` de verdad, fusión de las tablas 1:1 en `leads`, desambiguación de `users`. → migraciones 010-013 | Medio — tocó la web también | Hecho |
| ~~**3**~~ ✅ | **Formaciones**: tablas, página, sesiones, alumnos, certificados en PDF con código de verificación y facturación desde la ficha. → migración 014 y `features/formaciones/` | Bajo (todo nuevo) | Hecho |
| **5** 🟡 | **Citas hechas** (migración 015): tabla, modal de agendar desde Leads, pestaña en la ficha del cliente, eventos en el calendario y próximas citas en el inicio. Quedan `audit_logs` y RGPD (retención, consentimientos, RAT). | Bajo | A medias |
| **4** | Reorganizar el front en `features/`, partir `ProjectDetail.jsx`, code splitting, TypeScript, fundir `CustomSelect` con `CustomDropdown`. Y aquí el renombrado general a castellano. | Medio, mecánico | 2-3 días |

El orden importa: la fase 1 antes que la 2 porque sin migraciones aplicables no se
puede renombrar nada con seguridad. Y la fase 3 puede adelantarse si hace falta
vender formaciones antes de tener el resto ordenado — es la única que no depende de
las anteriores.

> **Nota sobre el renombrado a castellano.** En la fase 2 se pospuso a la fase 4,
> a propósito: renombrar tablas obliga a tocar las 16 páginas enteras, y en la
> fase 4 hay que reorganizarlas igualmente en `features/`. Hacerlo dos veces es
> trabajo doble y dos ocasiones de romper algo.
>
> La excepción fue `users`, que sí se renombró en la 013 — pero eso no era
> cosmética: `first_name` guardaba el **primer apellido**, y cuatro pantallas
> mostraban al equipo por sus apellidos sin el nombre.
