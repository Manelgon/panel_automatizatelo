-- =============================================================================
-- MIGRACIÓN 006 — VERIFACTU HARDENING
-- =============================================================================
--   1. SET search_path = '' en funciones de triggers (advisor 0011).
--   2. Índice parcial para acelerar el job de envío AEAT.
-- =============================================================================

create or replace function public.facturas_prevent_fiscal_update()
returns trigger
language plpgsql
set search_path = ''
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

create or replace function public.facturas_prevent_delete_no_anulada()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.estado <> 'anulada'::public.estado_factura then
    raise exception 'No se puede eliminar la factura % (estado %). Anúlala primero.',
      old.numero, old.estado
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

create or replace function public.factura_lineas_prevent_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las líneas de factura son inmutables. Emite una factura rectificativa para corregir.'
    using errcode = 'check_violation';
end;
$$;

create or replace function public.verifactu_prevent_update()
returns trigger
language plpgsql
set search_path = ''
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

create or replace function public.verifactu_prevent_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'verifactu_registros es append-only. No se pueden eliminar registros.'
    using errcode = 'check_violation';
end;
$$;


create index if not exists idx_verifactu_pendientes
  on public.verifactu_registros(estado_envio, created_at)
  where estado_envio in ('pendiente','error');
