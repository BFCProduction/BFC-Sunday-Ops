-- Ensure pco_service_type_id is unique across service_types rows.
-- A partial unique index (WHERE NOT NULL) allows multiple un-linked rows
-- while still preventing duplicate PCO IDs.
CREATE UNIQUE INDEX IF NOT EXISTS service_types_pco_id_unique
  ON public.service_types (pco_service_type_id)
  WHERE pco_service_type_id IS NOT NULL;
