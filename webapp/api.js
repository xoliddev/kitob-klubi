// HTTP client for the Mini App API. Every request carries Telegram's signed initData; the server checks it. The
// certificate check is the one call without initData (it works in any browser).
// The browser demo provides an object with the same methods that runs in the page instead (demo/api.js).
async function call(method, path, body, initData) {
  let res;
  try {
    res = await fetch(path, { method, headers: { ...(initData ? { Authorization: `tma ${initData}` } : {}), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw Object.assign(new Error('offline'), { code: 'offline' });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error ?? 'cert_unknown'), { code: data.error ?? (path === '/api/verify' ? 'cert_unknown' : 'generic') });
  return data;
}

export const publicVerify = (code) => call('POST', '/api/verify', { code });

export function httpApi(initData) {
  const go = (method, path, body) => call(method, path, body, initData);
  const id = (n) => Number(n);
  return {
    me: () => go('GET', '/api/me'),
    setLang: (lang) => go('POST', '/api/lang', { lang }),
    home: () => go('GET', '/api/home'),
    books: () => go('GET', '/api/books'),
    addBook: (book) => go('POST', '/api/books', { book }),
    book: (bid) => go('GET', `/api/books/${id(bid)}`),
    log: (bid, data) => go('POST', `/api/books/${id(bid)}/log`, data),
    review: (bid, text) => go('POST', `/api/books/${id(bid)}/review`, { text }),
    setGoal: (goal) => go('POST', '/api/goal', { goal }),
    setNudge: (nudge) => go('POST', '/api/nudge', { nudge }),
    stats: () => go('GET', '/api/stats'),
    clubs: () => go('GET', '/api/clubs'),
    createClub: (name) => go('POST', '/api/clubs', { name }),
    join: (code) => go('POST', '/api/clubs/join', { code }),
    club: (cid) => go('GET', `/api/clubs/${id(cid)}`),
    leave: (cid) => go('POST', `/api/clubs/${id(cid)}/leave`, {}),
    marathon: (cid, marathon) => go('POST', `/api/clubs/${id(cid)}/marathon`, { marathon }),
    clubSettings: (cid, data) => go('POST', `/api/clubs/${id(cid)}/settings`, data),
    removeMember: (cid, uid) => go('POST', `/api/clubs/${id(cid)}/members/${Math.trunc(Number(uid))}/remove`, {}),
    askProof: (lid) => go('POST', `/api/logs/${id(lid)}/ask`, {}),
    proof: (lid, text) => go('POST', `/api/logs/${id(lid)}/proof`, { text }),
    decide: (lid, accept) => go('POST', `/api/logs/${id(lid)}/decide`, { accept }),
    certs: () => go('GET', '/api/certs'),
    cert: (cid) => go('GET', `/api/certs/${id(cid)}`),
    certPng: (cid, png) => go('POST', `/api/certs/${id(cid)}/png`, { png }),
    verify: (code) => publicVerify(code),
  };
}
