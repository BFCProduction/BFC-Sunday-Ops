-- 054_group_input_list_connections.sql
--
-- Keep rows that share the first room-defined value together. For the
-- Sanctuary Floor Boxes section this places each box's MIC, return, network,
-- fiber, and BNC connections in one contiguous group while preserving the
-- existing order within the box.

with primary_room_columns as (
  select distinct on (section_id)
         section_id,
         id as column_id
    from public.input_list_columns
   where value_source = 'room'
   order by section_id, sort_order, id
),
row_group_values as (
  select input_row.id,
         input_row.section_id,
         input_row.sort_order as original_order,
         coalesce(
           nullif(lower(btrim(room_value.value)), ''),
           input_row.id::text
         ) as group_key
    from public.input_list_rows as input_row
    left join primary_room_columns as primary_column
      on primary_column.section_id = input_row.section_id
    left join public.input_list_room_values as room_value
      on room_value.row_id = input_row.id
     and room_value.column_id = primary_column.column_id
),
grouped_rows as (
  select row_group_values.*,
         min(original_order) over (
           partition by section_id, group_key
         ) as group_first_order
    from row_group_values
),
ordered_rows as (
  select id,
         row_number() over (
           partition by section_id
           order by group_first_order, original_order, id
         ) - 1 as new_sort_order
    from grouped_rows
)
update public.input_list_rows as input_row
   set sort_order = ordered_row.new_sort_order::integer,
       updated_at = now()
  from ordered_rows as ordered_row
 where input_row.id = ordered_row.id;
