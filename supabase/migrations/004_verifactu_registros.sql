-- =============================================================================
-- MIGRACIÓN 004 — VERIFACTU REGISTROS (cadena SHA-256 local)
-- =============================================================================
-- Libro inmutable de registros de facturación encadenados por SHA-256.
--   · Tabla verifactu_registros (append-only)
--   · Triggers de inmutabilidad y anti-delete
--   · Índices únicos para serializar la cadena bajo concurrencia
--   · Columnas en facturas: verifactu_alta_id, verifactu_anulacion_id, qr_url
--   · Ampliación del trigger de inmutabilidad para esos nuevos campos
-- =============================================================================

create extension if not exists pgcrypto;

create table if not exists public.verifactu_registros (
  id uuid primary key default gen_random_uuid(),

  factura_id uuid not null references public.facturas(id) on delete restrict,
  tipo text not null check (tipo in ('alta','anulacion')),

  num_registro bigint generated always as identity,
  huella text not null,
  huella_anterior text,
  hash_factura text not null,

  nif_emisor text not null,
  numero_factura text not null,
  fecha_emision date not null,
  tipo_factura_aeat text not null check (tipo_factura_aeat in ('F1','F2','F3','R1','R2','R3','R4','R5')),
  cuota_total numeric(12,2) not null,
  importe_total numeric(12,2) not null,
  fecha_hora_generacion timestamptz not null,

  xml_payload text,

  estado_envio text not null default 'pendiente'
    check (estado_envio in ('pendiente','enviado','aceptado','rechazado','error')),
  csv_aeat text,
  respuesta_aeat jsonb,
  intentos int not null default 0,
  ultimo_error text,
  enviado_at timestamptz,

  created_at timestamptz not null default now()
);

create index if not exists idx_verifactu_factura on public.verifactu_registros(factura_id, tipo);
create index if not exists idx_verifactu_num_registro on public.verifactu_registros(num_registro);

create unique index if not exists verifactu_huella_anterior_uniq
  on public.verifactu_registros(huella_anterior)
  where huella_anterior is not null;
create unique index if not exists verifactu_first_uniq
  on public.verifactu_registros((1))
  where huella_anterior is null;


-- INMUTABILIDAD
create or replace function public.verifactu_prevent_update()
returns trigger
language plpgsql
as $$
begin
  if new.factura_id            is distinct from old.factura_id            then raise exception 'verifactu_registros: factura_id inmutable'            using errcode = 'check_violation'; end if;
  if new.tipo                  is distinct from old.tipo                  then raise exception 'verifactu_registros: tipo inmutable'                  using errcode = 'check_violation'; end if;
  if new.num_registro          is distinct from old.num_registro          then raise exception 'verifactu_registros: num_registro inmutable'          using errcode = 'check_violation'; end if;
  if new.huella                is distinct from old.huella                then raise exception 'verifactu_registros: huella inmutable'                using errcode = 'check_violation'; end if;
  if new.huella_anterior       is distinct from old.huella_anterior       then raise exception 'verifactu_registros: huella_anterior inmutable'       using errcode = 'check_violation'; end if;
  if new.hash_factura          is distinct from old.hash_factura          then raise exception 'verifactu_registros: hash_factura inmutable'          using errcode = 'check_violation'; end if;
  if new.nif_emisor            is distinct from old.nif_emisor            then raise exception 'verifactu_registros: nif_emisor inmutable'            using errcode = 'check_violation'; end if;
  if new.numero_factura        is distinct from old.numero_factura        then raise exception 'verifactu_registros: numero_factura inmutable'        using errcode = 'check_violation'; end if;
  if new.fecha_emision         is distinct from old.fecha_emision         then raise exception 'verifactu_registros: fecha_emision inmutable'         using errcode = 'check_violation'; end if;
  if new.tipo_factura_aeat     is distinct from old.tipo_factura_aeat     then raise exception 'verifactu_registros: tipo_factura_aeat inmutable'     using errcode = 'check_violation'; end if;
  if new.cuota_total           is distinct from old.cuota_total           then raise exception 'verifactu_registros: cuota_total inmutable'           using errcode = 'check_violation'; end if;
  if new.importe_total         is distinct from old.importe_total         then raise exception 'verifactu_registros: importe_total inmutable'         using errcode = 'check_violation'; end if;
  if new.fecha_hora_generacion is distinct from old.fecha_hora_generacion then raise exception 'verifactu_registros: fecha_hora_generacion inmutable' using errcode = 'check_violation'; end if;
  if new.created_at            is distinct from old.created_at            then raise exception 'verifactu_registros: created_at inmutable'            using errcode = 'check_violation'; end if;
  return new;
end;
$$;

drop trigger if exists verifactu_prevent_update on public.verifactu_registros;
create trigger verifactu_prevent_update
  before update on public.verifactu_registros
  for each row execute function public.verifactu_prevent_update();


create or replace function public.verifactu_prevent_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'verifactu_registros es append-only. No se pueden eliminar registros.'
    using errcode = 'check_violation';
end;
$$;

