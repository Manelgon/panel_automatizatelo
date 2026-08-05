-- =============================================================================
-- MIGRACIÓN 014 — FASE 3: FORMACIONES
-- =============================================================================
-- La línea de negocio que el panel no sabía registrar. Ver
-- docs/AUDITORIA-PANEL.md §5.1.
--
-- Tres tablas:
--
--   formaciones           la convocatoria: cliente, título, horas, precio cerrado
--   formacion_sesiones    cada sesión impartida, con sus horas
--   formacion_alumnos     quién asistió y su certificado
--
-- Decisiones tomadas (agosto 2026):
--
--   · Siempre in-company: una formación pertenece a UN cliente. Por eso
--     cliente_id es obligatorio, igual que en projects desde la 011.
--   · Precio cerrado, no por horas. Es una de las garantías que promete la web
--     («precio y plazo cerrados, por escrito antes de empezar») y facturar por
--     horas la contradice. Las horas se registran igual, pero para otra cosa:
--     un certificado del Art. 4 sin horas ni fechas no acredita nada.
--   · El certificado se genera desde el panel y se guarda, con un código de
--     verificación por alumno.
--
-- Es re-ejecutable.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. LA FORMACIÓN
-- -----------------------------------------------------------------------------
create table if not exists public.formaciones (
    id           uuid primary key default gen_random_uuid(),
    cliente_id   uuid not null references public.clients(id) on delete restrict,
    lead_id      uuid references public.leads(id) on delete set null,

    titulo       text not null,
    tipo         text not null default 'ia_empresas'
                 check (tipo in ('art4', 'ia_empresas', 'ia_centros', 'a_medida', 'scorm')),
    modalidad    text not null default 'presencial'
                 check (modalidad in ('presencial', 'remoto', 'mixta', 'scorm')),
    estado       text not null default 'propuesta'
                 check (estado in ('propuesta', 'confirmada', 'impartida', 'certificada', 'cancelada')),

    -- Las horas son documentación: van al certificado y al registro del Art. 4
    horas_totales  numeric(6,2) not null default 0,
    -- El precio se pacta cerrado antes de empezar, no se calcula por horas
    precio_cerrado numeric(12,2) not null default 0,

    fecha_inicio date,
    fecha_fin    date,
    lugar        text,

    -- Temario. Se imprime en el certificado, así que conviene que esté escrito
    -- para el alumno y no para uso interno.
    contenidos   text,
    notas        text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_formaciones_cliente on public.formaciones(cliente_id);
create index if not exists idx_formaciones_estado  on public.formaciones(estado, fecha_inicio desc);
create index if not exists idx_formaciones_lead    on public.formaciones(lead_id);


-- -----------------------------------------------------------------------------
-- 2. LAS SESIONES
-- -----------------------------------------------------------------------------
-- Una formación de 8 horas puede ser una tarde o cuatro martes. El certificado
-- necesita el rango de fechas, y el registro del Art. 4 el desglose.
-- -----------------------------------------------------------------------------
create table if not exists public.formacion_sesiones (
    id           uuid primary key default gen_random_uuid(),
    formacion_id uuid not null references public.formaciones(id) on delete cascade,
    fecha        date not null,
    hora_inicio  time,
    hora_fin     time,
    horas        numeric(5,2) not null default 0,
    modalidad    text,
    lugar        text,
    notas        text,
    created_at   timestamptz not null default now()
);

create index if not exists idx_formacion_sesiones on public.formacion_sesiones(formacion_id, fecha);


-- -----------------------------------------------------------------------------
-- 3. LOS ALUMNOS — ESTO ES EL REGISTRO FORMATIVO DEL ART. 4
-- -----------------------------------------------------------------------------
-- Lo que se vende del Art. 4 no es la clase, es poder demostrarla tres años
-- después. Por eso el certificado lleva código de verificación y queda guardado.
--
-- El DNI es opcional a propósito: hace el certificado más sólido como prueba,
-- pero es un dato personal más que conservar. Si el cliente no lo pide, mejor no
-- tenerlo.
-- -----------------------------------------------------------------------------
create table if not exists public.formacion_alumnos (
    id           uuid primary key default gen_random_uuid(),
    formacion_id uuid not null references public.formaciones(id) on delete cascade,

    nombre       text not null,
    apellidos    text,
    email        text,
    dni          text,
    cargo        text,

    asistencia_horas numeric(5,2),
    aprovechamiento  text not null default 'pendiente'
                     check (aprovechamiento in ('pendiente', 'apto', 'no_apto', 'no_asistio')),

    -- Certificado
    certificado_codigo     text unique,
    certificado_url        text,
    certificado_emitido_at timestamptz,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists idx_formacion_alumnos on public.formacion_alumnos(formacion_id);
create unique index if not exists idx_formacion_alumno_email
    on public.formacion_alumnos(formacion_id, lower(trim(email)))
    where email is not null and trim(email) <> '';


-- -----------------------------------------------------------------------------
-- 4. LAS FORMACIONES SE FACTURAN
-- -----------------------------------------------------------------------------
alter table public.facturas
    add column if not exists formacion_id uuid references public.formaciones(id) on delete set null;

create index if not exists idx_facturas_formacion on public.facturas(formacion_id);


-- -----------------------------------------------------------------------------
-- 5. CÓDIGO DE VERIFICACIÓN DEL CERTIFICADO
-- -----------------------------------------------------------------------------
-- Formato AT-2026-A1B2C3. Se asigna al emitir, no al crear el alumno: un código
-- en un certificado que nunca se emitió no verifica nada.
-- -----------------------------------------------------------------------------
create or replace function public.generar_codigo_certificado()
returns text
language plpgsql
as $$
declare
    v_codigo text;
begin
    loop
        v_codigo := 'AT-' || to_char(now(), 'YYYY') || '-' ||
                    upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
        exit when not exists (
            select 1 from public.formacion_alumnos where certificado_codigo = v_codigo
        );
    end loop;
    return v_codigo;
end;
$$;


-- -----------------------------------------------------------------------------
-- 6. updated_at
-- -----------------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists trg_formaciones_updated on public.formaciones;
create trigger trg_formaciones_updated before update on public.formaciones
    for each row execute function public.tocar_updated_at();

drop trigger if exists trg_formacion_alumnos_updated on public.formacion_alumnos;
create trigger trg_formacion_alumnos_updated before update on public.formacion_alumnos
    for each row execute function public.tocar_updated_at();


-- -----------------------------------------------------------------------------
-- 7. RLS — solo admin, como el resto de datos de negocio
-- -----------------------------------------------------------------------------
alter table public.formaciones        enable row level security;
alter table public.formacion_sesiones enable row level security;
alter table public.formacion_alumnos  enable row level security;

drop policy if exists "formaciones_admin" on public.formaciones;
create policy "formaciones_admin" on public.formaciones
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "formacion_sesiones_admin" on public.formacion_sesiones;
create policy "formacion_sesiones_admin" on public.formacion_sesiones
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "formacion_alumnos_admin" on public.formacion_alumnos;
create policy "formacion_alumnos_admin" on public.formacion_alumnos
    for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- -----------------------------------------------------------------------------
-- 7b. DÓNDE VIVEN LOS CERTIFICADOS
-- -----------------------------------------------------------------------------
-- Privado: un certificado lleva nombre y a veces DNI. Se sirve con URL firmada
-- de caducidad corta, no con enlace público.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('certificados', 'certificados', false)
on conflict (id) do nothing;

drop policy if exists "certificados_admin_all" on storage.objects;
create policy "certificados_admin_all" on storage.objects
    for all to authenticated
    using      (bucket_id = 'certificados' and public.is_admin())
    with check (bucket_id = 'certificados' and public.is_admin());


-- -----------------------------------------------------------------------------
-- 8. LAS HORAS DE LA FORMACIÓN SE CALCULAN SOLAS
-- -----------------------------------------------------------------------------
-- horas_totales se puede escribir a mano, pero en cuanto hay sesiones manda la
-- suma de sus horas: es lo que de verdad se impartió y lo que debe salir en el
-- certificado.
-- -----------------------------------------------------------------------------
create or replace function public.formacion_recalcular_horas()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_formacion uuid := coalesce(new.formacion_id, old.formacion_id);
    v_horas     numeric;
begin
    select coalesce(sum(horas), 0) into v_horas
      from public.formacion_sesiones
     where formacion_id = v_formacion;

    if v_horas > 0 then
        update public.formaciones set horas_totales = v_horas where id = v_formacion;
    end if;

    return null;
end;
$$;

drop trigger if exists trg_formacion_horas on public.formacion_sesiones;
create trigger trg_formacion_horas
    after insert or update or delete on public.formacion_sesiones
    for each row execute function public.formacion_recalcular_horas();
