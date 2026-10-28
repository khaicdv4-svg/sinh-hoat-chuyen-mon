-- Thành viên tự khai hồ sơ (họ tên, nhiệm vụ); nối với tài khoản theo email

create function public.shcm_save_my_profile(p_honorific text, p_full_name text, p_title text)
returns public.shcm_members
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_name text := trim(coalesce(p_full_name, ''));
  v_hon text := case when p_honorific = 'Thầy' then 'Thầy' else 'Cô' end;
  v_title text := nullif(trim(coalesce(p_title, '')), '');
  v_row public.shcm_members;
begin
  if v_uid is null then raise exception 'Chưa đăng nhập'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 120 then raise exception 'Họ và tên cần từ 2 đến 120 ký tự'; end if;

  select * into v_row from public.shcm_members where user_id = v_uid;
  if not found and v_email <> '' then
    select * into v_row from public.shcm_members where email = v_email;
  end if;

  if found then
    update public.shcm_members
       set honorific = v_hon, full_name = v_name, title = v_title, user_id = v_uid,
           email = coalesce(email, nullif(v_email, ''))
     where id = v_row.id
     returning * into v_row;
  else
    insert into public.shcm_members (honorific, full_name, title, email, user_id, sort_order)
    values (v_hon, v_name, v_title, nullif(v_email, ''), v_uid,
            coalesce((select max(sort_order) from public.shcm_members), 0) + 10)
    returning * into v_row;
  end if;

  update public.shcm_profiles set full_name = v_name where id = v_uid;
  return v_row;
end $$;

revoke all on function public.shcm_save_my_profile(text, text, text) from public, anon;
grant execute on function public.shcm_save_my_profile(text, text, text) to authenticated;
