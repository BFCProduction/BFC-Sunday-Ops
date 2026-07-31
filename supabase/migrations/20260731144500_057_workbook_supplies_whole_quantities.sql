-- Supply quantities represent discrete items. Normalize legacy fractional
-- values, then enforce whole numbers for every client and API path.

update public.workbook_supplies
set quantity = round(quantity),
    updated_at = now()
where quantity <> round(quantity);

alter table public.workbook_supplies
  drop constraint if exists workbook_supplies_quantity_whole;

alter table public.workbook_supplies
  add constraint workbook_supplies_quantity_whole
  check (quantity = trunc(quantity));
