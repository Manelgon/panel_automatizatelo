# La base de datos del panel

> **Sin CLI.** Todo se aplica desde el SQL Editor de Supabase. Este documento está
> escrito para ese flujo.

## La regla

**`supabase/migrations/` es la única verdad.** Cada cambio de esquema se escribe
primero como un fichero numerado en esa carpeta, y *después* se pega en el SQL
Editor. Nunca al revés.

Sin CLI no hay nada que impida saltarse ese orden — solo la disciplina. Y saltárselo
es exactamente lo que produjo el estado del que venimos:

- `supabase/schema.sql` con la cabecera *«Ejecutar este archivo en el SQL Editor»*.
- `supabase_tasks.sql` en la raíz, misma cabecera, referenciando una tabla
  `profiles` que en este proyecto no existe.
- Migraciones numeradas `001, 003, 004, 005, 006` — sin `002`.
- `001_facturacion.sql` haciendo `references public.clients(id)` sobre una tabla
  **que no se crea en ningún fichero del repositorio**.

Resultado: no se podía levantar un entorno nuevo ni reproducir una copia de
seguridad. Lo que hay en Supabase y lo que hay en el repositorio dejaron de ser
lo mismo, y nadie sabía en qué se diferenciaban.

---

## Lo que ya se ha arreglado

| Antes | Ahora |
|---|---|
| `supabase/schema.sql` | `migrations/000_baseline.sql` |
| `supabase_tasks.sql` (raíz, apuntando a `profiles`) | `migrations/002_tareas_subtareas_comentarios.sql`, apuntando a `users` |
| Hueco en el `002` | Ocupado |
| `clients` inexistente en el repo | Reconstruida al final del baseline |
| `projects.client_id` solo en la BD real | Reconstruida al final del baseline |

El orden queda así, y es aplicable de principio a fin sobre una base de datos vacía:

```
000_baseline.sql                      tablas núcleo + clients + projects.client_id
001_facturacion.sql                   clients ya existe → no falla
002_tareas_subtareas_comentarios.sql
003_facturas_inmutables.sql
004_verifactu_registros.sql
005_verifactu_sistema_informatico.sql
006_verifactu_hardening.sql
007_email.sql                         SMTP propio, sin n8n
008_seguridad_rls.sql                 cierra la escalada de privilegios
```

**De la 000 a la 006 ya están aplicadas** en la base de datos real (se pegaron a
mano en su día). Las que faltan por aplicar son la **007** y la **008**.

---

## Cómo aplicar una migración (sin CLI)

1. Abre el fichero de `supabase/migrations/`.
2. Cópialo entero.
3. Supabase → **SQL Editor** → New query → pegar → **Run**.
4. Si sale verde, hecho. Todas las migraciones de este proyecto son idempotentes
   (`create table if not exists`, `drop policy if exists`), así que ejecutarlas
   dos veces no rompe nada.

### La 008 tiene un paso previo obligatorio

Cierra el agujero por el que cualquier usuario registrado podía hacerse
administrador. Después de aplicarla **nadie puede ascenderse solo**, así que
comprueba primero que tú ya eres admin:

```sql
select email, role from public.users order by role;
```

Si tu fila no dice `admin`:

```sql
update public.users set role = 'admin' where email = 'serincosol@gmail.com';
```

(El SQL Editor corre como `service_role`, y el trigger de la 008 deja pasar a
`service_role` precisamente para esto. Es la puerta de emergencia si algún día no
queda ningún admin.)

Y luego ya sí, pegar la 008 entera.

#### Qué cambia para los usuarios que no son admin

| Sección | Antes | Después |
|---|---|---|
| Leads, clientes, facturación | Cualquier autenticado | Solo admin |
| Proyectos y sus tareas, hitos, archivos | Cualquier autenticado | Admin o miembro del proyecto |
| Tareas asignadas | — | Siempre visibles para quien las tiene asignadas |
| Su propio perfil | Editable, **rol incluido** | Editable, rol bloqueado |

Si alguien del equipo se queda sin ver algo que necesita, la respuesta correcta es
añadirlo a `project_members`, no aflojar la política.

---

## Lo que falta: verificar la reconstrucción

El bloque «RECONSTRUIDO POR INFERENCIA» del final de `000_baseline.sql` (la tabla
`clients` y la columna `projects.client_id`) está deducido **leyendo el código que
lo usa**, no volcado de la base de datos. Sirve para levantar un entorno nuevo,
pero no garantiza que coincida columna por columna con lo que hay en Supabase.

Con CLI esto se resolvería con `supabase db pull`. Sin CLI, el equivalente es
pedirle a la propia base de datos que se describa. Pega esto en el SQL Editor y
guarda el resultado:

```sql
-- RADIOGRAFÍA 1: tablas y columnas
select string_agg(linea, E'\n' order by linea) as esquema
from (
  select table_name || ' | ' || column_name || ' ' || data_type ||
         case when is_nullable = 'NO' then ' NOT NULL' else '' end ||
         coalesce(' default ' || column_default, '') as linea
    from information_schema.columns
   where table_schema = 'public'
) t;
```

```sql
-- RADIOGRAFÍA 2: políticas RLS activas
select string_agg(
         tablename || ' | ' || policyname || ' | ' || cmd || ' | ' || coalesce(qual, '-'),
         E'\n' order by tablename, policyname
       ) as politicas
  from pg_policies
 where schemaname = 'public';
```

```sql
-- RADIOGRAFÍA 3: claves foráneas (para confirmar los vínculos entre tablas)
select string_agg(
         tc.table_name || '.' || kcu.column_name || ' -> ' ||
         ccu.table_name || '.' || ccu.column_name,
         E'\n' order by tc.table_name
       ) as claves_foraneas
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
  join information_schema.constraint_column_usage ccu
    on ccu.constraint_name = tc.constraint_name
 where tc.constraint_type = 'FOREIGN KEY'
   and tc.table_schema = 'public';
```

Cada una devuelve **una sola celda de texto**: se hace clic y se copia entera. Con
esas tres salidas, el baseline se puede corregir para que refleje la realidad en
vez de una deducción.

---

## De aquí en adelante

1. Un cambio de esquema = un fichero nuevo en `migrations/`, numerado y commiteado.
2. Después se pega en el SQL Editor. Nunca al revés, nunca solo una de las dos cosas.
3. Si alguna vez tocas algo directamente en el SQL Editor por urgencia, escribe la
   migración correspondiente **el mismo día**. Es así como se acumuló la deriva.
4. Cada pocos meses, vuelve a pasar las tres radiografías y compara. Es la única
   red que hay sin CLI.
