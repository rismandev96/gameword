"""Bangun words.json dari daftar BIP-39 bahasa Inggris (2048 kata), dikelompokkan per huruf awal.

Pemakaian:
    python3 scripts/build_words.py data/bip39-english.txt words.json [frekuensi.txt]
frekuensi.txt (opsional) = daftar kata urut dari yang paling umum, dipakai untuk urutan "Paling umum".
Format keluaran: { "a": [[kata, rank], ...], ... }
"""
import json, sys
from collections import defaultdict

src, out = sys.argv[1], sys.argv[2]
rank_of = {}
if len(sys.argv) > 3:
    for i, w in enumerate(open(sys.argv[3])):
        rank_of.setdefault(w.strip().lower(), i)

words = [w.strip().lower() for w in open(src) if w.strip()]
assert len(words) == 2048 and len(set(words)) == 2048, len(words)

by = defaultdict(list)
for w in words:
    by[w[0]].append([w, rank_of.get(w, 99999)])
json.dump({k: sorted(by[k]) for k in sorted(by)}, open(out, 'w'), separators=(',', ':'))
print(sum(len(v) for v in by.values()), {k: len(v) for k, v in sorted(by.items())})
