-- Cho phép chủ huỷ booking đã chốt (và bỏ khoá lịch), kèm lý do trong thông báo.
-- Chạy trên DB đang chạy:
--   docker compose exec -T db psql -U hmstay_admin -d hmstay < db/migrations/002_owner_can_cancel_confirmed.sql

create or replace function advance_booking(p_booking uuid, p_to booking_status, p_note text default null)
returns bookings
language plpgsql security definer set search_path = public as $$
declare
  b bookings;
  old_status booking_status;
  is_owner boolean;
  is_broker boolean;
  prop uuid;
  owner_uid uuid;
  notify_uid uuid;
begin
  if app_uid() is null then raise exception 'not authenticated'; end if;

  select * into b from bookings where id = p_booking for update;
  if not found then raise exception 'booking not found'; end if;

  old_status := b.status;
  prop := unit_property(b.unit_id);
  is_owner  := is_property_owner(prop);
  is_broker := b.broker_id = app_uid();
  select owner_id into owner_uid from properties where id = prop;

  if not (
    (is_broker and ((old_status = 'quoted'  and p_to in ('holding', 'cancelled'))
                 or (old_status = 'holding' and p_to in ('deposit_reported', 'cancelled'))))
    or (is_owner and old_status in ('holding', 'deposit_reported') and p_to in ('confirmed', 'cancelled'))
    or (is_owner and old_status in ('quoted', 'confirmed') and p_to = 'cancelled')
  ) then
    raise exception 'transition % -> % not allowed', old_status, p_to;
  end if;

  -- Exclusion constraint chặn trùng lịch tại đây (lỗi 23P01)
  update bookings
     set status = p_to,
         hold_expires_at = case when p_to = 'holding' then now() + interval '12 hours'
                                else hold_expires_at end
   where id = p_booking returning * into b;

  insert into booking_events (booking_id, actor_id, from_status, to_status, note)
  values (p_booking, app_uid(), old_status, p_to, p_note);

  notify_uid := case when is_owner then b.broker_id else owner_uid end;
  if notify_uid is not null and notify_uid <> app_uid() then
    insert into notifications (user_id, booking_id, message)
    values (notify_uid, p_booking,
            format('Booking %s (nhận phòng %s): %s -> %s%s', b.guest_name, b.check_in, old_status, p_to,
                   coalesce(' – ' || nullif(p_note, ''), '')));
  end if;

  return b;
end $$;
