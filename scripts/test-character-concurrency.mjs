// Concurrency stress test for set_chapter_characters on a real multi-connection PostgreSQL
// (PGlite in test-character-migration.mjs has a single connection, so it cannot race writers).
// No env file, network or application DB access: a throwaway embedded server in a temp dir.
// Install into a temporary directory, then pass its node_modules path as argv[2]:
//   npm.cmd install --prefix .tmp/character-stress --no-save --package-lock=false embedded-postgres pg
//   node scripts/test-character-concurrency.mjs .tmp/character-stress/node_modules
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

if (!process.argv[2]) throw new Error("Pass the node_modules directory containing embedded-postgres and pg");
const mod = name => import(pathToFileURL(path.resolve(process.argv[2], name, name === "pg" ? "lib/index.js" : "dist/index.js")).href);
const { default: EmbeddedPostgres } = await mod("embedded-postgres");
const { default: pg } = await mod("pg");
const REPO = process.cwd();
const DATA = await mkdtemp(path.join(tmpdir(), "vinh-character-stress-"));
const PORT = 54329;
const server = new EmbeddedPostgres({ databaseDir: DATA, user: "postgres", password: "postgres", port: PORT, persistent: false, onLog: () => {}, onError: () => {}, initdbFlags: ["--encoding=UTF8", "--locale=C"],
  postgresFlags: ["-c", "max_connections=200", "-c", "deadlock_timeout=200ms"] });
await server.initialise();
await server.start();
const cfg = { host: "127.0.0.1", port: PORT, user: "postgres", password: "postgres", database: "postgres" };
const failures = [];
const check = (cond, msg) => { if (!cond) { failures.push(msg); console.log("  FAIL:", msg); } else console.log("  ok:", msg); };

async function connectAs(userId) {
  const c = new pg.Client(cfg);
  await c.connect();
  await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: userId })]);
  await c.query("set role authenticated");
  return c;
}
const sorted = a => [...a].sort();
const same = (a, b) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));

