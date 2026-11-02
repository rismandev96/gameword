(() => {
  'use strict';

  const STORE_KEY = 'tebak-kata-v2';
  const MIN_WORDS_PER_LETTER = 15;  // huruf dengan kata terlalu sedikit (mis. x) tidak dipakai
  const COMMON_RANK = 12000;        // rank < ini = kata umum
  const SPEAK_PURE_NOUN_RATIO = 0.8; // mode speaking: 80% noun murni, sisanya kata yang noun sekaligus verb 1

  const $ = (id) => document.getElementById(id);
  const el = {
    countSel: $('countSel'), sequence: $('sequence'), progress: $('progress'), slots: $('slots'),
    dictTitle: $('dictTitle'), dictMeta: $('dictMeta'), wordList: $('wordList'), search: $('search'),
    outLetters: $('outLetters'), outLines: $('outLines'), outJoined: $('outJoined'), toast: $('toast'),
  };

  let DICT = {};        // { a: [[word, pos, rank], ...] }  pos: 'n' | 'v' | 'nv'
  let VOCAB_LETTERS = [], VOCAB_W = [];
  let SPEAK_LETTERS = [], SPEAK_W = [];

  const blankGame = () => ({ count: 24, letters: [], words: [], active: 0 });
  let state = { mode: 'vocab', pos: 'all', sort: 'az', vocab: blankGame(), speak: blankGame() };
  const game = () => state[state.mode];

  // ---------- util ----------
  const rand = (n) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const randFloat = () => rand(1e9) / 1e9;
  const pick = (arr) => arr[rand(arr.length)];
  const pickWeighted = (items, weights) => {
    let r = randFloat() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r < 0) return items[i]; }
    return items[items.length - 1];
  };
  const pad = (n) => String(n + 1).padStart(2, '0');

  // kata yang boleh dipakai di mode speaking: hanya noun (termasuk verb 1 yang juga noun), kata umum
  const speakPool = (letter) => (DICT[letter] || []).filter((w) => w[1].includes('n') && w[2] < COMMON_RANK);

  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) {}
  }
  function validGame(g) {
    return g && Array.isArray(g.letters) && g.letters.length && g.letters.every((l) => DICT[l]);
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (!s) return;
      state.mode = s.mode === 'speak' ? 'speak' : 'vocab';
      state.pos = s.pos || 'all';
      state.sort = s.sort || 'az';
      for (const m of ['vocab', 'speak']) {
        if (validGame(s[m])) {
          state[m] = { ...blankGame(), ...s[m] };
          state[m].words = state[m].letters.map((_, i) => s[m].words?.[i] || '');
        }
      }
    } catch (_) {}
  }

  let toastTimer;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 1400);
  }

  // ---------- mode 1: vocab ----------
  function newVocab(count) {
    const g = state.vocab;
    g.count = count;
    g.letters = Array.from({ length: count }, () => pickWeighted(VOCAB_LETTERS, VOCAB_W));
    g.words = Array(count).fill('');
    g.active = 0;
  }

  function wordsFor(letter, pos = 'all') {
    const list = DICT[letter] || [];
    return pos === 'all' ? list : list.filter((w) => w[1].includes(pos));
  }

  function randomVocabWord(i) {
    const g = state.vocab;
    const used = new Set(g.words.filter(Boolean));
    let pool = wordsFor(g.letters[i]).filter((w) => !used.has(w[0]));
    const common = pool.filter((w) => w[2] < COMMON_RANK);
    if (common.length) pool = common;
    if (!pool.length) pool = wordsFor(g.letters[i]);
    return pick(pool)[0];
  }

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

  // ---------- mode 2: speaking ----------
  function speakWordFor(letter, used) {
    const pool = speakPool(letter).filter((w) => !used.has(w[0]));
    const pure = pool.filter((w) => w[1] === 'n');
    const both = pool.filter((w) => w[1] === 'nv');
    let src = randFloat() < SPEAK_PURE_NOUN_RATIO ? pure : both;
    if (!src.length) src = pure.length ? pure : both;
    if (!src.length) src = speakPool(letter);
    return pick(src)[0];
  }

  function newSpeak(count) {
    const g = state.speak;
    g.count = count;
    g.letters = Array.from({ length: count }, () => pickWeighted(SPEAK_LETTERS, SPEAK_W));
    const used = new Set();
    g.words = g.letters.map((l) => {
      const w = speakWordFor(l, used);
      used.add(w);
      return w;
    });
    g.active = -1;
  }

  // text-to-speech bawaan browser untuk latihan pelafalan
  function speak(text, onend) {
    if (!('speechSynthesis' in window)) { toast('Browser tidak mendukung suara'); return; }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.9;
    if (onend) u.onend = onend;
    speechSynthesis.speak(u);
  }

  let speakingAll = false;
  function speakAll() {
    if (speakingAll) {
      speechSynthesis.cancel();
      speakingAll = false;
      $('btnSpeakAll').textContent = 'Dengarkan semua';
      return;
    }
    const g = state.speak;
    speechSynthesis.cancel();
    speakingAll = true;
    $('btnSpeakAll').textContent = 'Stop';
    let i = 0;
    const step = () => {
      if (!speakingAll || i >= g.count) {
        speakingAll = false;
        $('btnSpeakAll').textContent = 'Dengarkan semua';
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

  // ---------- render ----------
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
      b.className = 'slot' + (i === g.active ? ' active' : '');
      const w = g.words[i];
      b.innerHTML = `<span class="num">${pad(i)}</span><span class="let">${l}</span><span class="word${w ? '' : ' empty'}"></span>`;
      b.querySelector('.word').textContent = w || 'pilih kata…';
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
    const all = wordsFor(letter, state.pos);
    let list = q ? all.filter((w) => w[0].includes(q)) : all;
    const byOrder = state.sort === 'common' ? (a, b) => a[2] - b[2] : (a, b) => a[0].localeCompare(b[0]);
    list = [...list].sort((a, b) => (q ? b[0].startsWith(q) - a[0].startsWith(q) : 0) || byOrder(a, b));
    el.dictMeta.textContent = q ? `${list.length} dari ${all.length} kata cocok` : `${all.length} kata`;

    const used = new Set(g.words.filter(Boolean));
    const current = g.words[i];
    const frag = document.createDocumentFragment();
    for (const [word, pos] of list) {
      const b = document.createElement('button');
      b.className = 'w' + (word === current ? ' picked' : used.has(word) ? ' used' : '');
      b.innerHTML = `<span></span><small>${pos === 'nv' ? 'n·v' : pos}</small>`;
      b.firstChild.textContent = word;
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

  function render() {
    document.body.className = 'mode-' + state.mode;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === state.mode));
    el.countSel.value = String(game().count);
    renderSequence();
    renderSlots();
    renderDict();
    renderOutput();
    save();
  }

  function onSlot(i) {
    const g = game();
    g.active = i;
    if (state.mode === 'speak') {
      speechSynthesis?.cancel();
      speakingAll = false;
      $('btnSpeakAll').textContent = 'Dengarkan semua';
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
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    speakingAll = false;
    $('btnSpeakAll').textContent = 'Dengarkan semua';
    state.mode = mode;
    if (!game().letters.length) (mode === 'vocab' ? newVocab : newSpeak)(24);
    if (mode === 'vocab' && game().active < 0) game().active = 0;
    render();
  }

  // ---------- events ----------
  function bind() {
    document.querySelectorAll('.tab').forEach((t) => { t.onclick = () => setMode(t.dataset.mode); });
    el.countSel.onchange = () => {
      (state.mode === 'vocab' ? newVocab : newSpeak)(+el.countSel.value);
      render();
    };
    $('btnNewLetters').onclick = () => { newVocab(+el.countSel.value); render(); toast('Huruf baru diacak'); };
    $('btnFillAll').onclick = () => {
      const g = state.vocab;
      g.words.forEach((w, i) => { if (!w) g.words[i] = randomVocabWord(i); });
      render();
    };
    $('btnClear').onclick = () => {
      const g = state.vocab;
      g.words = Array(g.count).fill('');
      g.active = 0;
      render();
    };
    $('btnGenerate').onclick = () => {
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      speakingAll = false;
      $('btnSpeakAll').textContent = 'Dengarkan semua';
      newSpeak(+el.countSel.value);
      render();
      toast('Kata baru dibuat');
    };
    $('btnSpeakAll').onclick = speakAll;
    $('btnRandomWord').onclick = () => setWord(state.vocab.active, randomVocabWord(state.vocab.active), false);
    $('btnRerollLetter').onclick = () => {
      const g = state.vocab;
      const i = g.active;
      let l;
      do { l = pickWeighted(VOCAB_LETTERS, VOCAB_W); } while (l === g.letters[i]);
      g.letters[i] = l;
      g.words[i] = '';
      render();
    };
    el.search.oninput = renderDict;
    el.search.onkeydown = (e) => {
      if (e.key === 'Enter') el.wordList.querySelector('.w')?.click();
    };
    $('sortSel').onchange = (e) => { state.sort = e.target.value; renderDict(); save(); };
    document.querySelectorAll('.chip-f').forEach((b) => {
      b.onclick = () => {
        state.pos = b.dataset.pos;
        document.querySelectorAll('.chip-f').forEach((x) => x.classList.toggle('active', x === b));
        renderDict();
        save();
      };
    });
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
    const res = await fetch('words.json');
    DICT = await res.json();
    // bobot huruf = akar jumlah kata, supaya huruf langka (q, z, y) tidak terlalu sering muncul
    VOCAB_LETTERS = Object.keys(DICT).filter((l) => DICT[l].length >= MIN_WORDS_PER_LETTER);
    VOCAB_W = VOCAB_LETTERS.map((l) => Math.sqrt(DICT[l].length));
    SPEAK_LETTERS = Object.keys(DICT).filter((l) => speakPool(l).length >= MIN_WORDS_PER_LETTER);
    SPEAK_W = SPEAK_LETTERS.map((l) => Math.sqrt(speakPool(l).length));

    load();
    if (!state.vocab.letters.length) newVocab(24);
    if (!state.speak.letters.length) newSpeak(24);
    $('sortSel').value = state.sort;
    document.querySelectorAll('.chip-f').forEach((x) => x.classList.toggle('active', x.dataset.pos === state.pos));
    bind();
    render();
  }

  init().catch((err) => {
    console.error(err);
    el.wordList.textContent = 'Gagal memuat kamus (words.json).';
  });
})();
