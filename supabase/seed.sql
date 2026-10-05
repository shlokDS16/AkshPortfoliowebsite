-- Local stack and CI only. The hosted project gets its admin email by hand (Task 0).
insert into private.settings (key, value)
values ('admin_email', 'admin@desk.test')
on conflict (key) do update set value = excluded.value;
