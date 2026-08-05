-- =============================================================================
-- MIGRACIÓN 013 — FASE 2 (D): QUE LAS COLUMNAS DE `users` DIGAN LO QUE GUARDAN
-- =============================================================================
-- En `public.users` los nombres de columna mienten. Según las etiquetas del
-- formulario de Gestión de Equipo:
--
--   name         →  nombre de pila     ("Juan")
--   first_name   →  PRIMER APELLIDO    ("Pérez")
--   second_name  →  SEGUNDO APELLIDO   ("García")
--
-- Y en `leads` y `clients` esas mismas palabras significan lo de siempre:
-- first_name es el nombre y last_name el apellido. La misma palabra, dos cosas
-- distintas según la tabla.
--
-- No es cosmético. Tasks.jsx, Projects.jsx, Dashboard.jsx y Calendar.jsx
-- componen el nombre para mostrar así:
--
--     [u.first_name, u.second_name].filter(Boolean).join(' ')
--
-- que con los datos reales da «Pérez García»: los dos apellidos, sin el nombre.
-- Todo el equipo lleva tiempo apareciendo mal en cuatro pantallas.
--
-- Se renombra a algo que no se pueda malinterpretar. Es re-ejecutable.
-- =============================================================================

do $$
declare
    v_tiene_nombre boolean;
begin
    -- ¿ya está renombrado? entonces no hay nada que hacer
    select exists (
        select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'users' and column_name = 'nombre'
    ) into v_tiene_nombre;

    if v_tiene_nombre then
        raise notice 'Ya estaba renombrado. Nada que hacer.';
        return;
    end if;

    alter table public.users rename column name        to nombre;
    alter table public.users rename column first_name  to apellido1;
    alter table public.users rename column second_name to apellido2;

    raise notice 'Renombradas: name -> nombre, first_name -> apellido1, second_name -> apellido2';
end;
$$;

comment on column public.users.nombre    is 'Nombre de pila. Ej: Juan';
comment on column public.users.apellido1 is 'Primer apellido. Ej: Pérez';
comment on column public.users.apellido2 is 'Segundo apellido, opcional. Ej: García';

-- Los que se dieran de alta sin nombre de pila quedarían con la etiqueta vacía
-- en todas las pantallas. Se rellena con la parte local del correo para que al
-- menos se distingan entre sí.
update public.users
   set nombre = split_part(email, '@', 1)
 where nombre is null or trim(nombre) = '';

create index if not exists idx_users_nombre on public.users(nombre);
