// Demo ENTROPY LEMAH untuk pelajaran: bagaimana entropy buatan manusia / pengacak lemah bisa ditebak.
// "Serangan" di sini hanya mencocokkan entropy frasa buatan app ini sendiri. Tidak ada pengecekan alamat
// atau saldo dompet apa pun.
(function (global) {
  'use strict';

  const B = global.BIP39;
  const enc = new TextEncoder();
  const ENT_BYTES = 16; // semua demo memakai 12 kata = 128 bit

  // ---------- 1. Pola mudah ----------
  const PATTERNS = [
    ['zeros', 'Semua nol', '00'.repeat(16)],
    ['ones', 'Semua satu (ffff…)', 'ff'.repeat(16)],
    ['alt10', 'Pola 1010… (aaaa…)', 'aa'.repeat(16)],
    ['alt01', 'Pola 0101… (5555…)', '55'.repeat(16)],
    ['seq', 'Urutan 0123456789abcdef…', '0123456789abcdef'.repeat(2)],
    ['rev', 'Urutan mundur fedcba98…', 'fedcba9876543210'.repeat(2)],
    ['7f', 'Pola 7f7f…', '7f'.repeat(16)],
    ['80', 'Pola 8080…', '80'.repeat(16)],
    ['dead', 'deadbeef…', 'deadbeef'.repeat(4)],
    ['one', 'Angka 1 lalu nol semua', '00'.repeat(15) + '01'],
    ['11', 'Pola 1111… (1111…)', '11'.repeat(16)],
    ['cafe', 'cafebabe…', 'cafebabe'.repeat(4)],
  ];

  // ---------- 2. Brain wallet: entropy = SHA-256(teks), diambil 128 bit pertama ----------
  const brainEntropy = (text) => B.sha256(enc.encode(text)).slice(0, ENT_BYTES);

  const COMMON = `password 123456 12345678 qwerty abc123 iloveyou admin welcome letmein monkey dragon
    bitcoin satoshi crypto wallet blockchain ethereum rahasia sayang cinta indonesia jakarta bandung surabaya
    merdeka garuda bismillah alhamdulillah sukses kaya bahagia doraemon naruto persib persija mamah papah
    rindu kangen asdfgh zxcvbn passw0rd sandi kunci dompet`.split(/\s+/).filter(Boolean);
  const NAMES = `budi siti agus dewi andi rina joko sri adi ayu eko putri rizki dian fajar indah hendra lestari
    bayu nur wahyu fitri yusuf rahmat ahmad muhammad aditya dimas reza nanda rudi yanti bambang kartika
    arif ani tono tini iwan susi dodi wati ilham lina rangga citra galih ratna kevin nadia bagus intan
    ryan maya gilang tiara yoga sinta rio sari doni mega`.split(/\s+/).filter(Boolean);
  const YEARS = Array.from({ length: 57 }, (_, i) => String(1970 + i)); // 1970–2026
  const SHORT = ['', '1', '12', '123', '1234', '12345', '01', '!', '007', '99'];
  const cap = (s) => s[0].toUpperCase() + s.slice(1);

  // Daftar tebakan, urut dari yang paling sering dipakai orang. Tiap item: [kategori, ukuran, generator]
  function brainGuessLists(bip39Words) {
    const withSuffix = function* (words, suffixes) {
      for (const w of words) for (const s of suffixes) { yield w + s; yield cap(w) + s; }
    };
    const dates = function* (order) {
      for (let y = 1940; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
        const days = new Date(y, m, 0).getDate();
        for (let d = 1; d <= days; d++) {
          const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0');
          yield order === 'dmy' ? dd + mm + y : y + mm + dd;
        }
      }
    };
    const pins = function* () {
      for (let len = 1; len <= 6; len++) for (let i = 0, max = 10 ** len; i < max; i++) yield String(i).padStart(len, '0');
    };
    let dateCount = 0;
    for (let y = 1940; y <= 2026; y++) for (let m = 1; m <= 12; m++) dateCount += new Date(y, m, 0).getDate();
    const sfx = [...SHORT, ...YEARS];
    return [
      ['Kata sandi populer', (COMMON.length) * sfx.length * 2, () => withSuffix(COMMON, sfx)],
      ['Nama orang + angka', NAMES.length * sfx.length * 2, () => withSuffix(NAMES, sfx)],
      ['Kata BIP-39 + angka', bip39Words.length * 6 * 2, () => withSuffix(bip39Words, ['', '1', '12', '123', '1234', '!'])],
      ['Tanggal lahir (DDMMYYYY)', dateCount, () => dates('dmy')],
      ['Tanggal lahir (YYYYMMDD)', dateCount, () => dates('ymd')],
      ['PIN angka 1–6 digit', 1111110, pins],
    ];
  }

  // ---------- 3. Pengacak lemah: seed = jam (detik), seperti modul `random` yang di-seed waktu ----------
  // mulberry32: generator sederhana & cepat, BUKAN untuk kriptografi. Seed sama -> angka sama persis.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return (t ^ (t >>> 14)) >>> 0;
    };
  }
  function seedEntropy(seed) {
    const next = mulberry32(seed);
    const out = new Uint8Array(ENT_BYTES);
    for (let i = 0; i < ENT_BYTES; i += 4) {
      const v = next();
      out[i] = v >>> 24; out[i + 1] = (v >>> 16) & 255; out[i + 2] = (v >>> 8) & 255; out[i + 3] = v & 255;
    }
    return out;
  }

  // ---------- mesin serangan: coba kandidat satu per satu, tanpa membekukan browser ----------
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  // lists: [[kategori, ukuran, () => iterator kandidat]], toEntropy: kandidat -> Uint8Array
  async function attack(targetHex, lists, toEntropy, onProgress, cancel) {
    const target = Uint8Array.from(targetHex.match(/.{2}/g), (h) => parseInt(h, 16));
    const total = lists.reduce((n, l) => n + l[1], 0);
    const t0 = performance.now();
    let tries = 0, lastYield = performance.now();
    for (const [category, , make] of lists) {
      for (const cand of make()) {
        tries++;
        if (sameBytes(toEntropy(cand), target)) {
          return { found: true, candidate: cand, category, tries, total, ms: performance.now() - t0 };
        }
        if (performance.now() - lastYield > 30) {
          onProgress?.(tries, total, category);
          await new Promise((r) => setTimeout(r, 0));
          if (cancel?.()) return { cancelled: true, tries, total, ms: performance.now() - t0 };
          lastYield = performance.now();
        }
      }
    }
    return { found: false, tries, total, ms: performance.now() - t0 };
  }

  const patternAttack = (targetHex, onProgress, cancel) =>
    attack(targetHex, [['Daftar pola terkenal', PATTERNS.length, () => PATTERNS.map((p) => p[2])[Symbol.iterator]()]],
      (hex) => Uint8Array.from(hex.match(/.{2}/g), (h) => parseInt(h, 16)), onProgress, cancel);

  const brainAttack = (targetHex, bip39Words, onProgress, cancel) =>
    attack(targetHex, brainGuessLists(bip39Words), brainEntropy, onProgress, cancel);

  // coba semua detik dari sekarang mundur 24 jam
  function seedAttack(targetHex, nowSec, onProgress, cancel) {
    const DAY = 86400;
    const gen = function* () { for (let s = nowSec; s > nowSec - DAY; s--) yield s; };
    return attack(targetHex, [['Detik dalam 24 jam terakhir', DAY, gen]], seedEntropy, onProgress, cancel);
  }

  global.WeakLab = { PATTERNS, brainEntropy, seedEntropy, patternAttack, brainAttack, seedAttack };
})(window);
