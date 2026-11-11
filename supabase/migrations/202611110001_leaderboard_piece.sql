-- Rankings show the piece each player ended the run as. Records made before
-- this column stay null and show the name alone.
alter table public.leaderboard
  add column if not exists piece text check (piece in ('pawn', 'knight', 'bishop', 'rook', 'queen', 'king'));

alter table public.coop_leaderboard
  add column if not exists piece1 text check (piece1 in ('pawn', 'knight', 'bishop', 'rook', 'queen', 'king')),
  add column if not exists piece2 text check (piece2 in ('pawn', 'knight', 'bishop', 'rook', 'queen', 'king'));
