// Isolated PostgreSQL smoke test. No env file, network or application DB access.
// Install PGlite in a temporary directory, then pass its dist/index.js as argv[2].
// This fixture models the relevant pre-migration tables; staging still needs the
// SQL regression test against the complete deployed schema and its other triggers.
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

if (!process.argv[2]) throw new Error("Pass the path to @electric-sql/pglite/dist/index.js");
const { PGlite } = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const db = new PGlite({ onNotice: notice => console.log(notice.message) });
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text);
    create table public.profiles (id uuid primary key references auth.users, username text, nickname text);
    create table public.books (id uuid primary key default gen_random_uuid(), author_id uuid references auth.users,
      title text, slug text, published boolean default false, deleted_at timestamptz);
    create table public.chapters (id uuid primary key default gen_random_uuid(), book_id uuid references public.books,
      title text, content text, order_index integer, published boolean default false);
  `);
  const baseline = await readFile("migrations/baseline/02_books_and_chapters.sql", "utf8");
  await db.exec(baseline.slice(baseline.indexOf("create table public.characters ("), baseline.indexOf("-- --- Tags")));
  // Existing public data must stay public on first application and on reruns.
  await db.exec(`insert into public.books(id, published) values ('00000000-0000-4000-8000-000000000001', true);
    insert into public.characters(book_id, name) values ('00000000-0000-4000-8000-000000000001', 'Existing character');`);
  const migration = await readFile("migrations/20260930_character_management.sql", "utf8");
  await db.exec(migration);
  await db.exec(migration);
  const existing = await db.query("select is_public from public.characters where name = 'Existing character'");
  if (existing.rows[0]?.is_public !== true) throw new Error("Migration changed existing visibility");
  await db.exec(await readFile("docs/supabase/tests/20260930_character_management.test.sql", "utf8"));
  console.log("PASS migration applied twice; existing visibility preserved; SQL regression completed in isolated PostgreSQL.");
} finally { await db.close(); }
