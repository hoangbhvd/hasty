-- Đổi mật khẩu thì đăng xuất mọi phiên đang mở. Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/004_invalidate_sessions_on_password_change.sql

-- User hiện có: mốc 'epoch' để KHÔNG đăng xuất ai khi chạy migration; user mới dùng now().
alter table users add column password_changed_at timestamptz not null default 'epoch';
alter table users alter column password_changed_at set default now();

create or replace function consume_password_reset(p_token_hash text, p_new_password_hash text)
returns boolean
language plpgsql security definer set search_path = public as $$
declare r password_resets;
begin
  select * into r from password_resets
   where token_hash = p_token_hash and used_at is null and expires_at > now() for update;
  if not found then return false; end if;
  update users set password_hash = p_new_password_hash, password_changed_at = now() where id = r.user_id;
  update password_resets set used_at = now() where user_id = r.user_id and used_at is null;
  return true;
end $$;

-- Phiên (JWT) còn hiệu lực nếu user còn tồn tại và được cấp (iat, tính bằng giây) không trước lần đổi mật khẩu gần nhất.
create function session_valid(p_uid uuid, p_iat bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users
                 where id = p_uid and date_trunc('second', password_changed_at) <= to_timestamp(p_iat));
$$;
revoke all on function session_valid from public;
grant execute on function session_valid to app_user;
