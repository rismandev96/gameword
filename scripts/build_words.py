"""Bangun words.json dari daftar BIP-39 bahasa Inggris (2048 kata).

Pemakaian:
    python3 scripts/build_words.py data/bip39-english.txt words.json [frekuensi.txt]
frekuensi.txt (opsional) = daftar kata urut dari yang paling umum, dipakai untuk urutan "Paling umum".
Format keluaran: [[kata, rank], ...] dengan URUTAN ASLI BIP-39, jadi posisi = indeks (0 = abandon, 2047 = zoo).
"""
import hashlib, json, sys

src, out = sys.argv[1], sys.argv[2]
OFFICIAL_SHA256 = '2f5eed53a4727b4bf8880d8f3f199efc90e58503646d9ff8eff3a2ed3b24dbda'
raw = open(src, 'rb').read()
assert hashlib.sha256(raw).hexdigest() == OFFICIAL_SHA256, 'bukan daftar BIP-39 resmi'

rank_of = {}
if len(sys.argv) > 3:
    for i, w in enumerate(open(sys.argv[3])):
        rank_of.setdefault(w.strip().lower(), i)

words = raw.decode().split()
assert len(words) == 2048 and len(set(words)) == 2048
json.dump([[w, rank_of.get(w, 99999)] for w in words], open(out, 'w'), separators=(',', ':'))
print(len(words), words[0], words[-1])
