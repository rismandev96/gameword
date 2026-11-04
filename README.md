# Tebak Kata

Webapp statis (HTML + CSS + JS, tanpa backend) untuk latihan kosakata bahasa Inggris.

## Mode

Semua kata diambil dari **daftar BIP-39 bahasa Inggris (2048 kata)** dan dibentuk lewat proses BIP-39 asli:

1. entropy = angka **hex acak** dari server Python (`secrets`): 64 karakter hex = 256 bit untuk 24 kata,
   32 karakter hex = 128 bit untuk 12 kata. Tiap karakter hex = 4 bit.
2. SHA-256 dari entropy
3. checksum = ENT/32 bit pertama hasil hash
4. entropy + checksum digabung
5. dipotong per 11 bit, lalu tiap potongan jadi angka desimal 0–2047
6. angka itu dicocokkan ke kamus BIP-39 (0 = abandon)

Semua langkah ditampilkan di panel **Simulasi matematis BIP-39**.

- **Vocab (pilih kata)**: huruf berasal dari frasa BIP-39 valid yang disembunyikan. Siswa memilih kata untuk tiap huruf,
  lalu **Cek jawaban** (benar/salah per kata + cek checksum kebalikannya) dan **Tampilkan jawaban** (simulasi lengkap).
- **Speaking (otomatis)**: frasa langsung muncul. Klik kata untuk mendengar pelafalannya, atau "Dengarkan semua".
  Sumber entropy: **Acak (Python)** atau **Ketik entropy** (hex/biner, termasuk **Contoh materi**:
  indeks 1–11 + 7 bit nol, yang hasil kata ke-12-nya *absent*).

- **Entropy lemah (demo serangan)**: frasa 12 kata dibuat dari entropy yang lemah, lalu tombol **Serang** mencoba menebaknya
  langsung di browser (`weak.js`). Skenario: pola mudah (50 pola dalam 7 kelompok: dasar & bitwise, urutan, hexspeak/memory debug, bug ASCII, hash/brain wallet, PRNG terpotong & timestamp, pola yang menghasilkan kata tertentu; plus pola hex ketikan sendiri), brain wallet (SHA-256 dari tanggal lahir,
  nama, PIN, dengan ruang tebakan ±19 miliar: PIN/nomor 1–10 digit, leetspeak, gabungan 2–3 kata; serangan dibatasi ~12 detik lalu dilaporkan apa adanya), pengacak lemah yang di-seed jam (mulberry32, mirip modul `random`), dan bocor (termasuk menampilkan entropy
  yang disimpan app ini di browser). Hasilnya dibandingkan dengan entropy kuat 2^128. Demo ini hanya mencocokkan entropy
  frasa buatan app sendiri, tidak memeriksa alamat atau saldo dompet apa pun.

Hasilnya ditampilkan di bawah: urutan huruf, kata per baris, dan gabungan dengan spasi (masing-masing bisa disalin).

`bip39.js` sudah diuji dengan test vector resmi BIP-39 (misal entropy `00…00` → `abandon … about`).

> Ini alat belajar. Frasa yang tampil di layar dan tersimpan di browser **tidak aman**, jangan pernah dipakai untuk dompet kripto sungguhan.

## Pengacakan: server Python

Angka hex acak untuk entropy (dan tombol "Kata acak") dibuat oleh **Vercel Python Function** `api/entropy.py`
memakai modul `secrets` (pengacak kriptografis). Modul `random` sengaja tidak dipakai karena hasilnya bisa ditebak.
Browser tidak mengacak apa pun; `bip39.js` hanya menghitung SHA-256, checksum, dan pemetaan kata.

- `GET /api/entropy?kind=hex&bits=256` → `{"hex": "6ba98e8f…"}` (64 karakter hex)
- `GET /api/entropy?kind=u32&count=24` → bilangan acak 32-bit

## Jalankan lokal

```bash
python3 dev_server.py
```

Lalu buka http://localhost:8000 (`dev_server.py` melayani file statis + `/api/entropy` dengan kode yang sama).

## Deploy ke Vercel

Import repo ini di Vercel, framework preset **Other**, tanpa build command. Folder `api/` otomatis jadi Python Function.

## Kamus (`words.json`)

Dibuat oleh `scripts/build_words.py` dari `data/bip39-english.txt`
(daftar resmi: https://github.com/bitcoin/bips/blob/master/bip-0039/english.txt).
Format: `[[kata, rank], ...]` dengan urutan asli BIP-39 (posisi = indeks). `rank` = peringkat kata umum (untuk urutan "Paling umum").
