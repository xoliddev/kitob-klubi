// The demo's world: the same fictional club as the server's seed (shared/seedgen.js), relative to the demo's "today",
// without a running marathon (the story starts one). Ids are made positive here, like real Telegram users, so the
// demo runs exactly the server's rules (the server skips negative, seeded ids when it sends messages). Sardor reads
// already but is not in the club yet: he joins by code in the story.
import { secretFrom } from '../shared/cert.js';
import { localDay } from '../shared/clock.js';
import { world } from '../shared/seedgen.js';
import './backend-certs.js';
import './backend-club.js';
import { Backend } from './backend.js';

export const MADINA = 101;
export const SARDOR = 102;
export const LEADER = 201;
export const OTKAN = 'otkan_kunlar';
export const PROOF = "Pyer Bezuxov va Natasha birinchi bal sahnasini o'qidim. Knyaz Andreyning Austerlitsdagi o'ylari esimda qoldi.";
export const REVIEW = "Juda ta'sirli roman. Otabek va Kumushning taqdiri hech esimdan chiqmaydi.";

export function createDemo({ data, now = () => Date.now(), lang = 'uz' }) {
  const b = new Backend({ catalog: data.catalog, now, secret: secretFrom('kitob-klubi browser demo') });
  const w = world(data.people, data.catalog, localDay(b.nowMs()), false);
  const pos = (x) => Math.abs(x);
  b.users = w.users.map((u) => ({ id: pos(u.id), name: u.name, lang, goal: u.goal, nudge: null, created_day: localDay(b.nowMs()) - 30 }));
  b.goalRows = w.goals.map((g) => ({ ...g, user_id: pos(g.user_id) }));
  b.books = w.books.map((x) => ({ ...x, user_id: pos(x.user_id), finished_day: null, review: '' }));
  b.logs = w.logs.map((l, i) => ({ id: i + 1, user_id: pos(l.user_id), book_id: l.book_id, day: l.day, pages: l.pages, asked: l.pages, status: 'ok', proof: '',
    at: 0, decided_by: null }));
  b.clubs = w.clubs.map((k) => ({ ...k, leader: pos(k.leader), book_certs: false, blocked: false }));
  b.members = w.members.map((m) => ({ ...m, user_id: pos(m.user_id) })).filter((m) => m.user_id !== SARDOR); // he joins in the story
  b.next = { book: b.books.length + 1, log: b.logs.length + 1, club: 2, marathon: 1, cert: 1 };
  b.user(MADINA).nudge = 20 * 60;
  return b;
}
