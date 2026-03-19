alter table runtime_fields
  alter column host drop not null;

comment on column runtime_fields.host is 'Optional ProPresenter host. Null means this field is manual-entry only.';
