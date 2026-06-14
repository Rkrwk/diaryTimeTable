-- Run this ONCE in the Supabase SQL Editor. Allows custom activity categories
-- (previously limited to focus / move / rest). Safe on an existing database.
alter table activities drop constraint if exists activities_category_check;
