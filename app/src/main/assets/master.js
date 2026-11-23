/* APP MASTER — laboratório de fraude (pré-lançamento, só entre desenvolvedores).
   Injetado pelo app no site. Dama: melhor jogada. Sinuca: mira infinita com todas as alternativas.
   Dominó: todas as peças viradas para cima. Tudo fica registrado localmente para o analisador (Exportar).
   Só funciona quando o servidor marca a mesa como 100% desenvolvedores (LAB()). Não altera o site. */
(function () {
  'use strict';
  if (window.__master) return; window.__master = true;
  const LOGK = 'master_log_v1';
  const $ = s => document.querySelector(s);
  const LAB = () => typeof GM !== 'undefined' && !!GM.info; // sem trava: o mestre fica sempre disponível
  let LOG = []; try { LOG = JSON.parse(localStorage.getItem(LOGK) || '[]'); } catch (_) {}
  const saveLog = () => { try { localStorage.setItem(LOGK, JSON.stringify(LOG.slice(-20000))); } catch (_) {} };
  const log = ev => { LOG.push(Object.assign({ at: Date.now(), user: (typeof S !== 'undefined' && S.user) ? S.user.username : null, match: (typeof GM !== 'undefined' && GM.info) ? GM.info.id : null, game: (typeof GM !== 'undefined' && GM.kind) || null, assist: on }, ev)); saveLog(); };
  let on = true;
  const css = document.createElement('style');
  css.textContent = `*{-webkit-tap-highlight-color:transparent!important}*:focus,*:focus-visible{outline:none!important}canvas,iframe,.sq,.tile,button{-webkit-tap-highlight-color:transparent!important;outline:none!important}
#mst{position:fixed;left:8px;bottom:78px;z-index:99999;background:rgba(20,10,40,.92);color:#fff;border:1px solid #00e5ff;border-radius:12px;padding:6px 8px;font:600 12px system-ui;display:flex;gap:6px;align-items:center;max-width:92vw;flex-wrap:wrap}
#mst b{color:#00e5ff}#mst button{background:#1d1840;color:#fff;border:1px solid #4b4390;border-radius:8px;padding:4px 8px;font:600 12px system-ui}
#mst.lock{border-color:#ff5d6c}#mst.lock b{color:#ff5d6c}
.sq.mfrom{box-shadow:inset 0 0 0 5px #00e5ff!important}.sq.mto::before{content:"";position:absolute;inset:14%;border-radius:50%;border:5px solid #00e5ff;background:rgba(0,229,255,.28);z-index:3;pointer-events:none}`;
  document.head.appendChild(css);
  const pill = document.createElement('div'); pill.id = 'mst'; document.body.appendChild(pill);
  let info = '';
  const render = () => {
    const inGame = typeof GM !== 'undefined' && GM.info && !GM.over && S.page === 'jogo';
    const locked = inGame && !LAB();
    pill.className = locked ? 'lock' : '';
    pill.innerHTML = `<b>🎓 Mestre</b>` + (`<span id="mi">${esc(info)}</span><button id="mt">${on ? 'Ligado' : 'Desligado'}</button>${inGame && GM.kind === 'pool' ? '<button id="mn">Outra jogada ▶</button>' : ''}`) + `<button id="mx">Exportar (${LOG.length})</button><button id="mc">Limpar</button>`;
    const t = $('#mt'); if (t) t.onclick = () => { on = !on; log({ kind: 'toggle', on }); applyToggle(); render(); };
    const n = $('#mn'); if (n) n.onclick = () => nextAlt();
    $('#mx').onclick = exportLog; $('#mc').onclick = () => { if (confirm('Apagar o registro local?')) { LOG = []; saveLog(); render(); } };
  };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function exportLog() {
    const name = 'master-log-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
    const body = JSON.stringify({ exportedAt: new Date().toISOString(), device: navigator.userAgent, user: S.user && S.user.username, events: LOG });
    if (window.MasterBridge && window.MasterBridge.save) { window.MasterBridge.save(name, body); return; }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- DAMA: motor (alpha-beta com aprofundamento iterativo) em Web Worker ---------- */
  const WORKER_SRC = `
  onmessage = e => { const m = e.data; if (m.rules) { (0, eval)(m.rules); return; } search(m); };
  const clone = B => B.map(row => row.map(x => x && { id: x.id, p: x.p, k: x.k, r: x.r, c: x.c }));
  function ev(B, p) { let s = 0, mob = 0;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const x = B[r][c]; if (!x) continue;
      let v = x.k ? 330 : 100 + (x.p ? r : 7 - r) * 4; if (!x.k && (x.p ? r === 0 : r === 7)) v += 9; if (c === 0 || c === 7) v += x.k ? -4 : 2; if (r > 1 && r < 6 && c > 1 && c < 6) v += 3;
      s += x.p === p ? v : -v; }
    return s; }
  let deadline = 0, nodes = 0, stop = false;
  function nm(B, turn, depth, a, b, ply) {
    if ((++nodes & 255) === 0 && Date.now() > deadline) stop = true; if (stop) return 0;
    const L = Rules.legalMoves(B, turn); if (!L.length) return -100000 + ply;
    if (depth <= 0) { if (L[0].caps.length && depth > -6) { /* quiescência: continua nas capturas */ } else return ev(B, turn); }
    L.sort((x, y) => y.caps.length - x.caps.length);
    let best = -1e9;
    for (const m of L) { const N = clone(B); Rules.applyMove(N, m); const v = -nm(N, 1 - turn, depth - 1, -b, -a, ply + 1); if (stop) return 0;
      if (v > best) best = v; if (best > a) a = best; if (a >= b) break; }
    return best; }
  function search(m) {
    const B = Rules.toGrid(m.pieces), turn = m.turn; deadline = Date.now() + (m.ms || 1200); stop = false; nodes = 0;
    let root = Rules.legalMoves(B, turn); if (!root.length) return postMessage({ id: m.id, none: true });
    root.sort((x, y) => y.caps.length - x.caps.length); let done = null, depth = 0;
    for (depth = 1; depth <= 14; depth++) {
      let best = -1e9, bm = null, a = -1e9; const scored = [];
      for (const mv of root) { const N = clone(B); Rules.applyMove(N, mv); const v = -nm(N, 1 - turn, depth - 1, -1e9, -a, 1); if (stop) break; scored.push([mv, v]); if (v > best) { best = v; bm = mv; } if (best > a) a = best; }
      if (stop) break; done = { move: bm, score: best, depth }; root.sort((x, y) => (x === bm ? -1 : y === bm ? 1 : 0)); if (Math.abs(best) > 90000) break; }
    // ranking de todas as jogadas (busca rasa e exata, para saber se o jogador escolheu a melhor)
    const rk = root.map(mv => { const N = clone(B); Rules.applyMove(N, mv); return { f: mv.from, p: mv.path, s: -nm(N, 1 - turn, 3, -1e9, 1e9, 1) }; }); stop = false;
    rk.sort((x, y) => y.s - x.s);
    postMessage({ id: m.id, best: done && { from: done.move.from, path: done.move.path, caps: done.move.caps.length }, score: done && done.score, depth: done ? done.depth : 0, nodes, rank: rk.map(r => [r.f, r.p, r.s]) }); }`;
  let worker = null, wid = 0, wcb = null;
  function getWorker() {
    if (worker) return Promise.resolve(worker);
    return fetch('rules.js').then(r => r.text()).then(t => {
      worker = new Worker(URL.createObjectURL(new Blob([WORKER_SRC], { type: 'application/javascript' })));
      worker.onmessage = e => { if (wcb && e.data.id === wid) wcb(e.data); };
      worker.postMessage({ rules: t }); return worker;
    });
  }
  let damaKey = '', damaBest = null, damaShownAt = 0;
  function damaTick() {
    document.querySelectorAll('.sq.mfrom,.sq.mto').forEach(s => s.classList.remove('mfrom', 'mto'));
    if (!on || GM.over || GM.spec || !GM.B) return;
    const mine = GM.turn === GM.me && !GM.pend && !GM.busy;
    if (!mine) { damaKey = ''; return; }
    const pieces = Rules.pieces(GM.B), key = JSON.stringify(pieces) + GM.turn;
    if (key !== damaKey) {
      damaKey = key; damaBest = null; info = 'pensando…'; render();
      const id = ++wid;
      getWorker().then(w => { wcb = d => { if (d.id !== id || key !== damaKey) return; damaBest = d; damaShownAt = Date.now(); info = d.none ? '' : `melhor jogada · avaliação ${d.score > 0 ? '+' : ''}${d.score} · prof. ${d.depth}`; render(); log({ kind: 'suggest', move: d.best && [d.best.from, d.best.path], eval: d.score, depth: d.depth }); }; w.postMessage({ id, pieces, turn: GM.turn, ms: 1300 }); });
    }
    if (damaBest && damaBest.best) {
      const f = damaBest.best.from, q = (r, c) => document.querySelector(`.sq[data-r="${r}"][data-c="${c}"]`);
      const a = q(f[0], f[1]); if (a) a.classList.add('mfrom');
      for (const p of damaBest.best.path) { const e = q(p[0], p[1]); if (e) e.classList.add('mto'); }
    }
  }

  /* ---------- SINUCA: mira infinita + todas as alternativas (executa dentro do iframe da mesa) ---------- */
  function sinucaPatch() {
    if (window.__mPatched) return; window.__mPatched = true;
    const orig = drawAim; window.__mOn = true; let alts = [], altKey = '', sel = 0;
    const pts = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const segDist = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1; let t = ((px - ax) * dx + (py - ay) * dy) / l2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)); };
    const clear = (ax, ay, bx, by, skip) => { for (const b of G.balls) { if (b.out || skip.includes(b.n)) continue; if (segDist(b.x, b.y, ax, ay, bx, by) < 2 * R - 0.6) return false; } return true; };
    const inb = (x, y) => x >= L + R - 0.5 && x <= RT - R + 0.5 && y >= T + R - 0.5 && y <= BT - R + 0.5;
    const rails = { xmin: L + R, xmax: RT - R, ymin: T + R, ymax: BT - R };
    function compute() {
      const cue = cueBall(), out = [], tg = legalTargets();
      for (const t of tg) for (let k = 0; k < POCKETS.length; k++) {
        const P = POCKETS[k], cands = [{ tx: P.x, ty: P.y, bank: null, f: 1 }];
        cands.push({ tx: 2 * rails.xmin - P.x, ty: P.y, bank: 'L', f: .62 }, { tx: 2 * rails.xmax - P.x, ty: P.y, bank: 'R', f: .62 }, { tx: P.x, ty: 2 * rails.ymin - P.y, bank: 'T', f: .62 }, { tx: P.x, ty: 2 * rails.ymax - P.y, bank: 'B', f: .62 });
        for (const c of cands) {
          let dx = c.tx - t.x, dy = c.ty - t.y; const dl = Math.hypot(dx, dy); if (dl < 1) continue; dx /= dl; dy /= dl;
          const gx = t.x - dx * 2 * R, gy = t.y - dy * 2 * R; if (!inb(gx, gy)) continue;
          let q = null;
          if (c.bank) { // ponto da tabela onde a bola-objeto bate
            const tt = c.bank === 'L' ? (rails.xmin - t.x) / dx : c.bank === 'R' ? (rails.xmax - t.x) / dx : c.bank === 'T' ? (rails.ymin - t.y) / dy : (rails.ymax - t.y) / dy;
            if (!(tt > 2 * R * 0.6)) continue; q = { x: t.x + dx * tt, y: t.y + dy * tt }; if (!inb(q.x, q.y)) continue;
            if (!clear(t.x, t.y, q.x, q.y, [0, t.n]) || !clear(q.x, q.y, P.x, P.y, [0, t.n])) continue;
          } else {
            if (!clear(t.x, t.y, P.x, P.y, [0, t.n])) continue;
            const nx = MX - P.x, ny = MY - P.y, nl = Math.hypot(nx, ny) || 1; if ((dx * nx + dy * ny) / nl < .28) continue;
          }
          if (!clear(cue.x, cue.y, gx, gy, [0, t.n])) continue;
          let ux = gx - cue.x, uy = gy - cue.y; const ul = Math.hypot(ux, uy); if (ul < 2 * R * .5) continue; ux /= ul; uy /= ul;
          const cos = ux * dx + uy * dy; if (cos < .17) continue;
          const dist = ul + dl, score = c.f * (cos * .72 - dist / 2400 * .5 + .2);
          out.push({ n: t.n, pocket: k, bank: c.bank, angle: Math.atan2(uy, ux), g: { x: gx, y: gy }, t: { x: t.x, y: t.y }, q, end: P, cos, power: Math.min(1, .28 + dist / 1500), score });
        }
      }
      out.sort((a, b) => b.score - a.score); return out;
    }
    function ensure() { const cue = cueBall(); const key = G.balls.map(b => b.n + ':' + Math.round(b.x) + ',' + Math.round(b.y) + (b.out ? 'o' : '')).join('|') + G.turn + G.mode; if (key !== altKey) { altKey = key; alts = compute(); sel = 0; window.__mAlts = alts; window.__mSel = 0; if (alts.length && G.phase === 'aim') G.aim = alts[0].angle; } }
    window.__mNext = () => { if (!alts.length) return; sel = (sel + 1) % alts.length; window.__mSel = sel; G.aim = alts[sel].angle; };
    function trace(g, x, y, dx, dy, col) { // linha infinita: reflete nas tabelas até cair numa caçapa
      let cx = x, cy = y; g.strokeStyle = col; g.lineWidth = 1.6; g.setLineDash([]);
      for (let i = 0; i < 40; i++) {
        let tw = 1e9, wall = 0;
        if (dx > 1e-6) { const t = (rails.xmax - cx) / dx; if (t < tw) { tw = t; wall = 1; } } else if (dx < -1e-6) { const t = (rails.xmin - cx) / dx; if (t < tw) { tw = t; wall = 1; } }
        if (dy > 1e-6) { const t = (rails.ymax - cy) / dy; if (t < tw) { tw = t; wall = 2; } } else if (dy < -1e-6) { const t = (rails.ymin - cy) / dy; if (t < tw) { tw = t; wall = 2; } }
        let hit = null, best = tw; for (const b of G.balls) { if (b.out || b.n === 0) continue; const fx = b.x - cx, fy = b.y - cy, pr = fx * dx + fy * dy; if (pr <= 1) continue; const d2 = fx * fx + fy * fy - pr * pr; if (d2 >= 4 * R * R) continue; const t = pr - Math.sqrt(4 * R * R - d2); if (t >= 0 && t < best) { best = t; hit = b; } }
        const ex = cx + dx * best, ey = cy + dy * best;
        let pk = false; for (const P of POCKETS) { if (segDist(P.x, P.y, cx, cy, ex, ey) < P.r * .7) { pk = true; break; } }
        g.beginPath(); g.moveTo(cx, cy); g.lineTo(ex, ey); g.stroke();
        if (pk || hit) { if (hit) { g.beginPath(); g.arc(ex, ey, R, 0, 7); g.stroke(); } break; }
        if (wall === 1) dx = -dx; else dy = -dy; cx = ex; cy = ey;
      }
    }
    drawAim = function (g, cue) {
      if (!window.__mOn) return orig(g, cue);
      ensure();
      const dx = Math.cos(G.aim), dy = Math.sin(G.aim);
      g.save(); g.lineCap = 'round';
      // alternativas (verde = melhor, vermelho = pior); a selecionada em destaque
      alts.slice().reverse().forEach((a, ri) => { const i = alts.length - 1 - ri, s = i === sel, q = Math.max(0, Math.min(1, (a.score + .1) / .9)), col = `hsl(${Math.round(q * 120)},90%,55%)`;
        g.globalAlpha = s ? 1 : .38; g.strokeStyle = col; g.lineWidth = s ? 3.5 : 1.3; g.setLineDash(s ? [] : [6, 6]);
        g.beginPath(); g.moveTo(cue.x, cue.y); g.lineTo(a.g.x, a.g.y); g.stroke(); g.beginPath(); g.arc(a.g.x, a.g.y, R, 0, 7); g.stroke();
        g.beginPath(); g.moveTo(a.t.x, a.t.y); if (a.q) g.lineTo(a.q.x, a.q.y); g.lineTo(a.end.x, a.end.y); g.stroke();
        if (s || i === 0) { g.setLineDash([]); g.fillStyle = col; g.font = 'bold 22px system-ui'; g.fillText(i === 0 ? '★' : '●', a.t.x - 8, a.t.y - R - 6); }
      });
      g.globalAlpha = 1; g.setLineDash([]);
      // linha de mira infinita (a atual), com todas as colisões e rebatidas
      const h = castRay(cue.x, cue.y, dx, dy);
      g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 2;
      trace(g, cue.x, cue.y, dx, dy, 'rgba(255,255,255,.95)');
      // trajetória da bola-objeto e da branca depois do choque
      if (h.ball) { const ex = cue.x + dx * h.t, ey = cue.y + dy * h.t, bx = h.ball.x - ex, by = h.ball.y - ey, bl = Math.hypot(bx, by) || 1, nx = bx / bl, ny = by / bl;
        trace(g, h.ball.x, h.ball.y, nx, ny, '#ffb23e'); const dn = dx * nx + dy * ny, tx = dx - dn * nx, ty = dy - dn * ny, tl = Math.hypot(tx, ty); if (tl > .05) trace(g, ex, ey, tx / tl, ty / tl, 'rgba(120,200,255,.9)'); }
      const a = alts[sel]; if (a) { g.fillStyle = '#fff'; g.font = 'bold 20px system-ui'; g.fillText(`${sel + 1}/${alts.length} · força sugerida ${Math.round(a.power * 100)}%${a.bank ? ' · tabela' : ''}`, L + 12, T - 14); }
      g.restore();
    };
    window.__mUnpatch = () => { window.__mOn = false; };
  }
  function nextAlt() { try { const w = $('#pf').contentWindow; w.__mNext && w.__mNext(); } catch (_) {} }
  let sinSrc = null;
  function sinucaTick() {
    const f = $('#pf'); if (!f) return;
    // a mesa roda dentro de uma função fechada: recarregamos a mesma página (mesma origem) com o código do mestre dentro dela
    if (f.dataset.mp !== '1' && /sinuca\.html/.test(f.src)) {
      f.dataset.mp = '1';
      (sinSrc ? Promise.resolve(sinSrc) : fetch('sinuca.html').then(r => r.text()).then(t => (sinSrc = t))).then(t => {
        const i = t.lastIndexOf('})();'); if (i < 0) return;
        const html = t.slice(0, i) + '\n;(' + sinucaPatch.toString() + ')();\n' + t.slice(i);
        f.src = URL.createObjectURL(new Blob([html.replace(/<head>/i, '<head><base href="' + location.origin + '/">')], { type: 'text/html' }));
      }).catch(() => { f.dataset.mp = ''; });
      return;
    }
    const w = f.contentWindow; if (!w) return;
    try {
      if (!w.__mPatched) return;
      w.__mOn = on && !GM.over && !GM.spec && !!LAB();
      const a = w.__mAlts, s = w.__mSel || 0; info = a ? (a.length ? `${a.length} alternativas · selecionada ${s + 1}` : 'sem tacada direta livre') : '';
    } catch (e) { window.__mErr = String(e && e.message || e); }
  }

  /* ---------- DOMINÓ: peças que ainda não apareceram (tudo que não está na sua mão nem na mesa), viradas para cima ---------- */
  let domBox = null, domHands = null, labSent = '';
  const mkey = () => String((window.MasterBridge && window.MasterBridge.key && window.MasterBridge.key()) || localStorage.getItem('master_key') || '');
  const pushHands = () => { const f = $('#pf'); if (f && f.contentWindow) try { f.contentWindow.postMessage({ k: 'dreveal', m: { hands: on ? domHands : null } }, location.origin); } catch (_) {} };
  function domTick() {
    if (GM.kind !== 'domino' || GM.spec || GM.over || !GM.info || !GM.dom) { if (domBox) { domBox.remove(); domBox = null; } return; }
    const k = GM.info.id + ':' + on; if (labSent !== k && S.ws && S.ws.readyState === 1) { labSent = k; S.ws.send(JSON.stringify({ t: 'labassist', on, key: mkey() })); if (!on) { domHands = null; pushHands(); } }
    if (on && domHands) { if (domBox) { domBox.remove(); domBox = null; } info = 'todas as peças à mostra'; return; } // mãos reais recebidas
    if (domHands === null && on) pushHands();
    const seen = new Set(), key = t => Math.min(t[0], t[1]) + '' + Math.max(t[0], t[1]);
    (GM.dom.hand || []).forEach(t => seen.add(key(t))); (GM.dom.chain || []).forEach(t => seen.add(key(t)));
    const un = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) if (!seen.has(a + '' + b)) un.push([a, b]);
    if (!on) { if (domBox) { domBox.remove(); domBox = null; } return; }
    if (!domBox) { domBox = document.createElement('div'); domBox.style.cssText = 'position:fixed;right:14px;top:140px;z-index:99998;background:rgba(20,10,40,.92);border:1px solid #00e5ff;border-radius:12px;padding:6px 8px;color:#fff;font:600 12px system-ui;max-width:48vw'; document.body.appendChild(domBox); }
    const cnt = Array(7).fill(0); un.forEach(t => { cnt[t[0]]++; if (t[1] !== t[0]) cnt[t[1]]++; });
    domBox.innerHTML = `<b style="color:#00e5ff">Fora da sua mão e da mesa (${un.length})</b><div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:4px">${un.map(t => `<span style="background:#f4efe0;color:#111;border-radius:4px;padding:1px 5px">${t[0]}|${t[1]}</span>`).join('')}</div><div style="margin-top:3px;opacity:.85">por número: ${cnt.map((c, i) => i + '×' + c).join(' ')}</div>`;
    info = `${un.length} peças desconhecidas (mãos adversárias + sono)`;
  }
  function applyToggle() { damaKey = ''; labSent = ''; pushHands(); try { const w = $('#pf') && $('#pf').contentWindow; if (w) w.__mOn = on; } catch (_) {} }
  function hookWs() {
    const ws = S.ws; if (!ws || ws.__mh) return; ws.__mh = true;
    ws.addEventListener('message', e => { let m; try { m = JSON.parse(e.data); } catch (_) { return; } if (m.t === 'dlab') { domHands = m.hands; pushHands(); } else if (m.t === 'game') { domHands = null; labSent = ''; } });
    const send = ws.send.bind(ws);
    ws.send = d => { try { onOut(JSON.parse(d)); } catch (_) {} return send(d); };
  }

  /* ---------- registro das jogadas (gabarito para o analisador) ---------- */
  let turnAt = 0, lastTurnKey = '';
  function onOut(m) {
    if (typeof GM === 'undefined' || !GM.info || !LAB()) return;
    const ms = Date.now() - (turnAt || Date.now());
    if (m.t === 'move') {
      const b = damaBest && damaBest.best, same = b && JSON.stringify(b.from) === JSON.stringify(m.from) && JSON.stringify(b.path) === JSON.stringify(m.path);
      let rank = null; if (damaBest && damaBest.rank) rank = damaBest.rank.findIndex(r => JSON.stringify(r[0]) === JSON.stringify(m.from) && JSON.stringify(r[1]) === JSON.stringify(m.path)) + 1 || null;
      log({ kind: 'move', followed: !!same, rank, n: damaBest && damaBest.rank ? damaBest.rank.length : null, ms, move: [m.from, m.path] });
    } else if (m.t === 'shot') {
      const w = $('#pf') && $('#pf').contentWindow, a = w && w.__mAlts && w.__mAlts[w.__mSel || 0];
      let diff = null, near = null; if (w && w.__mAlts && w.__mAlts.length) { diff = a ? Math.abs(((m.angle - a.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI) : null; near = Math.min(...w.__mAlts.map(x => Math.abs(((m.angle - x.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI))); }
      log({ kind: 'shot', angle: m.angle, power: m.power, ms, followed: near != null && near < 0.012, n: w && w.__mAlts ? w.__mAlts.length : null });
    } else if (m.t === 'dplay' || m.t === 'ddraw') log({ kind: m.t, ms, move: m.t === 'dplay' ? [m.a, m.b, m.side] : null });
    else if (m.t === 'resign') log({ kind: 'resign' });
  }

  /* ---------- laço principal ---------- */
  setInterval(() => {
    try {
      if (typeof GM === 'undefined' || typeof S === 'undefined') return;
      hookWs();
      const inGame = GM.info && !GM.over && S.page === 'jogo';
      const tk = inGame ? GM.info.id + ':' + GM.turn : ''; if (tk !== lastTurnKey) { lastTurnKey = tk; turnAt = Date.now(); }
      if (!inGame) { if (info) { info = ''; render(); } return; }
      if (!LAB()) { render(); return; }
      const before = info;
      if (GM.kind === 'dama') damaTick(); else if (GM.kind === 'pool') sinucaTick(); else if (GM.kind === 'domino') domTick();
      if (info !== before || !$('#mi')) render();
    } catch (_) {}
  }, 350);
  render();
})();
