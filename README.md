# Tebak Kata

Webapp statis (HTML + CSS + JS, tanpa backend) untuk latihan kosakata bahasa Inggris.

## Mode

Semua kata diambil dari **daftar BIP-39 bahasa Inggris (2048 kata)** dan dibentuk lewat proses BIP-39 asli:

1. entropy 128–256 bit (12–24 kata) dari **lempar koin** (Angka = 1, Gambar = 0) atau **lempar dadu**
   (1→00, 2→01, 3→10, 4→11, 5→0, 6→1, aturan tanpa bias). Default-nya simulasi acak; bisa juga koin/dadu asli
   yang dicatat manual (klik atau keyboard). Ada cek pola (jumlah 1 vs 0, deret terpanjang, terlalu sering berganti)
   untuk menunjukkan kenapa angka "karangan kepala" tidak aman.
2. SHA-256 dari entropy
3. checksum = ENT/32 bit pertama hasil hash
4. entropy + checksum digabung
5. dipotong per 11 bit, lalu tiap potongan jadi angka desimal 0–2047
6. angka itu dicocokkan ke kamus BIP-39 (0 = abandon)

Semua langkah ditampilkan di panel **Simulasi matematis BIP-39**.

- **Vocab (pilih kata)**: huruf berasal dari frasa BIP-39 valid yang disembunyikan. Siswa memilih kata untuk tiap huruf,
  lalu **Cek jawaban** (benar/salah per kata + cek checksum kebalikannya) dan **Tampilkan jawaban** (simulasi lengkap).
- **Speaking (otomatis)**: frasa langsung muncul. Klik kata untuk mendengar pelafalannya, atau "Dengarkan semua".
  Sumber entropy bisa dipilih: koin/dadu otomatis, koin/dadu asli (manual), atau ketik entropy (termasuk **Contoh materi**:
  indeks 1–11 + 7 bit nol, yang hasil kata ke-12-nya *absent*).

Hasilnya ditampilkan di bawah: urutan huruf, kata per baris, dan gabungan dengan spasi (masing-masing bisa disalin).

`bip39.js` sudah diuji dengan test vector resmi BIP-39 (misal entropy `00…00` → `abandon … about`).

> Ini alat belajar. Frasa yang tampil di layar dan tersimpan di browser **tidak aman**, jangan pernah dipakai untuk dompet kripto sungguhan.

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
Format: `[[kata, rank], ...]` dengan urutan asli BIP-39 (posisi = indeks). `rank` = peringkat kata umum (untuk urutan "Paling umum").
