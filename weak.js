// Demo ENTROPY LEMAH untuk pelajaran: bagaimana entropy buatan manusia / pengacak lemah bisa ditebak.
// "Serangan" di sini hanya mencocokkan entropy frasa buatan app ini sendiri. Tidak ada pengecekan alamat
// atau saldo dompet apa pun.
(function (global) {
  'use strict';

  const B = global.BIP39;
  const enc = new TextEncoder();
  const ENT_BYTES = 16; // semua demo memakai 12 kata = 128 bit

  // ---------- 1. Pola mudah ----------
  // [kunci, label, hex 128 bit, kelompok]. Semua nilai sudah dicek ulang (SHA-256, ASCII, kata yang dihasilkan).
  const PATTERNS = [
    // 1. Dasar & bitwise
    ['zeros', 'Semua nol (= Unix epoch 0)', '00'.repeat(16), 'Dasar & bitwise'],
    ['ones', 'Semua satu (ffff…)', 'ff'.repeat(16), 'Dasar & bitwise'],
    ['msb', 'Angka 1 di awal (8000…)', '8' + '0'.repeat(31), 'Dasar & bitwise'],
    ['msb1', 'Angka 1 di awal (1000…)', '1' + '0'.repeat(31), 'Dasar & bitwise'],
    ['one', 'Angka 1 di akhir (…0001)', '00'.repeat(15) + '01', 'Dasar & bitwise'],
    ['alt10', 'Pola 1010… (aaaa…)', 'aa'.repeat(16), 'Dasar & bitwise'],
    ['alt01', 'Pola 0101… (5555…)', '55'.repeat(16), 'Dasar & bitwise'],
    ['11', 'Pola 1111… (1111…)', '11'.repeat(16), 'Dasar & bitwise'],
    ['7f', 'Pola 7f7f…', '7f'.repeat(16), 'Dasar & bitwise'],
    ['80', 'Pola 8080…', '80'.repeat(16), 'Dasar & bitwise'],
    ['f0', 'Selang-seling nibble f0f0…', 'f0'.repeat(16), 'Dasar & bitwise'],
    ['0f', 'Selang-seling nibble 0f0f…', '0f'.repeat(16), 'Dasar & bitwise'],
    ['00ff', 'Selang-seling byte 00ff…', '00ff'.repeat(8), 'Dasar & bitwise'],
    ['ff00', 'Selang-seling byte ff00…', 'ff00'.repeat(8), 'Dasar & bitwise'],
    ['half01', 'Setengah nol, setengah satu', '0'.repeat(16) + 'f'.repeat(16), 'Dasar & bitwise'],
    ['half10', 'Setengah satu, setengah nol', 'f'.repeat(16) + '0'.repeat(16), 'Dasar & bitwise'],
    // 2. Urutan
    ['seq', 'Urutan maju hex 0123…f', '0123456789abcdef'.repeat(2), 'Urutan'],
    ['rev', 'Urutan mundur hex fedc…0', 'fedcba9876543210'.repeat(2), 'Urutan'],
    ['byteseq', 'Urutan byte maju 00 01 02 … 0f', '000102030405060708090a0b0c0d0e0f', 'Urutan'],
    ['byterev', 'Urutan byte mundur 0f 0e … 00', '0f0e0d0c0b0a09080706050403020100', 'Urutan'],
    // 3. Hexspeak & memory debug
    ['dead', 'deadbeef…', 'deadbeef'.repeat(4), 'Hexspeak & memory debug'],
    ['cafe', 'cafebabe…', 'cafebabe'.repeat(4), 'Hexspeak & memory debug'],
    ['deadc0de', 'deadc0de…', 'deadc0de'.repeat(4), 'Hexspeak & memory debug'],
    ['8badf00d', '8badf00d… (crash iOS)', '8badf00d'.repeat(4), 'Hexspeak & memory debug'],
    ['baadf00d', 'baadf00d… (heap Windows)', 'baadf00d'.repeat(4), 'Hexspeak & memory debug'],
    ['cccc', 'cccc… (stack MSVC)', 'cc'.repeat(16), 'Hexspeak & memory debug'],
    ['cdcd', 'cdcd… (heap MSVC)', 'cd'.repeat(16), 'Hexspeak & memory debug'],
    ['feee', 'feeefeee… (memori sudah dibebaskan)', 'feee'.repeat(8), 'Hexspeak & memory debug'],
    // 4. Bug konversi ASCII (teks langsung dipakai sebagai byte)
    ['a0', 'ASCII "0000000000000000"', '30'.repeat(16), 'Bug konversi ASCII'],
    ['a1', 'ASCII "1111111111111111"', '31'.repeat(16), 'Bug konversi ASCII'],
    ['a1234', 'ASCII "1234567890123456"', '31323334353637383930313233343536', 'Bug konversi ASCII'],
    ['aabc', 'ASCII "abcdef0123456789"', '61626364656630313233343536373839', 'Bug konversi ASCII'],
    ['aqwe', 'ASCII "qwertyuiopasdfgh"', '71776572747975696f70617364666768', 'Bug konversi ASCII'],
    ['apass', 'ASCII "passwordpassword"', '70617373776f726470617373776f7264', 'Bug konversi ASCII'],
    ['aspace', 'ASCII 16 spasi', '20'.repeat(16), 'Bug konversi ASCII'],
    // 5. Hash / brain wallet (16 byte pertama SHA-256)
    ['hempty', 'SHA-256("") — teks kosong', 'e3b0c44298fc1c149afbf4c8996fb924', 'Hash / brain wallet'],
    ['h0', 'SHA-256("0")', '5feceb66ffc86f38d952786c6d696c79', 'Hash / brain wallet'],
    ['h1', 'SHA-256("1")', '6b86b273ff34fce19d6b804eff5a3f57', 'Hash / brain wallet'],
    ['h123456', 'SHA-256("123456")', '8d969eef6ecad3c29a3a629280e686cf', 'Hash / brain wallet'],
    ['hpass', 'SHA-256("password")', '5e884898da28047151d0e56f8dc62927', 'Hash / brain wallet'],
    ['hbtc', 'SHA-256("bitcoin")', '6b88c087247aa2f07ee1c5956b8e1a9f', 'Hash / brain wallet'],
    ['hsat', 'SHA-256("satoshi")', 'da2876b3eb31edb4436fa4650673fc6f', 'Hash / brain wallet'],
    // 6. PRNG terpotong & timestamp
    ['p32a', 'PRNG 32-bit + nol di belakang', '65432100' + '0'.repeat(24), 'PRNG terpotong & timestamp'],
    ['p32b', 'PRNG 32-bit + nol di depan', '0'.repeat(24) + '65432100', 'PRNG terpotong & timestamp'],
    ['p64', 'PRNG 64-bit + nol', '0123456789abcdef' + '0'.repeat(16), 'PRNG terpotong & timestamp'],
    ['clone', 'Potongan 32-bit berulang (bug clone)', '1a2b3c4d'.repeat(4), 'PRNG terpotong & timestamp'],
    ['ts1700', 'Unix timestamp 1700000000 (+ nol)', '0'.repeat(24) + '6553f100', 'PRNG terpotong & timestamp'],
    // 7. Menghasilkan kata tertentu
    ['zoo', 'zoo ×11 + what', 'f'.repeat(31) + 'c', 'Menghasilkan kata tertentu'],
    ['bacon', 'bacon ×11 + awkward', '1142284508a1142284508a1142284508', 'Menghasilkan kata tertentu'],
    ['urut', 'abandon ability able … (indeks 0–10)', '00000401003008014030070100240500', 'Menghasilkan kata tertentu'],
  ];

  // Pola ketikan sendiri: seed hex pendek (mis. "cafe") diulang-ulang jadi 32 hex = 128 bit.
  function customPattern(text) {
    const seed = String(text).replace(/\s+/g, '').toLowerCase();
    if (!seed) throw new Error('Ketik polanya dulu');
    if (!/^[0-9a-f]+$/.test(seed)) throw new Error('Pola hanya boleh karakter hex: 0-9 dan a-f');
    let h = '';
    while (h.length < 32) h += seed;
    h = h.slice(0, 32);
    return { seed, hex: h, bytes: Uint8Array.from(h.match(/.{2}/g), (x) => parseInt(x, 16)) };
  }

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

  // leetspeak: ganti huruf dengan angka/simbol yang mirip (a->4, e->3, i->1/!, o->0, s->5/$)
  const LEET = { a: ['4', '@'], e: ['3'], i: ['1', '!'], o: ['0'], s: ['5', '$'], t: ['7'] };
  function* leetVariants(word) {
    const positions = [];
    for (let i = 0; i < word.length; i++) if (LEET[word[i]]) positions.push(i);
    const cap = Math.min(positions.length, 4); // batasi supaya tidak meledak per kata
    const used = positions.slice(0, cap);
    const combos = 1 << used.length;
    for (let mask = 0; mask < combos; mask++) {
      const opt = [];
      let ok = true;
      for (let b = 0; b < used.length; b++) {
        if (mask & (1 << b)) { const r = LEET[word[used[b]]]; opt.push([used[b], r]); }
      }
      // pilih varian pertama tiap posisi (cukup untuk demo; menjaga ukuran wajar)
      let s = word.split('');
      for (const [pos, reps] of opt) s[pos] = reps[0];
      yield s.join('');
    }
  }

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
    // angka 1–10 digit: mencakup PIN, tanggal, dan nomor HP yang sering dipakai sebagai "sandi"
    const pins = function* () {
      for (let len = 1; len <= 10; len++) for (let i = 0, max = 10 ** len; i < max; i++) yield String(i).padStart(len, '0');
    };
    // gabungan dua kata umum, dengan pemisah & akhiran: "sayangku", "cinta123", "budi_dewi"
    const wordPairs = function* (words, seps, suffixes) {
      for (const a of words) for (const b of words) for (const sep of seps) for (const s of suffixes) yield a + sep + b + s;
    };
    const leetAll = function* (words) {
      for (const w of words) { for (const v of leetVariants(w)) yield v; for (const v of leetVariants(cap(w))) yield v; }
    };
    let dateCount = 0;
    for (let y = 1940; y <= 2026; y++) for (let m = 1; m <= 12; m++) dateCount += new Date(y, m, 0).getDate();
    const sfx = [...SHORT, ...YEARS];
    const WL = bip39Words.length;
    const allWords = [...COMMON, ...NAMES];
    const pairSeps = ['', '1', '!', '_', '.', '-', '12', '123', '2024', '2025'];
    const pairSfx = ['', '1', '12', '123', '!', '123!'];
    const leetSize = (ws) => ws.reduce((n, w) => { let p = 0; for (const c of w) if (LEET[c]) p++; return n + 2 * (1 << Math.min(p, 4)); }, 0);
    return [
      ['Kata sandi populer + angka', COMMON.length * sfx.length * 2, () => withSuffix(COMMON, sfx)],
      ['Nama orang + angka/tahun', NAMES.length * sfx.length * 2, () => withSuffix(NAMES, sfx)],
      ['Kata BIP-39 + angka', WL * 8 * 2, () => withSuffix(bip39Words, ['', '1', '12', '123', '1234', '12345', '!', '123!'])],
      ['Tanggal lahir (DDMMYYYY)', dateCount, () => dates('dmy')],
      ['Tanggal lahir (YYYYMMDD)', dateCount, () => dates('ymd')],
      ['PIN, tanggal & nomor HP 1–10 digit', 11111111110, pins],
      ['Variasi leetspeak (p4ssw0rd)', leetSize(allWords), () => leetAll(allWords)],
      ['Gabungan dua kata (sayang_budi123)', allWords.length * allWords.length * pairSeps.length * pairSfx.length, () => wordPairs(allWords, pairSeps, pairSfx)],
      ['Dua kata BIP-39 (ocean-tiger)', WL * WL * 3, function* () { for (const a of bip39Words) for (const b of bip39Words) for (const sep of ['', ' ', '-']) yield a + sep + b; }],
      ['Tiga kata BIP-39 (ocean tiger lamp)', WL * WL * WL, function* () { for (const a of bip39Words) for (const b of bip39Words) for (const c of bip39Words) yield a + ' ' + b + ' ' + c; }],
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
  // opts.maxMs: batas waktu (ms). Kalau terlewat, berhenti dengan budgetHit:true (bukan berarti aman).
  async function attack(targetHex, lists, toEntropy, onProgress, cancel, opts = {}) {
    const maxMs = opts.maxMs || Infinity;
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
        if ((tries & 0x3fff) === 0 && performance.now() - t0 > maxMs) {
          return { found: false, budgetHit: true, tries, total, category, ms: performance.now() - t0 };
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

  // semua pola berulang pendek: seed 1–4 karakter hex (0, 00…ff, 000…fff, 0000…ffff) diulang jadi 32 hex
  function* tilings(hexLen) {
    for (let len = 1; len <= 4; len++) {
      for (let v = 0, max = 16 ** len; v < max; v++) {
        const seed = v.toString(16).padStart(len, '0');
        let h = '';
        while (h.length < hexLen) h += seed;
        yield h.slice(0, hexLen);
      }
    }
  }

  const patternAttack = (targetHex, onProgress, cancel) =>
    attack(targetHex, [
      ['Daftar pola terkenal', PATTERNS.length, () => PATTERNS.map((p) => p[2])[Symbol.iterator]()],
      ['Semua pola berulang 1–4 karakter', 16 + 256 + 4096 + 65536, () => tilings(targetHex.length)],
    ], (hex) => Uint8Array.from(hex.match(/.{2}/g), (h) => parseInt(h, 16)), onProgress, cancel);

  const brainAttack = (targetHex, bip39Words, onProgress, cancel, maxMs) =>
    attack(targetHex, brainGuessLists(bip39Words), brainEntropy, onProgress, cancel, { maxMs });

  // coba semua detik dari sekarang mundur 24 jam
  function seedAttack(targetHex, nowSec, onProgress, cancel) {
    const DAY = 86400;
    const gen = function* () { for (let s = nowSec; s > nowSec - DAY; s--) yield s; };
    return attack(targetHex, [['Detik dalam 24 jam terakhir', DAY, gen]], seedEntropy, onProgress, cancel);
  }

  global.WeakLab = { PATTERNS, customPattern, brainEntropy, seedEntropy, patternAttack, brainAttack, seedAttack };
})(window);
