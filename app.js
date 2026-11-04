(() => {
  'use strict';

  const STORE_KEY = 'tebak-kata-v7';
  const VALID_COUNTS = [12, 15, 18, 21, 24];

  const $ = (id) => document.getElementById(id);
  const el = {
    countSel: $('countSel'), sequence: $('sequence'), progress: $('progress'), slots: $('slots'),
    dictTitle: $('dictTitle'), dictMeta: $('dictMeta'), wordList: $('wordList'), search: $('search'),
    outLetters: $('outLetters'), outLines: $('outLines'), outJoined: $('outJoined'), toast: $('toast'),
    sim: $('simBody'), check: $('checkBody'),
  };

  let WORDLIST = [];          // 2048 kata, urutan resmi BIP-39 (posisi = indeks)
  let INDEX = new Map();      // kata -> indeks
  let RANK = new Map();       // kata -> peringkat kata umum (untuk urutan "Paling umum")
  let DICT = {};              // huruf -> [kata, ...]

  // src = asal entropy: { type: 'hex' | 'input' | 'weak', python: bool, scenario, secret }
  const blankGame = () => ({ count: 24, entHex: '', src: null, answer: [], letters: [], words: [], active: 0, checked: false, revealed: false });
  // source = pilihan sumber entropy di mode speaking: hex (acak Python) | input (ketik)
  // weakScenario = skenario di tab Entropy lemah: pattern | brain | seed | leak
  let state = { mode: 'vocab', sort: 'az', source: 'hex', weakScenario: 'pattern', vocab: blankGame(), speak: blankGame(), weak: blankGame() };
  const game = () => state[state.mode];

  // ---------- util ----------
  const pad = (n) => String(n + 1).padStart(2, '0');
  const hexToBytes = (hex) => Uint8Array.from(hex.match(/.{2}/g) || [], (h) => parseInt(h, 16));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      state.mode = ['speak', 'weak'].includes(s.mode) ? s.mode : 'vocab';
      if (['pattern', 'brain', 'seed', 'leak'].includes(s.weakScenario)) state.weakScenario = s.weakScenario;
      state.sort = s.sort === 'common' ? 'common' : 'az';
      if (['hex', 'input'].includes(s.source)) state.source = s.source;
      for (const m of ['vocab', 'speak', 'weak']) {
        const g = s[m];
        if (!g || !/^[0-9a-f]+$/.test(g.entHex || '')) continue;
        const sim = BIP39.fromEntropy(hexToBytes(g.entHex), WORDLIST);
        const words = sim.words;
        let src = g.src && ['hex', 'input'].includes(g.src.type) ? { type: g.src.type, python: !!g.src.python } : null;
        if (g.src?.type === 'weak' && ['pattern', 'brain', 'seed'].includes(g.src.scenario)) {
          src = { type: 'weak', scenario: g.src.scenario, secret: String(g.src.secret ?? '').slice(0, 200) };
        }
        state[m] = {
          ...blankGame(), ...g, src, count: words.length, answer: words, letters: words.map((w) => w[0]),
          words: m !== 'vocab' ? words : words.map((_, i) => (INDEX.has(g.words?.[i]) ? g.words[i] : '')),
        };
      }
    } catch (_) {}
  }

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1800);
  }

  // ---------- pembentukan kata lewat BIP-39 ----------
  // Semua huruf & kata berasal dari entropy acak -> SHA-256 -> checksum -> 11-bit -> indeks -> kata.
  function loadEntropy(mode, entropy, src) {
    const sim = BIP39.fromEntropy(entropy, WORDLIST);
    const g = state[mode];
    g.src = src || { type: 'input' };
    g.count = sim.words.length;
    g.entHex = sim.entHex;
    g.answer = sim.words;
    g.letters = sim.words.map((w) => w[0]);
    g.words = mode !== 'vocab' ? [...sim.words] : Array(g.count).fill('');
    g.active = mode !== 'vocab' ? -1 : 0;
    g.checked = false;
    g.revealed = false;
  }
  // Entropy = angka hex acak dari server Python (api/entropy.py, modul `secrets`), bukan dari browser.
  // 24 kata = 256 bit = 64 karakter hex; 12 kata = 128 bit = 32 karakter hex.
  async function fetchHex(bits) {
    const res = await fetch(`api/entropy?kind=hex&bits=${bits}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`server ${res.status}`);
    const hex = (await res.json()).hex;
    if (typeof hex !== 'string' || !new RegExp(`^[0-9a-f]{${bits / 4}}$`).test(hex)) throw new Error('jawaban server tidak valid');
    return hex;
  }

  let busy = false;
  async function newGame(mode, count) {
    if (busy) return false;
    busy = true;
    document.body.classList.add('busy');
    try {
      const hex = await fetchHex(BIP39.entBitsFor(count));
      loadEntropy(mode, hexToBytes(hex), { type: 'hex', python: true });
      return true;
    } catch (err) {
      console.error(err);
      toast('Gagal mengambil angka acak dari server Python (' + err.message + ')');
      return false;
    } finally {
      busy = false;
      document.body.classList.remove('busy');
    }
  }

  // ---------- mode 1: vocab ----------
  function nextEmpty(g, from) {
    for (let k = 1; k <= g.count; k++) {
      const i = (from + k) % g.count;
      if (!g.words[i]) return i;
    }
    return Math.min(from + 1, g.count - 1);
  }

  function setWord(i, word, advance = true) {
    const g = state.vocab;
    g.words[i] = word;
    if (advance) g.active = nextEmpty(g, i);
    el.search.value = '';
    render();
  }

  // bilangan acak untuk tombol bantuan juga dari server Python
  async function pythonNumbers(count) {
    const res = await fetch(`api/entropy?kind=u32&count=${count}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`server ${res.status}`);
    const v = (await res.json()).values;
    if (!Array.isArray(v) || v.length !== count || !v.every(Number.isInteger)) throw new Error('jawaban server tidak valid');
    return v;
  }

  // isi slot-slot kosong dengan kata acak berawalan huruf yang sesuai
  async function fillRandom(slots) {
    if (!slots.length) return;
    let nums;
    try { nums = await pythonNumbers(slots.length); }
    catch (err) { toast('Gagal mengambil angka acak dari server Python (' + err.message + ')'); return; }
    const g = state.vocab;
    slots.forEach((i, k) => {
      const used = new Set(g.words.filter((w, j) => w && j !== i));
      const list = DICT[g.letters[i]];
      const fresh = list.filter((w) => !used.has(w));
      const pool = fresh.length ? fresh : list;
      g.words[i] = pool[nums[k] % pool.length];
    });
  }

  // ---------- mode 2: speaking (suara) ----------
  function speak(text, onend) {
    if (!('speechSynthesis' in window)) { toast('Browser tidak mendukung suara'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    if (onend) u.onend = onend;
    speechSynthesis.speak(u);
  }

  let speakingAll = false;
  function stopSpeaking() {
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speakingAll = false;
    $('btnSpeakAll').textContent = 'Dengarkan semua';
  }
  function speakAll() {
    if (speakingAll) { stopSpeaking(); return; }
    const g = state.speak;
    stopSpeaking();
    speakingAll = true;
    $('btnSpeakAll').textContent = 'Stop';
    let i = 0;
    const step = () => {
      if (!speakingAll || i >= g.count) {
        stopSpeaking();
        g.active = -1;
        render();
        return;
      }
      g.active = i;
      render();
      speak(g.words[i++], () => setTimeout(step, 450));
    };
    step();
  }

  // ---------- render: huruf, slot, kamus, hasil ----------
  function renderSequence() {
    const g = game();
    const frag = document.createDocumentFragment();
    g.letters.forEach((l, i) => {
      if (i) {
        const sep = document.createElement('span');
        sep.className = 'seq-sep';
        sep.textContent = '-';
        frag.appendChild(sep);
      }
      const b = document.createElement('button');
      b.className = 'seq-letter' + (g.words[i] ? ' filled' : '') + (i === g.active ? ' active' : '');
      b.textContent = l;
      b.title = `${pad(i)} · ${g.words[i] || 'belum dipilih'}`;
      b.onclick = () => onSlot(i);
      frag.appendChild(b);
    });
    el.sequence.replaceChildren(frag);
    const filled = g.words.filter(Boolean).length;
    el.progress.textContent = state.mode === 'vocab' ? `${filled}/${g.count} terisi` : `${g.count} kata`;
  }

  function renderSlots() {
    const g = game();
    const frag = document.createDocumentFragment();
    g.letters.forEach((l, i) => {
      const b = document.createElement('button');
      const w = g.words[i];
      let cls = 'slot' + (i === g.active ? ' active' : '');
      if (state.mode === 'vocab' && g.checked && w) cls += w === g.answer[i] ? ' ok' : ' bad';
      b.className = cls;
      const idx = w ? INDEX.get(w) : null;
      b.innerHTML = `<span class="num">${pad(i)}</span><span class="let">${l}</span>` +
        `<span class="word${w ? '' : ' empty'}">${esc(w || 'pilih kata…')}</span>` +
        (idx != null ? `<span class="idx">#${idx}</span>` : '') +
        (state.mode === 'vocab' && g.revealed && w !== g.answer[i] ? `<span class="ans">${esc(g.answer[i])}</span>` : '');
      b.onclick = () => onSlot(i);
      frag.appendChild(b);
    });
    el.slots.replaceChildren(frag);
  }

  function renderDict() {
    if (state.mode !== 'vocab') return;
    const g = state.vocab;
    const i = g.active;
    const letter = g.letters[i];
    el.dictTitle.textContent = `Huruf ${letter.toUpperCase()} · slot ${pad(i)}`;

    const q = el.search.value.trim().toLowerCase();
    const all = DICT[letter];
    let list = q ? all.filter((w) => w.includes(q)) : all;
    const byOrder = state.sort === 'common' ? (a, b) => RANK.get(a) - RANK.get(b) : (a, b) => INDEX.get(a) - INDEX.get(b);
    list = [...list].sort((a, b) => (q ? b.startsWith(q) - a.startsWith(q) : 0) || byOrder(a, b));
    el.dictMeta.textContent = q ? `${list.length} dari ${all.length} kata cocok` : `${all.length} kata`;

    const used = new Set(g.words.filter(Boolean));
    const current = g.words[i];
    const frag = document.createDocumentFragment();
    for (const word of list) {
      const b = document.createElement('button');
      b.className = 'w' + (word === current ? ' picked' : used.has(word) ? ' used' : '');
      b.innerHTML = `<span>${esc(word)}</span><small>#${INDEX.get(word)}</small>`;
      b.onclick = () => setWord(i, word);
      frag.appendChild(b);
    }
    if (!list.length) {
      const p = document.createElement('div');
      p.className = 'empty-msg';
      p.textContent = 'Tidak ada kata yang cocok.';
      frag.appendChild(p);
    }
    el.wordList.replaceChildren(frag);
    el.wordList.scrollTop = 0;
  }

  function renderOutput() {
    const g = game();
    const shown = g.words.map((w) => w || '___');
    el.outLetters.textContent = g.letters.join('-');
    el.outLines.textContent = shown.join('\n');
    el.outJoined.textContent = shown.join(' ');
  }

  // ---------- render: simulasi matematis ----------
  function groupedBits(bits, csFrom) {
    // tampilkan per kelompok 11 bit; bit checksum (posisi >= csFrom) diberi warna
    const parts = [];
    for (let i = 0; i < bits.length; i += 11) {
      const chunk = bits.slice(i, i + 11);
      let html = '';
      for (let j = 0; j < chunk.length; j++) {
        const pos = i + j;
        html += csFrom != null && pos >= csFrom ? `<b class="cs">${chunk[j]}</b>` : chunk[j];
      }
      parts.push(`<span class="g11">${html}</span>`);
    }
    return parts.join(' ');
  }

  // ---- langkah 1: angka acak (entropy) ----
  function entropyStepHTML(sim, src) {
    const { ENT, entBits, entHex } = sim;
    const cells = entHex.split('').map((c, i) =>
      `<span class="hx" title="karakter ${i + 1}"><i>${c}</i><small>${parseInt(c, 16).toString(2).padStart(4, '0')}</small></span>`).join('');
    const intro = src?.type === 'weak' ? weakIntroHTML(src, ENT)
      : src?.python
        ? `Server Python (modul <code>secrets</code>) membuat <b>${entHex.length} karakter hex acak</b> = ${entHex.length} × 4 = <b>${ENT} bit</b>.`
        : `Entropy <b>${ENT} bit</b> (${entHex.length} karakter hex) dimasukkan langsung.`;
    return `
          <h3>Angka acak (entropy)</h3>
          <p>${intro}</p>
          <pre class="bits brk hexbig">${entHex}</pre>
          <p>Tiap karakter hex = 4 bit:</p>
          <div class="hex-grid">${cells}</div>
          <p>Jadi entropy dalam biner (${ENT} bit):</p>
          <pre class="bits brk">${entBits.match(/.{1,64}/g).join('\n')}</pre>`;
  }

  function stepsHTML(sim, src) {
    const { ENT, CS, entBits, entHex, hashHex, checksum, all, groups } = sim;
    const hexUsed = Math.ceil(CS / 4);
    const hexExplain = hashHex.slice(0, hexUsed).split('').map((c) =>
      `<code>${c}</code> → desimal ${parseInt(c, 16)} → biner <code>${parseInt(c, 16).toString(2).padStart(4, '0')}</code>`).join('<br>');
    const rows = groups.map((g, i) => {
      const csStart = ENT - i * 11; // posisi checksum relatif terhadap kelompok ini
      let bitsHTML = '';
      for (let j = 0; j < 11; j++) bitsHTML += j >= csStart ? `<b class="cs">${g.bits[j]}</b>` : g.bits[j];
      return `<tr><td>${i + 1}</td><td class="mono">${bitsHTML}</td><td class="num">${g.index}</td><td class="word">${esc(g.word)}</td></tr>`;
    }).join('');

    return `
      <ol class="steps">
        <li>
          ${entropyStepHTML(sim, src)}
        </li>
        <li>
          <h3>Hashing SHA-256</h3>
          <p>Entropy ${ENT} bit itu dimasukkan ke fungsi SHA-256. Hasilnya 64 karakter hex:</p>
          <pre class="bits brk"><b class="cs">${hashHex.slice(0, hexUsed)}</b>${hashHex.slice(hexUsed)}</pre>
        </li>
        <li>
          <h3>Pengambilan checksum</h3>
          <p>Panjang checksum = ${ENT} ÷ 32 = <b>${CS} bit</b>, diambil dari bit paling depan hasil hash.</p>
          <p>${hexExplain}</p>
          <p>Checksum = <code class="cs-code">${checksum}</code>${CS % 4 ? ` (hanya ${CS} bit pertama yang dipakai)` : ''}</p>
        </li>
        <li>
          <h3>Penggabungan data</h3>
          <p>${CS} bit checksum ditempel di belakang entropy: ${ENT} + ${CS} = <b>${ENT + CS} bit</b>. (Bit berwarna = checksum.)</p>
          <pre class="bits wrap">${groupedBits(all, ENT)}</pre>
        </li>
        <li>
          <h3>Pemotongan menjadi 11-bit &amp; pemetaan ke kamus BIP-39</h3>
          <p>${ENT + CS} bit ÷ 11 = <b>${groups.length} kelompok</b>. Tiap kelompok diubah ke desimal (0–2047), lalu dicocokkan ke kamus BIP-39 (indeks 0 = <i>abandon</i>).</p>
          <div class="table-wrap"><table class="sim-table">
            <thead><tr><th>Kelompok</th><th>11 bit</th><th>Indeks</th><th>Kata</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
        </li>
        <li>
          <h3>Hasil frasa</h3>
          <pre class="bits wrap phrase">${esc(sim.words.join(' '))}</pre>
          <p class="muted">Kata terakhir <b>${esc(sim.words[sim.words.length - 1])}</b> mengandung ${CS} bit checksum, jadi frasa ini valid secara matematis. Kalau satu kata saja diganti, checksum hampir pasti tidak cocok lagi.</p>
        </li>
      </ol>`;
  }

  function renderSim() {
    const g = game();
    if (state.mode !== 'vocab' || g.revealed) {
      el.sim.innerHTML = stepsHTML(BIP39.fromEntropy(hexToBytes(g.entHex), WORDLIST), g.src);
    } else {
      el.sim.innerHTML = `<p class="muted">Huruf di atas berasal dari frasa BIP-39 yang <b>valid</b>: entropy dari angka hex acak (Python) → SHA-256 → checksum → 11-bit.
        Kata aslinya disembunyikan. Tebak semua katanya, tekan <b>Cek jawaban</b>, lalu <b>Tampilkan jawaban</b> untuk melihat simulasi lengkapnya.</p>`;
    }
  }

  // ---- panel sumber entropy (mode speaking) ----
  const SOURCES = [['hex', 'Acak (Python)'], ['input', 'Ketik entropy']];

  function renderEntTools() {
    const box = $('entTools');
    if (state.mode !== 'speak') { box.innerHTML = ''; return; }
    const ent = BIP39.entBitsFor(+el.countSel.value);
    const chips = SOURCES.map(([k, label]) => `<button class="chip-f${state.source === k ? ' active' : ''}" data-src="${k}">${label}</button>`).join('');
    const body = state.source === 'input'
      ? `<p class="muted">Masukkan entropy hex (${ent / 4} karakter = ${ent} bit untuk ${el.countSel.value} kata) atau biner 0/1.</p>
        <div class="ent-input-row">
          <input id="entInput" type="text" placeholder="contoh: 6ba98e8f… (${ent / 4} karakter hex)" autocomplete="off" spellcheck="false">
          <button class="btn small" data-act="use">Hitung</button>
          <button class="btn small ghost" data-act="example" title="Indeks 1 sampai 11 (ability … accident) + 7 bit nol">Contoh materi</button>
        </div>`
      : `<p class="muted">Server Python (<code>secrets</code>) membuat ${ent / 4} karakter hex acak (${ent} bit) sebagai entropy.</p>
        <button class="btn small primary" data-act="auto">Acak lagi</button>`;
    box.innerHTML = `<div class="label sub-label">Sumber entropy</div><div class="filters src-chips">${chips}</div>${body}`;
  }

  // ---------- mode 3: entropy lemah ----------
  const WEAK_TABS = [['pattern', 'Pola mudah'], ['brain', 'Tanggal lahir / kata sandi'], ['seed', 'Pengacak lemah (pakai jam)'], ['leak', 'Bocor']];
  const fmt = (n) => Math.round(n).toLocaleString('id-ID');
  const fmtTime = (sec) => new Date(sec * 1000).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'medium' });
  let attackState = null;   // { running, progress, total, category, result }
  let attackToken = 0;
  const cancelAttack = () => { attackToken++; attackState = null; };

  function loadWeak(scenario, secret) {
    cancelAttack();
    let entropy;
    if (scenario === 'pattern') {
      // secret = kunci pola bawaan (mis. 'zeros') atau 'custom:<hex>' untuk pola ketikan sendiri
      entropy = String(secret).startsWith('custom:')
        ? WeakLab.customPattern(String(secret).slice(7)).bytes
        : hexToBytes(WeakLab.PATTERNS.find((p) => p[0] === secret)[2]);
    }
    else if (scenario === 'brain') entropy = WeakLab.brainEntropy(secret);
    else entropy = WeakLab.seedEntropy(secret);
    loadEntropy('weak', entropy, { type: 'weak', scenario, secret: String(secret) });
  }

  function weakIntroHTML(src, ENT) {
    if (src.scenario === 'pattern') {
      const p = !src.secret.startsWith('custom:') && WeakLab.PATTERNS.find((x) => x[0] === src.secret);
      if (p) return `Entropy ${ENT} bit dibuat dari <b>pola mudah: ${esc(p[1])}</b>. Tidak ada yang acak sama sekali.`;
      let seed = src.secret.replace(/^custom:/, '');
      try { seed = WeakLab.customPattern(seed).seed; } catch (_) {}
      return `Entropy ${ENT} bit dibuat dari <b>pola ketikan sendiri</b>: <code>${esc(seed)}</code> diulang-ulang sampai ${ENT / 4} karakter hex.
        Tidak ada yang acak sama sekali.`;
    }
    if (src.scenario === 'brain') {
      const h = BIP39.bytesToHex(BIP39.sha256(new TextEncoder().encode(src.secret)));
      return `Entropy = SHA-256 dari teks <code>${esc(src.secret)}</code>, diambil ${ENT} bit (${ENT / 4} hex) pertama.
        SHA-256-nya: <code class="break"><b class="cs">${h.slice(0, ENT / 4)}</b>${h.slice(ENT / 4)}</code>.
        Kelihatannya acak, tapi siapa pun yang menebak teksnya akan mendapat entropy yang sama persis.`;
    }
    return `Entropy dibuat <b>pengacak lemah</b> (mulberry32, mirip modul <code>random</code>) dengan seed = jam saat tombol diklik:
      <code>${esc(src.secret)}</code> (${esc(fmtTime(+src.secret))}). Seed yang sama selalu menghasilkan angka yang sama.`;
  }

  function strongCompareHTML(res) {
    // 2^128 kemungkinan, penyerang super cepat 1 triliun tebakan/detik
    const years = 2 ** 128 / 1e12 / 3.15576e7;
    const perSec = res && res.ms > 0 ? res.tries / (res.ms / 1000) : 0;
    const left = res?.found
      ? `Ketemu setelah <b>${fmt(res.tries)}</b> tebakan, dalam <b>${(res.ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} detik</b>`
      : res?.total
        ? `Seluruh ruang tebakan daftar ini cuma <b>±${fmt(res.total)}</b> kemungkinan — besar, tapi tetap terbatas dan bisa dihabiskan`
        : 'Ruang tebakannya kecil';
    return `<div class="compare">
      <div><div class="label">Entropy lemah ini</div>
        <p>${left}
        ${perSec ? `<br><span class="muted">kecepatan browser ini ±${fmt(perSec)} tebakan/detik</span>` : ''}</p></div>
      <div><div class="label">Entropy kuat 128 bit (acak sungguhan)</div>
        <p>2<sup>128</sup> ≈ 3,4 × 10<sup>38</sup> kemungkinan. Dengan komputer super yang mencoba 1 triliun tebakan/detik:
        <b>±${years.toExponential(1).replace('.', ',').replace(/e\+(\d+)/, ' × 10<sup>$1</sup>')} tahun</b>. Umur alam semesta baru ±1,4 × 10<sup>10</sup> tahun.</p></div>
    </div>`;
  }

  // nama pola yang ditemukan: label pola bawaan, atau potongan terpendek yang diulang-ulang
  function patternName(hex) {
    const preset = WeakLab.PATTERNS.find((p) => p[2] === hex);
    if (preset) return `pola <code>${esc(preset[1])}</code>`;
    for (let len = 1; len <= hex.length; len++) {
      const seed = hex.slice(0, len);
      if (seed.repeat(Math.ceil(hex.length / len)).slice(0, hex.length) === hex) {
        return `pola <code>${esc(seed)}</code> yang diulang-ulang (<code class="break">${esc(hex)}</code>)`;
      }
    }
    return `pola <code class="break">${esc(hex)}</code>`;
  }

  function attackHTML() {
    const a = attackState;
    if (!a) return '';
    if (a.running) {
      return `<div class="attack running"><div class="label">Penyerang sedang menebak… (${esc(a.category || '')})</div>
        <div class="progress-bar"><span style="width:${Math.min(100, (a.progress / a.total) * 100)}%"></span></div>
        <p class="muted">${fmt(a.progress)} dari ±${fmt(a.total)} tebakan</p>
        <button class="btn small ghost" data-wact="stop">Hentikan</button></div>`;
    }
    const r = a.result;
    if (r.cancelled) return '<div class="attack"><p class="muted">Serangan dihentikan.</p></div>';
    const g = state.weak;
    const shown = !r.found ? '' : g.src.scenario === 'seed'
      ? `seed <code>${esc(r.candidate)}</code> = ${esc(fmtTime(+r.candidate))}`
      : g.src.scenario === 'brain' ? `teks <code>${esc(r.candidate)}</code>` : patternName(r.candidate);
    if (r.found) {
      return `<div class="attack found"><div class="verdict bad">✗ Frasa berhasil ditebak penyerang</div>
        <p>Ditemukan: ${shown} (kategori: ${esc(r.category)}). Dari situ penyerang langsung tahu ke-12 katanya:</p>
        <pre class="bits wrap phrase">${esc(g.answer.join(' '))}</pre>
        ${strongCompareHTML(r)}</div>`;
    }
    if (r.budgetHit) {
      const perSec = r.ms > 0 ? r.tries / (r.ms / 1000) : 0;
      const daftar = perSec ? Math.round(r.total / perSec / 86400) : 0;
      return `<div class="attack"><div class="verdict warn">⏱ Browser ini belum selesai, baru ${fmt(r.tries)} dari ±${fmt(r.total)} kemungkinan</div>
        <p>Browser di HP/laptop kelas hanya sanggup <b>±${fmt(perSec)} tebakan/detik</b>, jadi menghabiskan ${fmt(r.total)} kemungkinan di daftar ini perlu
        <b>±${daftar >= 1 ? fmt(daftar) + ' hari' : 'kurang dari sehari'}</b> di sini. Tapi daftar ini belum seberapa:
        penyerang sungguhan memakai komputer khusus yang mencoba <b>miliaran tebakan per detik</b> dan daftar <b>miliaran kata sandi yang pernah bocor</b>,
        jadi teks buatan manusia seperti ini biasanya jebol dalam hitungan menit sampai jam.</p>
        <p class="muted">Klik "Serang" lagi untuk melanjutkan satu putaran lagi, atau coba teks yang lebih pendek/umum untuk melihatnya ketemu.</p>
        ${strongCompareHTML(r)}</div>`;
    }
    if (g.src.scenario === 'pattern') {
      const seed = String(g.src.secret).replace(/^custom:/, '');
      const space = 16 ** seed.length;
      return `<div class="attack"><div class="verdict warn">Pola <code>${esc(seed)}</code> (${seed.length} karakter) tidak ada di daftar demo ini (±${fmt(r.total)} pola)</div>
        <p>Tapi tetap lemah: semua pola berulang sepanjang ${seed.length} karakter hex hanya ada <b>16<sup>${seed.length}</sup> ≈ ${fmt(space)}</b> kemungkinan.
        ${space <= 1e13 ? 'Komputer penyerang yang mencoba miliaran tebakan per detik menghabiskannya dalam hitungan detik sampai jam.' : ''}
        Bandingkan dengan entropy acak sungguhan: 2<sup>128</sup> ≈ 3,4 × 10<sup>38</sup>.</p>${strongCompareHTML(r)}</div>`;
    }
    return `<div class="attack"><div class="verdict ok">Tidak ketemu di ±${fmt(r.total)} tebakan daftar ini</div>
      <p>Tapi jangan merasa aman: penyerang sungguhan memakai daftar <b>miliaran</b> kata sandi yang pernah bocor dan komputer yang jauh lebih cepat dari browser ini.
      Teks buatan manusia tetap jauh lebih lemah daripada angka acak sungguhan.</p>${strongCompareHTML(r)}</div>`;
  }

  function leakHTML() {
    let stored = [];
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      for (const m of ['vocab', 'speak']) {
        if (s?.[m]?.entHex && /^[0-9a-f]+$/.test(s[m].entHex)) {
          stored.push([m === 'vocab' ? 'Tab Vocab' : 'Tab Speaking', s[m].entHex, BIP39.fromEntropy(hexToBytes(s[m].entHex), WORDLIST).words.join(' ')]);
        }
      }
    } catch (_) {}
    const rows = stored.map(([where, hex, words]) => `<tr><td>${where}</td><td class="mono break">${hex}</td><td class="word">${esc(words)}</td></tr>`).join('');
    return `<p>Entropy sekuat apa pun tidak berguna kalau <b>bocor</b>. Contoh kebocoran yang sering terjadi:</p>
      <ul class="leak-list">
        <li><b>Difoto / di-screenshot</b>, lalu galeri otomatis ter-backup ke cloud.</li>
        <li><b>Disimpan di catatan HP, email, chat, atau Google Drive.</b></li>
        <li><b>Diketik di situs atau aplikasi palsu</b> yang mengaku "validasi" atau "sinkronisasi" dompet.</li>
        <li><b>Diberikan ke "admin" atau "CS"</b> yang mengaku membantu. Pihak resmi tidak pernah meminta frasa.</li>
        <li><b>Terlihat orang lain</b> saat ditulis atau dibuka di tempat umum.</li>
        <li><b>Disimpan di browser</b>, seperti app ini.</li>
      </ul>
      <div class="label">Bukti langsung: isi penyimpanan browser app ini sekarang</div>
      ${rows ? `<div class="table-wrap"><table class="sim-table"><thead><tr><th>Asal</th><th>Entropy tersimpan</th><th>Langsung jadi kata</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="muted">Siapa pun yang memakai browser ini bisa membaca data di atas lewat menu developer, lalu mengubahnya jadi kata dengan rumus BIP-39. Karena itu dompet sungguhan dibuat di perangkat offline dan frasanya ditulis di kertas.</p>
        <button class="btn small ghost" data-wact="wipe">Hapus data app ini dari browser</button>`
        : '<p class="muted">Tidak ada entropy tersimpan di browser ini.</p>'}`;
  }

  function renderWeak() {
    const box = $('weakPanel');
    if (state.mode !== 'weak') { box.innerHTML = ''; return; }
    const sc = state.weakScenario;
    const chips = WEAK_TABS.map(([k, l]) => `<button class="chip-f${sc === k ? ' active' : ''}" data-wsc="${k}">${l}</button>`).join('');
    const src = state.weak.src || {};
    const busy = attackState?.running ? ' disabled' : '';
    let body = '';
    if (sc === 'pattern') {
      const isCustom = src.scenario === 'pattern' && String(src.secret).startsWith('custom:');
      const opts = WeakLab.PATTERNS.map(([k, l]) => `<option value="${k}"${src.scenario === 'pattern' && src.secret === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
      const customVal = isCustom ? esc(src.secret.slice(7)) : '';
      body = `<p>Orang yang malas sering memakai pola mudah, misalnya angka nol semua. Bot penyerang selalu mengecek pola-pola terkenal ini lebih dulu.</p>
        <div class="ent-input-row"><select id="weakPattern">${opts}</select>
        <button class="btn small" data-wact="make"${busy}>Buat frasa</button></div>
        <p class="muted">Atau ketik pola sendiri (karakter hex 0-9 dan a-f). Polanya diulang-ulang sampai 32 karakter = 128 bit.</p>
        <div class="ent-input-row"><input id="weakPatternCustom" type="text" maxlength="32" placeholder="contoh: cafe, 1234, abc, 00ff" autocomplete="off" spellcheck="false" value="${customVal}">
        <button class="btn small" data-wact="makeCustom"${busy}>Buat frasa dari pola ini</button></div>`;
    } else if (sc === 'brain') {
      body = `<p>Disebut <b>brain wallet</b>: entropy dibuat dari SHA-256 teks yang mudah diingat, seperti tanggal lahir, nama, atau kata sandi.
        Hasil SHA-256 terlihat acak, padahal penyerang tinggal mencoba teks-teks yang umum.</p>
        <div class="ent-input-row"><input id="weakText" type="text" maxlength="60" placeholder="contoh: 17081945, budi123, sayang" autocomplete="off" spellcheck="false"
          value="${src.scenario === 'brain' ? esc(src.secret) : ''}">
        <button class="btn small" data-wact="make"${busy}>Buat frasa</button></div>
        <p class="muted">Jangan ketik kata sandi asli kamu di sini.</p>`;
    } else if (sc === 'seed') {
      body = `<p>Pengacak biasa (seperti modul <code>random</code> Python atau <code>Math.random</code>) sering memakai <b>jam</b> sebagai seed.
        Dalam sehari hanya ada 86.400 detik, jadi penyerang cukup mencoba semua detik itu.</p>
        <div class="ent-input-row"><button class="btn small" data-wact="make"${busy}>Buat frasa sekarang</button></div>`;
    } else {
      body = leakHTML();
    }
    const canAttack = sc !== 'leak' && src.scenario === sc;
    box.innerHTML = `<div class="label sub-label">Skenario entropy lemah</div><div class="filters src-chips">${chips}</div>
      <div class="weak-body">${body}</div>
      ${canAttack ? `<div class="attack-row"><button class="btn danger" data-wact="attack"${busy}>Serang! Coba tebak frasanya</button>
        <span class="muted">Penyerang tidak tahu ${sc === 'pattern' ? 'pola' : sc === 'brain' ? 'teks' : 'jam'} yang kamu pakai, hanya menebak.</span></div>` : ''}
      ${sc !== 'leak' ? attackHTML() : ''}`;
  }

  async function runAttack() {
    const g = state.weak;
    const sc = g.src.scenario;
    const token = ++attackToken;
    attackState = { running: true, progress: 0, total: 1, category: '' };
    renderWeak();
    const onProgress = (n, total, category) => {
      if (token !== attackToken) return;
      attackState.progress = n; attackState.total = total; attackState.category = category;
      // perbarui angka & progress bar saja (jangan gambar ulang panel, supaya tombol Hentikan tetap bisa diklik)
      const box = document.querySelector('#weakPanel .attack.running');
      if (!box) { renderWeak(); return; }
      box.querySelector('.label').textContent = `Penyerang sedang menebak… (${category})`;
      box.querySelector('.progress-bar span').style.width = `${Math.min(100, (n / total) * 100)}%`;
      box.querySelector('p').textContent = `${fmt(n)} dari ±${fmt(total)} tebakan`;
    };
    const cancel = () => token !== attackToken;
    let res;
    if (sc === 'pattern') res = await WeakLab.patternAttack(g.entHex, onProgress, cancel);
    else if (sc === 'brain') res = await WeakLab.brainAttack(g.entHex, WORDLIST, onProgress, cancel, 12000);
    else res = await WeakLab.seedAttack(g.entHex, Math.floor(Date.now() / 1000), onProgress, cancel);
    if (token !== attackToken) return;
    attackState = { running: false, result: res };
    renderWeak();
  }

  function bindWeak() {
    $('weakPanel').onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.wsc) { cancelAttack(); state.weakScenario = b.dataset.wsc; render(); return; }
      const act = b.dataset.wact;
      if (act === 'make') {
        stopSpeaking();
        const sc = state.weakScenario;
        if (sc === 'pattern') loadWeak('pattern', $('weakPattern').value);
        else if (sc === 'brain') {
          const t = $('weakText').value;
          if (!t.trim()) { toast('Ketik teksnya dulu'); return; }
          loadWeak('brain', t);
        } else loadWeak('seed', Math.floor(Date.now() / 1000));
        render();
        toast('Frasa dibuat dari entropy lemah');
      } else if (act === 'makeCustom') {
        try {
          stopSpeaking();
          loadWeak('pattern', 'custom:' + WeakLab.customPattern($('weakPatternCustom').value).seed);
          render();
          toast('Frasa dibuat dari pola ketikanmu');
        } catch (err) {
          toast(err.message);
        }
      } else if (act === 'attack') runAttack();
      else if (act === 'stop') { cancelAttack(); attackState = { running: false, result: { cancelled: true } }; renderWeak(); }
      else if (act === 'wipe') {
        try { localStorage.removeItem(STORE_KEY); } catch (_) {}
        renderWeak();
        toast('Data app dihapus dari browser (akan tersimpan lagi saat app dipakai)');
      }
    };
    $('weakPanel').onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.id === 'weakText') $('weakPanel').querySelector('[data-wact=make]')?.click();
      if (e.key === 'Enter' && e.target.id === 'weakPatternCustom') $('weakPanel').querySelector('[data-wact=makeCustom]')?.click();
    };
  }

  function renderCheck() {
    if (state.mode !== 'vocab') { el.check.innerHTML = ''; return; }
    const g = state.vocab;
    const filled = g.words.filter(Boolean).length;
    if (filled < g.count) {
      el.check.innerHTML = `<p class="muted">Isi semua ${g.count} kata dulu (${filled}/${g.count}). Setelah lengkap, di sini muncul perhitungan kebalikannya: kata → indeks → bit → cek checksum.</p>`;
      return;
    }
    const r = BIP39.check(g.words, INDEX);
    const rows = g.words.map((w, i) => `<tr><td>${i + 1}</td><td class="word">${esc(w)}</td><td class="num">${r.idx[i]}</td><td class="mono">${groupedBits(r.idx[i].toString(2).padStart(11, '0'), i === g.count - 1 ? 11 - r.CS : null).replace(/<\/?span[^>]*>/g, '')}</td></tr>`).join('');
    const hexUsed = Math.ceil(r.CS / 4);
    el.check.innerHTML = `
      <div class="verdict ${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓ Checksum cocok, frasa pilihanmu valid secara matematis' : '✗ Checksum tidak cocok, frasa pilihanmu akan ditolak wallet'}</div>
      <div class="table-wrap"><table class="sim-table">
        <thead><tr><th>No</th><th>Kata</th><th>Indeks</th><th>11 bit</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p>${r.ENT + r.CS} bit dipisah menjadi <b>${r.ENT} bit entropy</b> + <b>${r.CS} bit checksum</b> (<code class="cs-code">${r.given}</code>).</p>
      <p>SHA-256(entropy) = <code class="break"><b class="cs">${r.hashHex.slice(0, hexUsed)}</b>${r.hashHex.slice(hexUsed)}</code></p>
      <p>Checksum seharusnya <code class="cs-code">${r.expected}</code>, dari kata pilihanmu <code class="cs-code">${r.given}</code> → <b>${r.ok ? 'cocok' : 'tidak cocok'}</b>.</p>`;
  }

  function render() {
    document.body.className = 'mode-' + state.mode;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === state.mode));
    el.countSel.value = String(game().count);
    $('btnReveal').textContent = state.vocab.revealed ? 'Sembunyikan jawaban' : 'Tampilkan jawaban';
    renderSequence();
    renderSlots();
    renderDict();
    renderOutput();
    renderEntTools();
    renderWeak();
    renderSim();
    renderCheck();
    save();
  }

  function onSlot(i) {
    const g = game();
    g.active = i;
    if (state.mode !== 'vocab') {
      stopSpeaking();
      speak(g.words[i]);
      render();
      return;
    }
    el.search.value = '';
    render();
    if (window.matchMedia('(max-width: 860px)').matches) {
      $('dict').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function setMode(mode) {
    stopSpeaking();
    cancelAttack();
    state.mode = mode;
    if (mode === 'vocab' && game().active < 0) game().active = 0;
    render();
  }

  // contoh dari materi: indeks 1..11 + 7 bit awal indeks 12 = 128 bit entropy
  function exampleEntropyBits() {
    let bits = '';
    for (let i = 1; i <= 12; i++) bits += i.toString(2).padStart(11, '0');
    return bits.slice(0, 128);
  }

  // ---------- events ----------
  function bind() {
    document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => setMode(t.dataset.mode); });
    el.countSel.onchange = async () => {
      stopSpeaking();
      await newGame(state.mode, +el.countSel.value);
      render();
    };
    $('btnNewLetters').onclick = async () => { if (await newGame('vocab', +el.countSel.value)) { render(); toast('Frasa baru dibuat, huruf diacak'); } };
    $('btnFillAll').onclick = async () => {
      const g = state.vocab;
      await fillRandom(g.words.map((w, i) => (w ? -1 : i)).filter((i) => i >= 0));
      render();
    };
    $('btnClear').onclick = () => {
      const g = state.vocab;
      g.words = Array(g.count).fill('');
      g.active = 0;
      g.checked = false;
      render();
    };
    $('btnCheck').onclick = () => {
      const g = state.vocab;
      g.checked = true;
      const right = g.words.filter((w, i) => w && w === g.answer[i]).length;
      render();
      toast(`${right} dari ${g.count} kata sama dengan jawaban`);
    };
    $('btnReveal').onclick = () => {
      const g = state.vocab;
      g.revealed = !g.revealed;
      if (g.revealed) g.checked = true;
      render();
      if (g.revealed) $('sim').scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    $('btnGenerate').onclick = async () => { stopSpeaking(); if (await newGame('speak', +el.countSel.value)) { render(); toast('Frasa baru dibuat'); } };
    $('btnSpeakAll').onclick = speakAll;
    $('btnRandomWord').onclick = async () => {
      const g = state.vocab;
      g.words[g.active] = '';
      await fillRandom([g.active]);
      el.search.value = '';
      render();
    };

    $('entTools').onclick = async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.src) {
        state.source = b.dataset.src;
        render();
        return;
      }
      const act = b.dataset.act;
      if (act === 'auto') { stopSpeaking(); if (await newGame('speak', +el.countSel.value)) render(); }
      else if (act === 'example' || act === 'use') {
        const input = $('entInput');
        if (act === 'example') input.value = exampleEntropyBits();
        try {
          stopSpeaking();
          loadEntropy('speak', BIP39.parseEntropy(input.value), { type: 'input' });
          const val = input.value;
          render();
          $('entInput').value = val;
          toast(act === 'example' ? 'Contoh materi dihitung' : 'Entropy dipakai');
        } catch (err) {
          toast(err.message);
        }
      }
    };

    el.search.oninput = renderDict;
    el.search.onkeydown = (e) => {
      if (e.key === 'Enter') el.wordList.querySelector('.w')?.click();
    };
    bindWeak();
    $('sortSel').onchange = (e) => { state.sort = e.target.value; renderDict(); save(); };
    document.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = async () => {
        const text = $(b.dataset.copy).textContent;
        try {
          await navigator.clipboard.writeText(text);
        } catch (_) {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
        }
        toast('Disalin');
      };
    });
  }

  // ---------- init ----------
  async function init() {
    const data = await (await fetch('words.json')).json();
    WORDLIST = data.map((d) => d[0]);
    if (WORDLIST.length !== 2048) throw new Error('words.json harus 2048 kata');
    data.forEach(([w, r], i) => {
      INDEX.set(w, i);
      RANK.set(w, r);
      (DICT[w[0]] ||= []).push(w);
    });

    load();
    if (!state.weak.entHex) loadWeak('pattern', WeakLab.PATTERNS[0][0]);
    for (const m of ['vocab', 'speak']) {
      if (state[m].entHex) continue;
      // kalau server Python belum bisa dihubungi, pakai contoh materi dulu supaya halaman tetap tampil
      if (!(await newGame(m, 24))) loadEntropy(m, BIP39.binToBytes(exampleEntropyBits()), { type: 'input' });
    }
    $('sortSel').value = state.sort;
    bind();
    render();
  }

  init().catch((err) => {
    console.error(err);
    el.wordList.textContent = 'Gagal memuat kamus (words.json).';
  });
})();
