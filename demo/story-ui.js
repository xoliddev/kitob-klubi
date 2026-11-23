// What the story "does with its fingers": taps, typing and scrolling inside the three phones' real Mini App
// screens, so the guided story shows the very same UI a person would use.
export function makeUi({ apps, phones, env, wait, uids: { MADINA, LEADER, SARDOR }, checker }) {
  const pane = (uid) => phones[uid].appRoot;
  const $ = (uid, sel) => pane(uid).querySelector(sel);
  async function until(uid, sel, ms = 6000) {
    for (let i = 0; i < ms / 50; i++) {
      const el = $(uid, sel);
      if (el && !el.disabled) return el;
      await wait(50);
    }
    throw new Error(`demo: ${sel} did not appear`);
  }
  async function scrollTo(uid, sel, gap = 70) {
    const el = await until(uid, sel);
    const root = pane(uid);
    root.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - gap), behavior: 'smooth' });
    await wait(500);
    return el;
  }
  const tap = async (uid, sel, gap = 160) => { (await scrollTo(uid, sel, gap)).click(); await wait(280); };
  async function type(el, value, slow = true) {
    el.focus?.();
    const v = String(value);
    if (slow) {
      for (let i = 1; i < v.length; i += 2) {
        el.value = v.slice(0, i);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await wait(26);
      }
    }
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.blur?.();
  }
  async function typeIn(uid, sel, value, { slow = true, gap = 140 } = {}) {
    await scrollTo(uid, sel, gap);
    await type($(uid, sel), value, slow);
  }
  const screenIs = async (uid, name) => { for (let i = 0; i < 120 && apps[uid].screen !== name; i++) await wait(50); };
  async function tab(uid, name) {
    if (apps[uid].verifying) await checker.close();
    await apps[uid].switchTab(name);
    await screenIs(uid, name);
  }
  async function club(uid) {
    if (apps[uid].screen !== 'club') {
      await tab(uid, 'clubs');
      await tap(uid, '[data-testid=club-1]');
      await screenIs(uid, 'club');
    }
    await until(uid, '[data-testid=club-screen]');
  }

  return {
    async addBook(id) {
      await tab(MADINA, 'home');
      await tap(MADINA, '[data-testid=add-book]');
      await until(MADINA, '[data-testid=add-form]');
      await tap(MADINA, `[data-testid=cat-${id}]`, 120);
      await screenIs(MADINA, 'book');
      await wait(500);
      await tab(MADINA, 'home');
    },
    async quickLog(uid, n) {
      if (apps[uid].screen !== 'home') await tab(uid, 'home');
      await typeIn(uid, '[data-testid=quick-n]', n, { gap: 220 });
      await wait(250);
      $(uid, '[data-testid=quick-send]').click();
      await wait(700);
      pane(uid).scrollTo({ top: 0, behavior: 'smooth' });
    },
    async home(uid) {
      if (apps[uid].screen !== 'home') await tab(uid, 'home');
      await until(uid, '[data-testid=hero]');
      pane(uid).scrollTo({ top: 0, behavior: 'smooth' });
    },
    async startMarathon() {
      await club(LEADER);
      await tap(LEADER, '[data-testid=m-preset-0]', 200);
      await wait(400);
      await tap(LEADER, '[data-testid=m-save]', 220);
      await until(LEADER, '[data-testid=marathon]');
      pane(LEADER).scrollTo({ top: 0, behavior: 'smooth' });
    },
    async join(uid, code) {
      await tab(uid, 'clubs');
      await typeIn(uid, '[data-testid=join-code]', `${code.slice(0, 4)}-${code.slice(4)}`, { gap: 200 });
      await tap(uid, '[data-testid=join-send]', 220);
      await screenIs(uid, 'club');
    },
    club,
    async judge(kind, lid) {
      await club(LEADER);
      await tap(LEADER, `[data-testid=flag-${kind}-${lid}]`, 200);
      await wait(400);
    },
    async writeProof(lid, text) {
      await tab(SARDOR, 'home');
      await typeIn(SARDOR, `[data-testid=proof-text-${lid}]`, text, { slow: false, gap: 160 });
      await wait(500);
      await tap(SARDOR, `[data-testid=proof-send-${lid}]`, 220);
    },
    async finishBook(bid, pages, review) {
      await tab(MADINA, 'books');
      await tap(MADINA, `[data-testid=book-${bid}]`);
      await screenIs(MADINA, 'book');
      await typeIn(MADINA, '[data-testid=b-page]', pages, { gap: 200 });
      $(MADINA, '[data-testid=b-page-send]').click();
      await until(MADINA, '[data-testid=review-form]');
      await wait(600);
      await typeIn(MADINA, '[data-testid=f-review]', review, { slow: false, gap: 200 });
      await wait(500);
      await tap(MADINA, '[data-testid=review-save]', 200);
      await until(MADINA, '[data-testid=book-review]');
      pane(MADINA).scrollTo({ top: 0, behavior: 'smooth' });
    },
    async stats(uid) {
      await tab(uid, 'more');
      await scrollTo(uid, '[data-testid=heatmap]', 120);
      await wait(900);
      await scrollTo(uid, '[data-testid=weekly]', 120);
    },
    async certificate(uid) {
      await tab(uid, 'more');
      const id = env.backend.certs(uid)[0].id;
      await tap(uid, `[data-testid=cert-${id}]`, 200);
      await until(uid, '[data-testid=cert-svg]');
      pane(uid).scrollTo({ top: 0, behavior: 'smooth' });
    },
    async verify(code) {
      const page = apps[SARDOR].verifying ? apps[SARDOR] : checker.open();
      await wait(300);
      const input = await until(SARDOR, '[data-testid=verify-input]');
      await type(input, code);
      await wait(300);
      $(SARDOR, '[data-testid=verify-go]').click();
      await until(SARDOR, '[data-testid=verify-ok], [data-testid=verify-bad]');
      return page;
    },
  };
}
