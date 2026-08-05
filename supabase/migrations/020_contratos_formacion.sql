-- =============================================================================
-- 020 — CONTRATOS DE PRESTACIÓN DE SERVICIOS DE FORMACIÓN
-- =============================================================================
-- El contrato se genera en el panel con los datos del cliente y de la
-- formación, queda guardado como "pendiente de firma" y, cuando el cliente lo
-- devuelve firmado, se sube el PDF firmado y pasa a "firmado". Se conservan
-- las dos versiones.
--
-- Además: checklist por formación (jsonb) para las marcas manuales; las
-- automáticas (datos fiscales, precio, contrato, factura…) se calculan en el
-- panel a partir de los datos reales y no se guardan.
--
-- Re-ejecutable sin miedo, como todas.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TABLA
-- -----------------------------------------------------------------------------
create table if not exists public.formacion_contratos (
    id                uuid primary key default gen_random_uuid(),
    formacion_id      uuid not null references public.formaciones(id) on delete cascade,
    estado            text not null default 'pendiente_firma'
                      check (estado in ('pendiente_firma', 'firmado', 'anulado')),
    ruta_pdf          text not null,   -- Storage: el contrato generado, sin firmar
    ruta_pdf_firmado  text,            -- Storage: el que devuelve el cliente firmado
    firmado_at        timestamptz,
    created_at        timestamptz not null default now(),
    created_by        uuid references public.users(id)
);

create index if not exists idx_formacion_contratos_formacion
    on public.formacion_contratos (formacion_id);

-- Un contrato firmado tiene que tener el PDF firmado y su fecha
alter table public.formacion_contratos
    drop constraint if exists formacion_contratos_firmado_coherente;
alter table public.formacion_contratos
    add constraint formacion_contratos_firmado_coherente
    check (estado <> 'firmado' or (ruta_pdf_firmado is not null and firmado_at is not null));

-- -----------------------------------------------------------------------------
-- 2. CHECKLIST MANUAL EN LA FORMACIÓN
-- -----------------------------------------------------------------------------
-- {"sala_confirmada": true, ...} — solo las marcas que no se pueden deducir
-- de los datos. Las automáticas las calcula el panel.
alter table public.formaciones
    add column if not exists checklist jsonb not null default '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 3. RLS — solo admin, como el resto de formaciones
-- -----------------------------------------------------------------------------
alter table public.formacion_contratos enable row level security;

drop policy if exists "formacion_contratos_admin" on public.formacion_contratos;
create policy "formacion_contratos_admin" on public.formacion_contratos
    for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. DÓNDE VIVEN LOS PDF
-- -----------------------------------------------------------------------------
-- Privado, como los certificados: un contrato lleva datos fiscales y firmas.
-- Se sirve con URL firmada de caducidad corta.
insert into storage.buckets (id, name, public)
values ('contratos', 'contratos', false)
on conflict (id) do nothing;

drop policy if exists "contratos_admin_all" on storage.objects;
create policy "contratos_admin_all" on storage.objects
    for all to authenticated
    using      (bucket_id = 'contratos' and public.is_admin())
    with check (bucket_id = 'contratos' and public.is_admin());
