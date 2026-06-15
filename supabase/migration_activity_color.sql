-- Run this ONCE in the Supabase SQL Editor. Adds an optional per-activity color
-- (hex string) used for the card's left border, independent of its category tag.
alter table activities add column if not exists color text;
