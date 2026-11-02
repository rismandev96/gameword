// BIP-39: entropy -> SHA-256 -> checksum -> potongan 11-bit -> indeks -> kata.
// SHA-256 ditulis manual (bukan crypto.subtle) supaya jalan juga di http biasa / browser lama.
(function (global) {
  'use strict';

  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function sha256(bytes) {
    const len = bytes.length;
    const total = Math.ceil((len + 9) / 64) * 64;
    const m = new Uint8Array(total);
    m.set(bytes);
    m[len] = 0x80;
    const bitLen = len * 8;
    const dv = new DataView(m.buffer);
    dv.setUint32(total - 8, Math.floor(bitLen / 2 ** 32));
    dv.setUint32(total - 4, bitLen >>> 0);
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const rotr = (x, n) => (x >>> n) | (x << (32 - n));
    for (let off = 0; off < total; off += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) >>> 0;
        const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    const out = new Uint8Array(32);
    const odv = new DataView(out.buffer);
    H.forEach((v, i) => odv.setUint32(i * 4, v));
    return out;
  }

  const bytesToBin = (bytes) => Array.from(bytes, (b) => b.toString(2).padStart(8, '0')).join('');
  const bytesToHex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const binToBytes = (bin) => Uint8Array.from(bin.match(/.{8}/g) || [], (s) => parseInt(s, 2));

  // jumlah kata -> panjang entropy (bit). 12 kata = 128 bit, 24 kata = 256 bit.
  const entBitsFor = (wordCount) => (wordCount * 11 * 32) / 33;

  // Pengacakan TIDAK dilakukan di sini (bukan crypto.getRandomValues browser).
  // Lemparan koin/dadu otomatis dibuat server Python (api/entropy.py); file ini hanya menghitung.
  const coinsToBits = (coins) => coins.join('');

  // Lempar dadu: 1→00, 2→01, 3→10, 4→11, 5→0, 6→1.
  // Tanpa bias: kalau keluar 1–4, keempat pola 2-bit sama peluangnya; kalau keluar 5–6, bit 0/1 sama peluangnya.
  const DICE_BITS = { 1: '00', 2: '01', 3: '10', 4: '11', 5: '0', 6: '1' };
  const diceToBits = (faces) => faces.map((f) => DICE_BITS[f]).join('');

  // statistik sederhana untuk mendeteksi pola "buatan manusia"
  function bitStats(bits) {
    const ones = (bits.match(/1/g) || []).length;
    let longest = 0, run = 0;
    for (let i = 0; i < bits.length; i++) {
      run = i && bits[i] === bits[i - 1] ? run + 1 : 1;
      if (run > longest) longest = run;
    }
    let alternations = 0;
    for (let i = 1; i < bits.length; i++) if (bits[i] !== bits[i - 1]) alternations++;
    const n = bits.length;
    const warnings = [];
    if (Math.abs(ones - n / 2) > 3 * Math.sqrt(n) / 2) warnings.push(`jumlah 1 dan 0 terlalu timpang (${ones} vs ${n - ones})`);
    if (longest > Math.log2(n) + 6) warnings.push(`ada deret angka sama sepanjang ${longest}`);
    if (longest < Math.log2(n) - 3) warnings.push(`deret terpanjang cuma ${longest}; hasil acak asli biasanya punya deret lebih panjang (sekitar ${Math.round(Math.log2(n))})`);
    const altRatio = alternations / (n - 1);
    if (altRatio > 0.65) warnings.push('angka terlalu sering berganti (mirip pola 1010…)');
    if (altRatio < 0.35) warnings.push('angka terlalu jarang berganti');
    return { n, ones, zeros: n - ones, longest, alternations, warnings };
  }

  // Ubah teks biner (0/1) atau hex menjadi byte entropy. Panjang harus 128/160/192/224/256 bit.
  function parseEntropy(text) {
    const t = text.replace(/\s+/g, '').toLowerCase();
    const okLen = (n) => [128, 160, 192, 224, 256].includes(n);
    let bin;
    // teks yang isinya cuma 0/1 bisa biner atau hex (mis. "0000…"): biner kalau panjangnya pas, selain itu hex
    if (/^[01]+$/.test(t) && okLen(t.length)) bin = t;
    else if (/^(0x)?[0-9a-f]+$/.test(t)) bin = t.replace(/^0x/, '').split('').map((c) => parseInt(c, 16).toString(2).padStart(4, '0')).join('');
    else throw new Error('Isi hanya angka 0/1 (biner) atau 0-9 a-f (hex).');
    if (/^[01]+$/.test(t) && !okLen(bin.length)) bin = t; // pesan error pakai panjang biner
    if (!okLen(bin.length)) {
      throw new Error(`Panjang entropy ${bin.length} bit. Harus 128, 160, 192, 224, atau 256 bit.`);
    }
    return binToBytes(bin);
  }

  // Proses lengkap entropy -> kata, dengan semua langkah perantara untuk ditampilkan.
  function fromEntropy(entropy, wordlist) {
    const entBits = bytesToBin(entropy);
    const ENT = entBits.length;
    const CS = ENT / 32;
    const hash = sha256(entropy);
    const hashHex = bytesToHex(hash);
    const checksum = bytesToBin(hash).slice(0, CS);
    const all = entBits + checksum;
    const groups = all.match(/.{11}/g).map((bits) => {
      const index = parseInt(bits, 2);
      return { bits, index, word: wordlist[index] };
    });
    return { ENT, CS, entBits, entHex: bytesToHex(entropy), hashHex, checksum, all, groups, words: groups.map((g) => g.word) };
  }

  // Kebalikannya: kata -> indeks -> bit -> cek apakah checksum cocok.
  function check(words, indexOf) {
    const idx = words.map((w) => indexOf.get(w));
    if (idx.some((i) => i === undefined)) return { ok: false, reason: 'unknown' };
    if (![12, 15, 18, 21, 24].includes(words.length)) return { ok: false, reason: 'length' };
    const all = idx.map((i) => i.toString(2).padStart(11, '0')).join('');
    const ENT = (all.length * 32) / 33;
    const CS = ENT / 32;
    const entBits = all.slice(0, ENT);
    const given = all.slice(ENT);
    const hash = sha256(binToBytes(entBits));
    const expected = bytesToBin(hash).slice(0, CS);
    return { ok: given === expected, ENT, CS, entBits, given, expected, hashHex: bytesToHex(hash), idx, all };
  }

  global.BIP39 = {
    sha256, bytesToBin, bytesToHex, binToBytes, entBitsFor, parseEntropy, fromEntropy, check,
    coinsToBits, diceToBits, DICE_BITS, bitStats,
  };
})(window);
