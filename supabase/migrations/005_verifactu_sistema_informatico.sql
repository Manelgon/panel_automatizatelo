-- =============================================================================
-- MIGRACIÓN 005 — DATOS DEL SISTEMA INFORMÁTICO VERIFACTU
-- =============================================================================
-- Campos del bloque <SistemaInformatico> que AEAT exige en cada registro.
-- Defaults adaptados al panel de Automatízatelo. Si productor_nombre/nif
-- quedan vacíos, en runtime se usan los del emisor (software interno).
-- =============================================================================

alter table public.company_settings
  add column if not exists verifactu_productor_nombre text default '',
  add column if not exists verifactu_productor_nif text default '',
  add column if not exists verifactu_sistema_nombre text default 'Automatizatelo Panel',
  add column if not exists verifactu_sistema_id text default 'AT',
  add column if not exists verifactu_version text default '1.0',
  add column if not exists verifactu_numero_instalacion text default 'AT-01';
