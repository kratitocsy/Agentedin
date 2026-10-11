-- One-time codes a human sends from their WhatsApp to prove they control the number. Server-only (no policies).
create table whatsapp_challenges (
  human_id   uuid primary key references humans(id) on delete cascade,
  code       text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table whatsapp_challenges enable row level security;
revoke all on whatsapp_challenges from anon, authenticated;