drop trigger if exists verifactu_prevent_delete on public.verifactu_registros;
create trigger verifactu_prevent_delete
  before delete on public.verifactu_registros
  for each row execute function public.verifactu_prevent_delete();


-- RLS: solo admins
alter table public.verifactu_registros enable row level security;

drop policy if exists "verifactu_admin_select" on public.verifactu_registros;
create policy "verifactu_admin_select" on public.verifactu_registros
  for select to authenticated using (public.is_admin());

drop policy if exists "verifactu_admin_insert" on public.verifactu_registros;
create policy "verifactu_admin_insert" on public.verifactu_registros
  for insert to authenticated with check (public.is_admin());

-- (sin policies de UPDATE/DELETE: triggers + denegado por defecto)


-- COLUMNAS NUEVAS EN facturas
alter table public.facturas
  add column if not exists verifactu_alta_id uuid references public.verifactu_registros(id),
  add column if not exists verifactu_anulacion_id uuid references public.verifactu_registros(id),
  add column if not exists qr_url text;


-- AMPLIAR TRIGGER 003: verifactu_*_id inmutables una vez asignados
create or replace function public.facturas_prevent_fiscal_update()
returns trigger
language plpgsql
as $$
begin
  if new.serie                  is distinct from old.serie                  then raise exception 'Campo fiscal inmutable: serie (factura %)', old.numero               using errcode = 'check_violation'; end if;
  if new.anio                   is distinct from old.anio                   then raise exception 'Campo fiscal inmutable: anio (factura %)', old.numero                using errcode = 'check_violation'; end if;
  if new.correlativo            is distinct from old.correlativo            then raise exception 'Campo fiscal inmutable: correlativo (factura %)', old.numero         using errcode = 'check_violation'; end if;
  if new.numero                 is distinct from old.numero                 then raise exception 'Campo fiscal inmutable: numero (factura %)', old.numero              using errcode = 'check_violation'; end if;
  if new.client_id              is distinct from old.client_id              then raise exception 'Campo fiscal inmutable: client_id (factura %)', old.numero           using errcode = 'check_violation'; end if;
  if new.cliente_nombre         is distinct from old.cliente_nombre         then raise exception 'Campo fiscal inmutable: cliente_nombre (factura %)', old.numero      using errcode = 'check_violation'; end if;
  if new.cliente_nif            is distinct from old.cliente_nif            then raise exception 'Campo fiscal inmutable: cliente_nif (factura %)', old.numero         using errcode = 'check_violation'; end if;
  if new.cliente_direccion      is distinct from old.cliente_direccion      then raise exception 'Campo fiscal inmutable: cliente_direccion (factura %)', old.numero   using errcode = 'check_violation'; end if;
  if new.cliente_email          is distinct from old.cliente_email          then raise exception 'Campo fiscal inmutable: cliente_email (factura %)', old.numero       using errcode = 'check_violation'; end if;
  if new.fecha_emision          is distinct from old.fecha_emision          then raise exception 'Campo fiscal inmutable: fecha_emision (factura %)', old.numero       using errcode = 'check_violation'; end if;
  if new.base_imponible         is distinct from old.base_imponible         then raise exception 'Campo fiscal inmutable: base_imponible (factura %)', old.numero      using errcode = 'check_violation'; end if;
  if new.iva_porcentaje         is distinct from old.iva_porcentaje         then raise exception 'Campo fiscal inmutable: iva_porcentaje (factura %)', old.numero      using errcode = 'check_violation'; end if;
  if new.iva_importe            is distinct from old.iva_importe            then raise exception 'Campo fiscal inmutable: iva_importe (factura %)', old.numero         using errcode = 'check_violation'; end if;
  if new.irpf_porcentaje        is distinct from old.irpf_porcentaje        then raise exception 'Campo fiscal inmutable: irpf_porcentaje (factura %)', old.numero     using errcode = 'check_violation'; end if;
  if new.irpf_importe           is distinct from old.irpf_importe           then raise exception 'Campo fiscal inmutable: irpf_importe (factura %)', old.numero        using errcode = 'check_violation'; end if;
  if new.total                  is distinct from old.total                  then raise exception 'Campo fiscal inmutable: total (factura %)', old.numero               using errcode = 'check_violation'; end if;
  if new.factura_rectificada_id is distinct from old.factura_rectificada_id then raise exception 'Campo fiscal inmutable: factura_rectificada_id (factura %)', old.numero using errcode = 'check_violation'; end if;
  if new.motivo_rectificacion   is distinct from old.motivo_rectificacion   then raise exception 'Campo fiscal inmutable: motivo_rectificacion (factura %)', old.numero using errcode = 'check_violation'; end if;

  if old.verifactu_alta_id is not null and new.verifactu_alta_id is distinct from old.verifactu_alta_id then
    raise exception 'Campo fiscal inmutable: verifactu_alta_id (factura %)', old.numero using errcode = 'check_violation';
  end if;
  if old.verifactu_anulacion_id is not null and new.verifactu_anulacion_id is distinct from old.verifactu_anulacion_id then
    raise exception 'Campo fiscal inmutable: verifactu_anulacion_id (factura %)', old.numero using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
