-- Long sessions outlived the 4-hour run ticket and could no longer be ranked.
-- Existing open runs keep their old expiry; new runs get 24 hours.
alter table public.game_runs alter column expires_at set default (now() + interval '24 hours');
