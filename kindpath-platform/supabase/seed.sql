-- Seeds the single organisation row this build assumes at launch.
-- handle_new_user() (see migrations) attaches every new signup to
-- whichever organisation was created first, so this must run before
-- anyone signs up.
insert into public.organisations (name)
values ('KindPath Collective Inc')
on conflict do nothing;
