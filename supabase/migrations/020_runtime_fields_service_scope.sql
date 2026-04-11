-- ─────────────────────────────────────────────────────────────────────────────
-- 020_runtime_fields_service_scope.sql
--
-- Adds service_type_slug to runtime_fields so each field can be scoped to a
-- specific service type (9am, 11am, special) or left null to apply globally.
--
-- NULL  = applies to all service types (existing global fields keep their behavior)
-- 'sunday-9am' | 'sunday-11am' | 'special' = scoped to that service type only
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.runtime_fields
  add column if not exists service_type_slug text;

comment on column public.runtime_fields.service_type_slug is
  'NULL = global (applies to all service types); set to a service_types.slug to scope to a specific service';
