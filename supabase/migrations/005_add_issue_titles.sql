alter table issues
add column if not exists title text;

update issues
set title = left(trim(description), 120)
where coalesce(trim(title), '') = '';

alter table issues
alter column title set not null;
