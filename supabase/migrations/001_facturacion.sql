-- =============================================================================
-- MIGRACIÓN 001 — FACTURACIÓN FISCAL (base para Veri*factu)
-- =============================================================================
-- Reemplaza `project_invoices` (jsonb, no fiscal) por un modelo fiscal completo:
--
--   · Helper public.is_admin()
--   · Enums estado_factura, forma_pago
--   · Tabla company_settings (single-row, datos emisor + numeración + defaults)
--   · Tabla facturas (snapshot inmutable cliente + importes desglosados)
--   · Tabla factura_lineas
--   · Función next_numero_factura() con advisory lock (correlativo atómico)
--   · Bucket storage facturas + doc-assets
--   · RLS: solo admins gestionan
--   · Drop project_invoices (vacía) y repunta project_payments.invoice_id → facturas
--
-- Cliente obligatorio (client_id NOT NULL). Project opcional (project_id NULL).
-- =============================================================================


-- =============================================================================
-- HELPER public.is_admin()
-- =============================================================================
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.role = 'admin'
       from public.users u
      where u.id = auth.uid()),
    false
  );
$$;

grant execute on function public.is_admin() to authenticated;


-- =============================================================================
-- ENUMS
-- =============================================================================
do $$ begin
  create type public.estado_factura as enum ('pendiente', 'pagada', 'vencida', 'devuelta', 'anulada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.forma_pago as enum ('transferencia', 'efectivo', 'bizum', 'tarjeta', 'domiciliacion');
exception when duplicate_object then null; end $$;


-- =============================================================================
-- COMPANY SETTINGS (single row, id = 1)
-- =============================================================================
create table if not exists public.company_settings (
  id integer primary key default 1 check (id = 1),

  -- Datos del emisor (los rellena el admin desde /ajustes-emisor)
  emisor_nombre text default '',
  emisor_nif text default '',
  emisor_direccion text default '',
  emisor_cp text default '',
  emisor_ciudad text default '',
  emisor_provincia text default '',
  emisor_pais text default 'España',
  emisor_email text default '',
  emisor_telefono text default '',
  emisor_web text default '',
  emisor_iban text default '',

  -- Storage paths (bucket: doc-assets)
  logo_path text,
  firma_path text,
  header_path text,
  footer_path text,

  -- Defaults fiscales
  iva_default numeric(5,2) not null default 21.00,
  irpf_default numeric(5,2) not null default 0.00,
  forma_pago_default public.forma_pago default 'transferencia',
  dias_vencimiento_default integer not null default 30,

  -- Numeración automática
  serie_default text not null default 'F',
  proximo_numero integer not null default 1,
  prefijo_anio boolean not null default true,

  -- Pie de página configurable
  pie_pagina text default '',

  updated_at timestamptz not null default now()
);

-- Insertar la fila única si no existe
insert into public.company_settings (id) values (1)
on conflict (id) do nothing;


-- =============================================================================
-- DROP project_invoices (vacía) — antes hay que romper FKs que la apuntan
-- =============================================================================
-- IMPORTANTE: `project_services.invoice_id` y `project_budget_lines.invoice_id`
-- SE USAN en el código (ProjectDetail.jsx) para marcar qué servicios/líneas
-- ya están facturados. NO los borramos: solo rompemos su FK y la
-- repuntaremos a `facturas(id)` más abajo.
alter table public.project_payments
  drop constraint if exists project_payments_invoice_id_fkey;

alter table public.project_services
  drop constraint if exists project_services_invoice_id_fkey;

alter table public.project_budget_lines
  drop constraint if exists project_budget_lines_invoice_id_fkey;

drop table if exists public.project_invoices cascade;


-- =============================================================================
-- FACTURAS (snapshot fiscal completo, append-only en campos críticos)
-- =============================================================================
create table if not exists public.facturas (
  id uuid primary key default gen_random_uuid(),

  -- Numeración fiscal (única en su conjunto)
  serie text not null default 'F',
  anio integer not null,
  correlativo integer not null,
  numero text not null,  -- "F-2026-0001" o lo que componga next_numero_factura

  -- Vinculación opcional con proyecto, OBLIGATORIA con cliente
  client_id uuid not null references public.clients(id) on delete restrict,
  project_id uuid references public.projects(id) on delete set null,

  -- Snapshot del cliente al emitir (datos congelados para AEAT)
  cliente_nombre text not null,
  cliente_nif text,                  -- NIF/CIF/NIE (nullable: consumidor final)
  cliente_direccion text,
  cliente_email text,

  -- Fechas
  fecha_emision date not null default current_date,
  fecha_vencimiento date,

  -- Importes (desglosados, congelados)
  base_imponible numeric(12,2) not null,
  iva_porcentaje numeric(5,2) not null default 21.00,
  iva_importe numeric(12,2) not null,
  irpf_porcentaje numeric(5,2) not null default 0.00,
  irpf_importe numeric(12,2) not null default 0.00,
  total numeric(12,2) not null,

  -- Estado y pago
  estado public.estado_factura not null default 'pendiente',
  forma_pago public.forma_pago default 'transferencia',
  fecha_pago date,

  -- Rectificativas (R y A apuntan a la original)
  factura_rectificada_id uuid references public.facturas(id),
  motivo_rectificacion text,

  -- PDF generado en storage
  pdf_path text,

  -- Notas internas (no fiscales)
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint facturas_serie_anio_correlativo_uniq unique (serie, anio, correlativo),
  constraint facturas_numero_uniq unique (numero)
);

create index if not exists idx_facturas_client on public.facturas(client_id);
create index if not exists idx_facturas_project on public.facturas(project_id);
create index if not exists idx_facturas_estado on public.facturas(estado);
create index if not exists idx_facturas_fecha on public.facturas(fecha_emision desc);


-- =============================================================================
-- FACTURA_LINEAS (inmutables tras inserción)
-- =============================================================================
create table if not exists public.factura_lineas (
  id uuid primary key default gen_random_uuid(),
  factura_id uuid not null references public.facturas(id) on delete cascade,
  orden integer not null default 1,
  concepto text not null,
  cantidad numeric(12,4) not null default 1,
  precio_unitario numeric(12,4) not null default 0,
  descuento_porcentaje numeric(5,2) not null default 0,
  base_linea numeric(12,2) not null,  -- cantidad * precio_unitario - descuento
  created_at timestamptz not null default now()
);

create index if not exists idx_factura_lineas_factura on public.factura_lineas(factura_id, orden);


-- =============================================================================
-- REPUNTAR FKs invoice_id → facturas
-- =============================================================================
alter table public.project_payments
  add constraint project_payments_invoice_id_fkey
  foreign key (invoice_id) references public.facturas(id) on delete set null;

alter table public.project_services
  add constraint project_services_invoice_id_fkey
  foreign key (invoice_id) references public.facturas(id) on delete set null;

alter table public.project_budget_lines
  add constraint project_budget_lines_invoice_id_fkey
  foreign key (invoice_id) references public.facturas(id) on delete set null;


-- =============================================================================
-- FUNCIÓN next_numero_factura(serie) — correlativo atómico
-- =============================================================================
-- Reserva el siguiente correlativo de forma atómica usando advisory lock por
-- (serie, anio). Devuelve serie, anio, correlativo y el `numero` ya formateado.
create or replace function public.next_numero_factura(p_serie text default null)
returns table (serie text, anio integer, correlativo integer, numero text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serie text;
  v_anio integer := extract(year from current_date)::integer;
  v_correlativo integer;
  v_prefijo_anio boolean;
  v_numero text;
begin
  -- Solo admins reservan correlativos
  if not public.is_admin() then
    raise exception 'Solo admins pueden reservar números de factura' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(p_serie, cs.serie_default), cs.prefijo_anio
    into v_serie, v_prefijo_anio
    from public.company_settings cs
   where cs.id = 1;

  -- Lock por (serie, anio) para que dos emisiones simultáneas no colisionen
  perform pg_advisory_xact_lock(hashtext(v_serie || ':' || v_anio::text));

  -- Próximo correlativo: max + 1 dentro de (serie, anio)
  select coalesce(max(f.correlativo), 0) + 1
    into v_correlativo
    from public.facturas f
   where f.serie = v_serie and f.anio = v_anio;

  if v_prefijo_anio then
    v_numero := v_serie || '-' || v_anio::text || '-' || lpad(v_correlativo::text, 4, '0');
  else
    v_numero := v_serie || '-' || lpad(v_correlativo::text, 4, '0');
  end if;

  return query select v_serie, v_anio, v_correlativo, v_numero;
end;
$$;

grant execute on function public.next_numero_factura(text) to authenticated;


-- =============================================================================
-- TRIGGERS updated_at
-- =============================================================================
drop trigger if exists set_updated_at_facturas on public.facturas;
create trigger set_updated_at_facturas
  before update on public.facturas
  for each row execute function public.update_updated_at();

drop trigger if exists set_updated_at_company_settings on public.company_settings;
create trigger set_updated_at_company_settings
  before update on public.company_settings
  for each row execute function public.update_updated_at();


-- =============================================================================
-- RLS — solo admins gestionan
-- =============================================================================
alter table public.company_settings enable row level security;
alter table public.facturas enable row level security;
alter table public.factura_lineas enable row level security;

drop policy if exists "company_settings_select_authenticated" on public.company_settings;
create policy "company_settings_select_authenticated"
  on public.company_settings for select to authenticated using (true);

drop policy if exists "company_settings_admin_all" on public.company_settings;
create policy "company_settings_admin_all"
  on public.company_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "facturas_admin_all" on public.facturas;
create policy "facturas_admin_all"
  on public.facturas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "factura_lineas_admin_all" on public.factura_lineas;
create policy "factura_lineas_admin_all"
  on public.factura_lineas for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- =============================================================================
-- STORAGE BUCKETS
-- =============================================================================
insert into storage.buckets (id, name, public)
values ('doc-assets', 'doc-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

-- Política básica: admins leen/escriben en ambos buckets
drop policy if exists "doc_assets_admin_all" on storage.objects;
create policy "doc_assets_admin_all" on storage.objects
  for all to authenticated
  using (bucket_id in ('doc-assets', 'facturas') and public.is_admin())
  with check (bucket_id in ('doc-assets', 'facturas') and public.is_admin());


-- =============================================================================
-- FIN MIGRACIÓN 001
-- =============================================================================
