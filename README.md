# Tebak Kata

Webapp statis (HTML + CSS + JS, tanpa backend) untuk latihan kosakata bahasa Inggris.

## Mode

1. **Vocab (pilih kata)**: 24 huruf diacak (misal `n-p-c-b-...`). Klik slot, lalu pilih kata dari kamus huruf itu.
   Isi kamus hanya **noun** dan **verb bentuk dasar (V1)**. Ada pencarian, filter Noun/Verb, dan urutan A–Z / paling umum.
2. **Speaking (otomatis)**: 24 huruf dan katanya langsung muncul, tidak perlu memilih. Isinya **hanya noun**
   (kira-kira 80% noun murni, sisanya kata V1 yang juga dipakai sebagai noun, misal *walk*, *run*). Klik kata untuk mendengar
   pelafalannya, atau tekan "Dengarkan semua".

Hasil keduanya ditampilkan di bawah: urutan huruf, kata per baris, dan gabungan dengan spasi (masing-masing bisa disalin).

Bentuk V2/V3 tidak beraturan (*went, broken, saw, ...*), bentuk -ing/-ed, dan plural tidak dipakai.

## Jalankan lokal

```bash
python3 -m http.server 8000
```

Lalu buka http://localhost:8000

## Deploy ke Vercel

Import repo ini di Vercel, framework preset **Other**, tanpa build command, output directory `.` (root). Selesai.

## Kamus (`words.json`)

Dibuat oleh `scripts/build_words.py` dari daftar frekuensi kata bahasa Inggris, disaring dengan WordNet:
hanya kata yang tercatat sebagai noun/verb bentuk dasar, bukan adjektiva/adverbia dominan, bukan kata fungsi,
bukan bentuk V2/V3/plural. Format: `{ "a": [[kata, "n" | "v" | "nv", rank], ...] }`.