try {
  const admin = new pg.Client(cfg);
  await admin.connect();
  await admin.query(`
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
      title text, content text, order_index integer, published boolean default false);`);
  const baseline = await readFile(`${REPO}/migrations/baseline/02_books_and_chapters.sql`, "utf8");
  await admin.query(baseline.slice(baseline.indexOf("create table public.characters ("), baseline.indexOf("-- --- Tags")));
  await admin.query(await readFile(`${REPO}/migrations/20260930_character_management.sql`, "utf8"));
  await admin.query(await readFile(`${REPO}/migrations/20260930_character_delete_recent.sql`, "utf8"));

  const author = randomUUID(), other = randomUUID(), book = randomUUID(), otherBook = randomUUID();
  await admin.query("insert into auth.users(id) values ($1),($2)", [author, other]);
  await admin.query("insert into books(id, author_id, published) values ($1,$2,true),($3,$4,true)", [book, author, otherBook, other]);
  const chapters = [];
  for (let i = 0; i < 10; i++) chapters.push((await admin.query("insert into chapters(book_id, order_index) values ($1,$2) returning id", [book, i])).rows[0].id);
  const chars = [];
  for (let i = 0; i < 40; i++) chars.push((await admin.query("insert into characters(book_id, name) values ($1,$2) returning id", [book, `C${i}`])).rows[0].id);
  const foreignChar = (await admin.query("insert into characters(book_id, name) values ($1,'X') returning id", [otherBook])).rows[0].id;
  const current = async ch => (await admin.query("select character_id from chapter_characters where chapter_id=$1", [ch])).rows.map(r => r.character_id);
  const rpc = (c, ch, ids, expected) => c.query("select set_chapter_characters($1::uuid, $2::uuid[], $3::uuid[]) as r", [ch, ids, expected ?? null]);
  const pick = n => sorted(chars).sort(() => Math.random() - 0.5).slice(0, n);

  const N = 80;
  const pool = await Promise.all(Array.from({ length: N }, () => connectAs(author)));
  console.log(`PostgreSQL ${(await admin.query("show server_version")).rows[0].server_version}, ${N} concurrent author connections`);

  // 1. Same stale snapshot from N tabs: exactly one wins, the rest get 40001.
  console.log("\n[1] N clients, same expected snapshot, one chapter");
  for (let round = 0; round < 5; round++) {
    const ch = chapters[0];
    const snap = await current(ch);
    const sets = pool.map(() => pick(1 + Math.floor(Math.random() * 8)));
    const res = await Promise.allSettled(pool.map((c, i) => rpc(c, ch, sets[i], snap)));
    const ok = res.map((r, i) => [r, i]).filter(([r]) => r.status === "fulfilled");
    const codes = new Set(res.filter(r => r.status === "rejected").map(r => r.reason.code));
    check(ok.length === 1 && [...codes].every(c => c === "40001"), `round ${round}: winners=${ok.length}, loser codes=${[...codes]}`);
    if (ok.length === 1) check(same(await current(ch), sets[ok[0][1]]), `round ${round}: final state equals winner's set`);
  }

  // 2. Legacy clients (no expected list): all succeed, final state is exactly one submitted set.
  console.log("\n[2] N legacy clients without expected list");
  for (let round = 0; round < 5; round++) {
    const ch = chapters[1];
    const sets = pool.map(() => pick(Math.floor(Math.random() * 10)));
    const res = await Promise.allSettled(pool.map((c, i) => rpc(c, ch, sets[i])));
    const rejected = res.filter(r => r.status === "rejected");
    const fin = await current(ch);
    check(rejected.length === 0, `round ${round}: all ${N} saves succeeded (${rejected.length} errors${rejected[0] ? ": " + rejected[0].reason.message : ""})`);
    check(sets.some(s => same(s, fin)) && new Set(fin).size === fin.length, `round ${round}: final state matches one submitted set, no mixing/duplicates`);
  }

  // 3. Read-modify-write with retry on 409: no lost updates.
  console.log("\n[3] 40 clients each add their own character, retrying on conflict");
  {
    const ch = chapters[2];
    let conflicts = 0;
    await Promise.all(chars.map(async (id, i) => {
      for (let attempt = 0; attempt < 500; attempt++) {
        const base = (await pool[i].query("select coalesce(array_agg(character_id), '{}') ids from chapter_characters where chapter_id=$1", [ch])).rows[0].ids;
        try { await rpc(pool[i], ch, [...base, id], base); return; }
        catch (e) { if (e.code !== "40001") throw e; conflicts++; }
      }
      throw new Error("retry budget exhausted");
    }));
    const fin = await current(ch);
    check(same(fin, chars), `all 40 additions persisted (${fin.length}/40, ${conflicts} conflicts retried)`);
  }

  // 4. Random writers across chapters with overlapping characters: no deadlocks or unexpected errors.
  console.log("\n[4] N legacy writers x 10 chapters x 20 iterations, overlapping characters + concurrent renames");
  {
    const errors = {};
    const t0 = Date.now();
    await Promise.all(pool.map(async (c, i) => {
      for (let k = 0; k < 20; k++) {
        try {
          if (i % 10 === 0) await c.query("update characters set name = $1 where id = $2", [`R${i}-${k}`, chars[k % chars.length]]);
          else await rpc(c, chapters[(i + k) % chapters.length], pick(1 + Math.floor(Math.random() * 15)));
        } catch (e) { errors[e.code] = (errors[e.code] ?? 0) + 1; }
      }
    }));
    check(Object.keys(errors).length === 0, `${N * 20} ops in ${Date.now() - t0}ms, errors: ${JSON.stringify(errors)}`);
    const dup = (await admin.query("select count(*)::int n from (select chapter_id, character_id from chapter_characters group by 1,2 having count(*)>1) d")).rows[0].n;
    check(dup === 0, "no duplicate chapter_characters rows");
  }

  // 5. Archive racing a tag: whichever commits first decides; archived character is never newly tagged.
  console.log("\n[5] archive vs. tag race (both orderings)");
  {
    const ch = chapters[3], target = chars[5];
    await rpc(pool[0], ch, []); await rpc(pool[0], chapters[4], []);
    // 5a: archive holds row lock first, RPC waits, then must reject.
    const a = pool[1], b = pool[2];
    await a.query("begin"); await a.query("update characters set archived_at = now() where id = $1", [target]);
    const p = rpc(b, ch, [target]).then(() => "ok", e => e.code);
    await new Promise(r => setTimeout(r, 300));
    await a.query("commit");
    check((await p) === "22023" && !(await current(ch)).includes(target), "archive committed first → tag rejected (22023)");
    await admin.query("update characters set archived_at = null where id = $1", [target]);
    // 5b: RPC transaction holds share lock first, archive waits until it commits.
    await b.query("begin"); await rpc(b, ch, [target]);
    let archived = false;
    const q = a.query("update characters set archived_at = now() where id = $1", [target]).then(() => { archived = true; });
    await new Promise(r => setTimeout(r, 300));
    check(!archived, "archive blocks while tag transaction is open");
    await b.query("commit"); await q;
    check((await current(ch)).includes(target), "tag committed first → link kept, archive applied after");
    // Re-saving with the archived character already linked is allowed; adding it elsewhere is not.
    await rpc(b, ch, [target]);
    const other = await rpc(b, chapters[4], [target]).then(() => "ok", e => e.code);
    check(other === "22023", "archived character cannot be newly tagged on another chapter");
    await admin.query("update characters set archived_at = null where id = $1", [target]);
  }

  // 6. Hostile concurrent calls: other user and foreign characters never get through.
  console.log("\n[6] concurrent forbidden writes");
  {
    const ch = chapters[5];
    await rpc(pool[0], ch, [chars[0]]);
    const intruders = await Promise.all(Array.from({ length: 20 }, () => connectAs(other)));
    const res = await Promise.allSettled([
      ...intruders.map(c => rpc(c, ch, [])),
      ...pool.slice(0, 20).map(c => rpc(c, ch, [chars[0], foreignChar])),
      ...intruders.map(c => c.query("insert into chapter_characters(chapter_id, character_id) values ($1,$2)", [ch, chars[1]])),
    ]);
    const codes = res.map(r => r.status === "rejected" ? r.reason.code : "ok");
    check(!codes.includes("ok"), `all 60 forbidden writes rejected (${[...new Set(codes)]})`);
    check(same(await current(ch), [chars[0]]), "chapter state unchanged");
    await Promise.all(intruders.map(c => c.end()));
  }

  // 7. Permanent delete racing itself and chapter tagging.
  console.log("\n[7] concurrent permanent delete");
  {
    const victim = (await admin.query("insert into characters(book_id, name) values ($1,'Tmp') returning id", [book])).rows[0].id;
    const res = await Promise.allSettled(pool.slice(0, 30).map(c => c.query("select delete_recent_character($1, $2)", [book, victim])));
    const ok = res.filter(r => r.status === "fulfilled").length;
    const codes = new Set(res.filter(r => r.status === "rejected").map(r => r.reason.code));
    check(ok === 1 && [...codes].every(c => c === "42501"), `30 simultaneous deletes: ${ok} succeeded, others ${[...codes]}`);
    const racer = (await admin.query("insert into characters(book_id, name) values ($1,'Race') returning id", [book])).rows[0].id;
    const ch = chapters[6];
    await rpc(pool[0], ch, []);
    const mixed = await Promise.allSettled([
      ...pool.slice(0, 40).map(c => rpc(c, ch, [racer])),
      pool[40].query("select delete_recent_character($1, $2)", [book, racer]),
      ...pool.slice(41, 80).map(c => rpc(c, ch, [racer])),
    ]);
    const unexpected = mixed.filter(r => r.status === "rejected" && !["22023", "23503"].includes(r.reason.code));
    const orphans = (await admin.query("select count(*)::int n from chapter_characters cc left join characters c on c.id = cc.character_id where c.id is null")).rows[0].n;
    check(mixed[40].status === "fulfilled" && !(await current(ch)).includes(racer) && orphans === 0 && unexpected.length === 0,
      `delete during 79 concurrent tag saves: deleted=${mixed[40].status}, orphan tags=${orphans}, unexpected errors=${unexpected.map(r => r.reason.code)}`);
  }

  await Promise.all(pool.map(c => c.end()));
  await admin.end();
} finally {
  await server.stop();
  await rm(DATA, { recursive: true, force: true });
}
console.log(failures.length ? `\n${failures.length} FAILURE(S)` : "\nALL STRESS CHECKS PASSED");
process.exit(failures.length ? 1 : 0);
