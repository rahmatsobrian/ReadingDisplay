/* Reading Display — WebUI */
(() => {
  'use strict';

  const C = window.RDColor;
  const MODDIR = '/data/adb/modules/reading_display';
  const DATA = '/data/adb/reading_display';
  const RD = `sh ${MODDIR}/bin/rdctl`;
  const HAS_KSU = !!(window.ksu && typeof window.ksu.exec === 'function');

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isPkg = (s) => /^[A-Za-z0-9._]+$/.test(s);

  /* ------------------------------------------------------------------ */
  /*  State                                                              */
  /* ------------------------------------------------------------------ */
  const DEFAULTS = () => ({
    v: 2,
    reading: { on: false, sat: 0, warm: 0, dim: 100, preset: 'klasik' },
    engine: 'matrix', boot: true, auto: false, interval: 3, apps: [],
  });

  const PRESETS = [
    { id: 'klasik', name: 'Abu-abu klasik', sat: 0, warm: 0, dim: 100 },
    { id: 'kertas', name: 'Kertas hangat', sat: 0, warm: 35, dim: 92 },
    { id: 'eink', name: 'E-ink lembut', sat: 0, warm: 12, dim: 80 },
    { id: 'malam', name: 'Malam hari', sat: 8, warm: 60, dim: 62 },
    { id: 'lembut', name: 'Warna lembut', sat: 55, warm: 20, dim: 95 },
  ];

  let state = DEFAULTS();
  let status = {};

  const getP = (path) => path.split('.').reduce((o, k) => o[k], state);
  const setP = (path, val) => {
    const ks = path.split('.'); const last = ks.pop();
    ks.reduce((o, k) => o[k], state)[last] = val;
  };

  // profil lama (v1) yang masih berisi "calib" dibaca tanpa error; bagian itu diabaikan
  function mergeProfile(p) {
    const d = DEFAULTS();
    if (!p || typeof p !== 'object') return d;
    const num = (v, a, b, def) => (Number.isFinite(+v) ? C.clamp(+v, a, b) : def);
    const r = p.reading || {};
    d.reading = {
      on: !!r.on, sat: num(r.sat, 0, 100, 0), warm: num(r.warm, 0, 100, 0),
      dim: num(r.dim, 40, 100, 100), preset: typeof r.preset === 'string' ? r.preset : '',
    };
    d.engine = p.engine === 'system' ? 'system' : 'matrix';
    d.boot = p.boot !== false;
    d.auto = !!p.auto;
    d.interval = num(p.interval, 1, 10, 3);
    return d;
  }

  /* ------------------------------------------------------------------ */
  /*  Jembatan ke root shell (ksu.exec) + mode demo                       */
  /* ------------------------------------------------------------------ */
  let cbId = 0;
  function exec(cmd, opts = {}) {
    return new Promise((resolve) => {
      const name = `rd_cb_${Date.now()}_${cbId++}`;
      window[name] = (errno, stdout, stderr) => {
        resolve({ errno, stdout: String(stdout == null ? '' : stdout), stderr: String(stderr == null ? '' : stderr) });
        try { delete window[name]; } catch (e) { window[name] = undefined; }
      };
      try { window.ksu.exec(cmd, JSON.stringify(opts), name); }
      catch (e) { resolve({ errno: -1, stdout: '', stderr: String(e) }); try { delete window[name]; } catch (_) {} }
    });
  }

  function parseKV(text) {
    const out = {};
    String(text).split('\n').forEach((l) => {
      const i = l.indexOf('=');
      if (i > 0) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
    });
    return out;
  }

  const realBridge = {
    async load() {
      // echo kosong sebelum penanda: profile.json tidak berakhir newline
      const r = await exec(`cat ${DATA}/profile.json 2>/dev/null; echo; echo '@@'; ${RD} apps-get 2>/dev/null; echo '@@'; ${RD} status`);
      const parts = r.stdout.split(/^@@$/m);
      let profile = null;
      try { profile = JSON.parse((parts[0] || '').trim()); } catch (e) { /* belum ada profil */ }
      const apps = (parts[1] || '').split('\n').map((s) => s.trim()).filter(isPkg);
      const st = parseKV(parts[2] || '');
      if (!profile && st.enabled !== undefined) {
        profile = { reading: { on: st.enabled === '1' }, engine: st.engine, boot: st.boot !== '0', auto: st.auto === '1', interval: +st.interval || 3 };
      }
      return { profile, apps, status: st, error: r.errno !== 0 && !st.version ? (r.stderr || 'gagal membaca status') : '' };
    },
    async save(st, m) {
      const json = JSON.stringify({ v: 2, reading: st.reading, engine: st.engine, boot: st.boot, auto: st.auto, interval: st.interval });
      const b64 = btoa(json);
      const apps = st.apps.filter(isPkg).join(' ');
      const save = [`${RD} save`, st.reading.on ? 1 : 0, st.engine, st.boot ? 1 : 0, st.auto ? 1 : 0,
        Math.round(st.interval), ...m, b64].join(' ');
      const r = await exec(`${RD} apps-set ${apps} >/dev/null 2>&1; ${save}`);
      const kv = parseKV(r.stdout);
      if (kv.error) return { error: kv.error };
      return { status: kv };
    },
    live(m) { return exec(`service call SurfaceFlinger 1015 i32 1 ${m.map((v) => 'f ' + v).join(' ')} >/dev/null 2>&1`); },
    async status() { return parseKV((await exec(`${RD} status`)).stdout); },
    async probe() { return parseKV((await exec(`${RD} probe`)).stdout); },
    async reset() { return parseKV((await exec(`${RD} reset`)).stdout); },
    async pkgs() {
      const r = await exec(`${RD} pkgs`);
      return r.stdout.split('\n').map((l) => l.trim()).filter((l) => /^[us]:/.test(l))
        .map((l) => ({ pkg: l.slice(2), system: l[0] === 's' })).filter((p) => isPkg(p.pkg));
    },
  };

  const demoBridge = (() => {
    const KEY = 'rd_demo_state';
    const apply16 = (m) => {
      const shell = $('#shell');
      if (!m) { shell.style.filter = ''; return; }
      $('#rdGlobalM').setAttribute('values', C.svgValues(m));
      shell.style.filter = 'url(#rdGlobal)';
    };
    const fake = (st) => ({
      version: 'v1.1.0 (demo)', device: 'Browser (demo)', android: '-', api: '-', engine: st.engine,
      enabled: st.reading.on ? '1' : '0', boot: st.boot ? '1' : '0',
      auto: st.auto ? '1' : '0', interval: String(st.interval), mode: st.reading.on ? 'read' : 'off',
      watcher: 'stopped (demo)', fg: '', sf_ok: '', sf: 'mode demo: tanpa SurfaceFlinger',
    });
    return {
      async load() {
        let saved = null;
        try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
        const st = mergeProfile(saved);
        return { profile: st, apps: (saved && saved.apps) || ['org.readera'], status: fake(st), error: '' };
      },
      async save(st, m) {
        try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
        apply16(st.reading.on ? m : null);
        return { status: fake(st) };
      },
      async live(m) { apply16(m); },
      async status() { return fake(state); },
      async probe() { return { probe: 'demo', probe_raw: 'tidak ada SurfaceFlinger di browser' }; },
      async reset() { apply16(null); return { reset: 'ok' }; },
      async pkgs() {
        return [
          ['org.readera', 0], ['com.amazon.kindle', 0], ['com.flyersoft.moonreader', 0], ['eu.kanade.tachiyomi', 0],
          ['wp.wattpad', 0], ['com.google.android.apps.books', 0], ['com.android.chrome', 1], ['com.android.settings', 1],
        ].map(([pkg, s]) => ({ pkg, system: !!s }));
      },
      initialApply(st, m) { apply16(st.reading.on ? m : null); },
    };
  })();

  const bridge = HAS_KSU ? realBridge : demoBridge;

  /* ------------------------------------------------------------------ */
  /*  Toast                                                              */
  /* ------------------------------------------------------------------ */
  let toastTimer;
  function toast(msg) {
    const el = $('#snack');
    el.textContent = msg; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* ------------------------------------------------------------------ */
  /*  Animasi bentuk "cookie" (spring)                                    */
  /* ------------------------------------------------------------------ */
  const cookie = { amp: 0, rot: 0, raf: 0 };
  function cookiePath(a) {
    const n = 10, R = 44, pts = [];
    for (let i = 0; i <= 160; i++) {
      const th = (i / 160) * Math.PI * 2;
      const r = R * (1 + a * Math.cos(n * th));
      pts.push(`${(50 + r * Math.cos(th)).toFixed(2)},${(50 + r * Math.sin(th)).toFixed(2)}`);
    }
    return 'M' + pts.join('L') + 'Z';
  }
  function drawCookie() {
    $('#cookiePath').setAttribute('d', cookiePath(cookie.amp));
    $('#cookiePath').setAttribute('transform', `rotate(${cookie.rot.toFixed(2)} 50 50)`);
  }
  function springCookie(on, instant) {
    const tAmp = on ? 0.085 : 0, tRot = on ? 18 : 0;
    cancelAnimationFrame(cookie.raf);
    if (instant || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      cookie.amp = tAmp; cookie.rot = tRot; drawCookie(); return;
    }
    let va = 0, vr = 0, last = performance.now();
    const step = (t) => {
      const dt = Math.min(0.032, (t - last) / 1000); last = t;
      va += (-170 * (cookie.amp - tAmp) - 11 * va) * dt; cookie.amp += va * dt;
      vr += (-120 * (cookie.rot - tRot) - 9 * vr) * dt; cookie.rot += vr * dt;
      drawCookie();
      if (Math.abs(va) > 0.002 || Math.abs(cookie.amp - tAmp) > 0.0008 || Math.abs(vr) > 0.05 || Math.abs(cookie.rot - tRot) > 0.05) {
        cookie.raf = requestAnimationFrame(step);
      } else { cookie.amp = tAmp; cookie.rot = tRot; drawCookie(); }
    };
    cookie.raf = requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  const FMT = {
    pct: (v) => `${Math.round(v)}%`,
    sat: (v) => (v <= 0 ? '0% · abu-abu penuh' : `${Math.round(v)}%`),
    sec: (v) => `${Math.round(v)} dtk`,
  };

  let lastHeroOn = null;

  function render() {
    // slider
    $$('.slider').forEach((el) => {
      const v = getP(el.dataset.key);
      const inp = $('input', el);
      if (!el.dataset.init) {
        inp.min = el.dataset.min; inp.max = el.dataset.max; inp.step = el.dataset.step || 1;
        el.dataset.init = '1';
      }
      if (parseFloat(inp.value) !== v) inp.value = v;
      const min = +el.dataset.min, max = +el.dataset.max;
      el.style.setProperty('--p', (((v - min) / (max - min)) * 100).toFixed(2));
      $('output', el).textContent = (FMT[el.dataset.fmt] || FMT.pct)(v);
      if (el.dataset.key.startsWith('reading.')) el.classList.toggle('disabled', state.engine === 'system');
    });

    // hero
    const on = state.reading.on;
    $('#hero').classList.toggle('on', on);
    $('#heroBtn').setAttribute('aria-pressed', String(on));
    $('#heroBtn').setAttribute('aria-label', on ? 'Matikan mode baca' : 'Nyalakan mode baca');
    $('#heroTitle').textContent = on ? 'Mode baca aktif' : 'Mode baca mati';
    $('#heroSub').textContent = on
      ? (state.engine === 'system' ? 'Layar monokrom lewat pengaturan aksesibilitas sistem.'
        : `Saturasi ${Math.round(state.reading.sat)}% · hangat ${Math.round(state.reading.warm)}% · kecerahan ${Math.round(state.reading.dim)}%`)
      : 'Ketuk bentuk di samping untuk mengubah layar jadi abu-abu.';
    if (lastHeroOn !== on) { springCookie(on, lastHeroOn === null); lastHeroOn = on; }

    // preset
    $$('#presets .chip').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === state.reading.preset)));

    // status pill
    const pill = $('#statusPill');
    pill.className = 'pill' + (on ? ' on' : '');
    pill.textContent = (HAS_KSU ? '' : 'Demo · ') + (on ? 'Baca aktif' : 'Mati');

    // switch / seg
    setSwitch('#swBoot', state.boot);
    setSwitch('#swAuto', state.auto);
    $$('#segEngine button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === state.engine)));
    $('#engineHelp').textContent = state.engine === 'system'
      ? 'Pakai mode monokrom bawaan Android (aksesibilitas). Stabil dan ikut Night Light, tapi hanya abu-abu penuh; slider tidak berlaku.'
      : 'Mengirim matriks warna 4×4 ke SurfaceFlinger: saturasi, kehangatan, dan kecerahan, semua live.';
    $('#engineNote').textContent = state.engine === 'system'
      ? 'Engine “Monokrom sistem” tidak mendukung slider. Pindah ke “Matriks penuh” di tab Otomatis.'
      : 'Geser slider: layar berubah seketika.';

    // pratinjau lokal (hanya bila mode baca belum aktif di layar)
    const stage = $('#previewStage');
    if (state.reading.on) {
      stage.style.filter = '';
      $('#previewNote').textContent = 'Pratinjau memakai layar asli: efek sudah aktif di seluruh layar.';
    } else {
      $('#rdPrevM').setAttribute('values', C.svgValues(C.readingMatrix(state)));
      stage.style.filter = 'url(#rdPrev)';
      $('#previewNote').textContent = 'Simulasi pratinjau. Nyalakan mode baca untuk menerapkan ke seluruh layar.';
    }

    renderApps();
  }

  function setSwitch(sel, on) { $(sel).setAttribute('aria-checked', String(!!on)); }

  function renderApps() {
    const box = $('#appChips');
    box.innerHTML = '';
    if (!state.apps.length) {
      box.innerHTML = '<span class="muted small">Belum ada aplikasi dipilih.</span>';
      return;
    }
    state.apps.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip app'; b.textContent = p; b.title = 'Ketuk untuk hapus';
      b.addEventListener('click', () => { state.apps = state.apps.filter((x) => x !== p); renderApps(); scheduleCommit(200); });
      box.appendChild(b);
    });
  }

  function renderStatus() {
    const s = status || {};
    const modeTxt = { read: 'Baca', off: 'Mati' }[s.mode] || '-';
    const sfTxt = s.sf_ok === '1' ? 'OK' : s.sf_ok === '0' ? 'Tidak ada respons OK' : '-';
    const rows = [
      ['Versi', s.version || '-'], ['Perangkat', s.device || '-'], ['Android', s.android ? `${s.android} (API ${s.api})` : '-'],
      ['Engine', s.engine || state.engine], ['Mode efektif', modeTxt], ['SurfaceFlinger', sfTxt],
      ['Balasan SF', s.sf || '-'],
      ['Watcher', s.watcher || '-'], ['App di depan', s.fg || '-'],
    ];
    $('#statusList').innerHTML = rows.map(() => '<dt></dt><dd></dd>').join('');
    $$('#statusList dt').forEach((dt, i) => { dt.textContent = rows[i][0]; });
    $$('#statusList dd').forEach((dd, i) => { dd.textContent = rows[i][1]; });
    if (s.sf_ok === '0' && state.engine === 'matrix') {
      const pill = $('#statusPill'); pill.classList.add('warn'); pill.textContent = 'Engine tak merespons';
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Apply live & commit                                                */
  /* ------------------------------------------------------------------ */
  let liveBusy = false, livePending = false;
  function liveApply() {
    if (state.engine !== 'matrix' || !state.reading.on) return;
    livePending = true;
    if (!liveBusy) pump();
  }
  async function pump() {
    liveBusy = true;
    while (livePending) {
      livePending = false;
      if (state.reading.on) await bridge.live(C.readingMatrix(state));
      await sleep(30);
    }
    liveBusy = false;
  }

  let commitTimer = null;
  function scheduleCommit(ms = 350) { clearTimeout(commitTimer); commitTimer = setTimeout(commit, ms); }
  async function commit() {
    clearTimeout(commitTimer);
    const res = await bridge.save(state, C.readingMatrix(state));
    if (res.error) { toast(`Gagal menyimpan: ${res.error}`); return; }
    status = res.status || status;
    renderStatus();
    if (status.sf_ok === '0' && state.engine === 'matrix' && state.reading.on) {
      toast('SurfaceFlinger tidak membalas OK. Coba engine “Monokrom sistem”.');
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Interaksi                                                          */
  /* ------------------------------------------------------------------ */
  function onSlider(el, val) {
    const path = el.dataset.key;
    setP(path, val);
    if (path.startsWith('reading.')) state.reading.preset = '';
    render();
    liveApply();
  }

  function bindSliders() {
    $$('.slider').forEach((el) => {
      const inp = $('input', el);
      inp.addEventListener('input', () => onSlider(el, parseFloat(inp.value)));
      inp.addEventListener('change', () => scheduleCommit(150));
    });
  }

  function buildPresets() {
    const box = $('#presets');
    PRESETS.forEach((p) => {
      const b = document.createElement('button');
      b.className = 'chip'; b.dataset.id = p.id; b.setAttribute('role', 'radio'); b.textContent = p.name;
      b.addEventListener('click', () => {
        Object.assign(state.reading, { sat: p.sat, warm: p.warm, dim: p.dim, preset: p.id });
        render(); liveApply(); scheduleCommit(150);
      });
      box.appendChild(b);
    });
  }

  function bindNav() {
    $$('#nav button').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.page;
      $$('#nav button').forEach((x) => x.classList.toggle('active', x === b));
      $$('.page').forEach((p) => p.classList.toggle('active', p.id === `page-${id}`));
      $('#pageTitle').textContent = $(`#page-${id}`).dataset.title;
      $('#scroller').scrollTo({ top: 0 });
      if (id === 'info') refreshStatus();
    }));
  }

  async function refreshStatus() {
    status = await bridge.status();
    renderStatus();
  }

  function bindActions() {
    $('#heroBtn').addEventListener('click', () => {
      state.reading.on = !state.reading.on;
      render(); commit();
    });
    $('#swBoot').addEventListener('click', () => { state.boot = !state.boot; render(); commit(); });
    $('#swAuto').addEventListener('click', () => {
      state.auto = !state.auto; render(); commit();
      if (state.auto && !state.apps.length) toast('Pilih aplikasi baca terlebih dahulu');
    });
    $$('#segEngine button').forEach((b) => b.addEventListener('click', () => {
      state.engine = b.dataset.v; render(); commit();
    }));
    $('#btnRefresh').addEventListener('click', async () => { await refreshStatus(); toast('Status diperbarui'); });
    $('#btnProbe').addEventListener('click', async () => {
      toast('Layar akan abu-abu selama 2 detik…');
      const r = await bridge.probe();
      toast(r.probe === 'ok' ? 'Balasan OK. Kalau layar tadi abu-abu, engine bekerja.'
        : r.probe === 'demo' ? 'Mode demo: tidak ada SurfaceFlinger'
        : 'SurfaceFlinger menolak panggilan. Coba engine “Monokrom sistem”.');
      refreshStatus();
    });
    $('#btnReset').addEventListener('click', async () => {
      state.reading.on = false; state.auto = false;
      render(); await bridge.reset(); await commit(); toast('Semua efek dimatikan');
    });
    bindSheet();
  }

  /* ------------------------------------------------------------------ */
  /*  Pemilih aplikasi                                                   */
  /* ------------------------------------------------------------------ */
  let pkgCache = null, showSystem = false;
  const SUGGEST = ['com.google.android.apps.books', 'com.amazon.kindle', 'com.flyersoft.moonreader', 'org.readera', 'eu.kanade.tachiyomi', 'wp.wattpad'];

  function bindSheet() {
    $('#btnPickApps').addEventListener('click', openSheet);
    $('#scrim').addEventListener('click', closeSheet);
    $('#sheetDone').addEventListener('click', closeSheet);
    $('#appSearch').addEventListener('input', renderAppList);
    $('#chipSystem').addEventListener('click', () => {
      showSystem = !showSystem; $('#chipSystem').setAttribute('aria-pressed', String(showSystem)); renderAppList();
    });
  }
  async function openSheet() {
    $('#scrim').hidden = false; $('#sheet').hidden = false;
    $('#appList').innerHTML = '<div class="empty">Memuat daftar aplikasi…</div>';
    if (!pkgCache) pkgCache = await bridge.pkgs();
    renderAppList();
  }
  function closeSheet() {
    $('#scrim').hidden = true; $('#sheet').hidden = true;
    renderApps(); scheduleCommit(150);
  }
  function renderAppList() {
    const q = $('#appSearch').value.trim().toLowerCase();
    let list = (pkgCache || []).filter((p) => (showSystem || !p.system) && (!q || p.pkg.toLowerCase().includes(q)));
    list.sort((a, b) => {
      const sa = state.apps.includes(a.pkg) ? -2 : SUGGEST.includes(a.pkg) ? -1 : 0;
      const sb = state.apps.includes(b.pkg) ? -2 : SUGGEST.includes(b.pkg) ? -1 : 0;
      return sa - sb || a.pkg.localeCompare(b.pkg);
    });
    const box = $('#appList');
    box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<div class="empty">Tidak ada paket yang cocok.</div>'; return; }
    list.slice(0, 300).forEach((p) => {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = state.apps.includes(p.pkg);
      cb.addEventListener('change', () => {
        state.apps = cb.checked ? Array.from(new Set([...state.apps, p.pkg])) : state.apps.filter((x) => x !== p.pkg);
      });
      const sp = document.createElement('span'); sp.textContent = p.pkg;
      lab.append(cb, sp); box.appendChild(lab);
    });
  }

  /* ------------------------------------------------------------------ */
  /*  Init                                                               */
  /* ------------------------------------------------------------------ */
  async function init() {
    buildPresets();
    bindSliders();
    bindNav();
    bindActions();
    drawCookie();
    render();

    const r = await bridge.load();
    state = mergeProfile(r.profile);
    state.apps = r.apps || [];
    status = r.status || {};
    if (r.error) toast(`Tidak bisa terhubung ke root shell: ${r.error}`);
    lastHeroOn = null;
    render();
    renderStatus();
    if (!HAS_KSU) demoBridge.initialApply(state, C.readingMatrix(state));
  }

  init();
})();
