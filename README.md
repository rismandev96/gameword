# Tebak Kata

Webapp statis (HTML + CSS + JS, tanpa backend) untuk latihan kosakata bahasa Inggris.

## Mode

Semua kata diambil dari **daftar BIP-39 bahasa Inggris (2048 kata)**, kosakata dasar yang cocok untuk siswa SMA.

1. **Vocab (pilih kata)**: 24 huruf diacak (misal `n-p-c-b-...`). Klik slot, lalu pilih kata dari kamus huruf itu.
   Ada pencarian dan urutan A–Z / paling umum.
2. **Speaking (otomatis)**: 24 huruf dan katanya langsung muncul, tidak perlu memilih. Klik kata untuk mendengar
   pelafalannya, atau tekan "Dengarkan semua".

Hasil keduanya ditampilkan di bawah: urutan huruf, kata per baris, dan gabungan dengan spasi (masing-masing bisa disalin).

> Ini latihan kosakata. Hasilnya **bukan** seed phrase yang valid/aman, jangan dipakai untuk dompet kripto.

## Jalankan lokal

```bash
python3 -m http.server 8000
```

Lalu buka http://localhost:8000

## Deploy ke Vercel

Import repo ini di Vercel, framework preset **Other**, tanpa build command, output directory `.` (root). Selesai.

## Kamus (`words.json`)

Dibuat oleh `scripts/build_words.py` dari `data/bip39-english.txt`
(daftar resmi: https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt).
Format: `{ "a": [[kata, rank], ...] }`, `rank` = urutan kemunculan di daftar frekuensi kata (untuk urutan "Paling umum").
