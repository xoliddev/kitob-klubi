// JS port of kitobklubi/core/seedgen.py: the same fictional world, relative to "today".
import { find } from './books.js';
import { h32 } from './text.js';

export const HISTORY = 14;

export function world(people, catalog, today, marathon = true) {
  const users = [{ id: people.madina.id, name: people.madina.name, goal: 10 },
    { id: people.leader.id, name: people.leader.name, goal: 10 },
    { id: people.admin.id, name: people.admin.name, goal: 10 }];
  const books = [];
  const logs = [];
  const goals = [];
  const members = [];
  const start = today - HISTORY;
  people.members.forEach((m, i) => {
    users.push({ id: m.id, name: m.name, goal: m.goal });
    goals.push({ user_id: m.id, from_day: start, goal: m.goal });
    members.push({ club_id: 1, user_id: m.id, joined_day: start });
    const b = find(catalog, m.book);
    const bid = i + 1;
    books.push({ id: bid, user_id: m.id, catalog: b.id, title: b.title, author: b.author, pages: b.pages, start: m.start, added_day: start });
    let page = m.start;
    for (let k = HISTORY; k > 0; k--) {
      if (m.skip && h32(`${m.key}:skip:${k}`) % m.skip === 0) continue;
      let n = m.avg - Math.floor(m.avg / 4) + (h32(`${m.key}:p:${k}`) % (Math.floor(m.avg / 2) + 1));
      n = Math.min(n, b.pages - 1 - page);
      if (n <= 0) continue;
      page += n;
      logs.push({ user_id: m.id, book_id: bid, day: today - k, pages: n });
    }
  });
  const club = { id: 1, leader: people.leader.id, name: people.club.name, code: people.club.code, created_day: start };
  const marathons = [{ id: 1, club_id: 1, title: '30 kunda 1000 bet', start: today - 10, end: today + 19, goal: 1000 }];
  return { users, goals, books, logs, clubs: [club], members, marathons: marathon ? marathons : [] };
}
