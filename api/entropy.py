"""Vercel Python Function:
    GET /api/entropy?kind=coin|dice&bits=128   -> lemparan koin / dadu untuk entropy
    GET /api/entropy?kind=u32&count=24         -> bilangan acak 32-bit (untuk tombol "Kata acak")

Mensimulasikan lempar koin / dadu memakai modul `secrets` Python.
(Bukan modul `random`: `random` memakai Mersenne Twister yang bisa ditebak.)

Koin : Angka = 1, Gambar = 0, satu lemparan = 1 bit -> tepat `bits` lemparan.
Dadu : 1->00, 2->01, 3->10, 4->11, 5->0, 6->1 (tanpa bias), dilempar sampai >= `bits` bit.
"""
import json
import secrets
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

VALID_BITS = (128, 160, 192, 224, 256)
DICE_BITS = {1: 2, 2: 2, 3: 2, 4: 2, 5: 1, 6: 1}


def flip_coins(bits):
    return [secrets.randbelow(2) for _ in range(bits)]


def roll_dice(bits):
    faces, total = [], 0
    while total < bits:
        face = secrets.randbelow(6) + 1
        faces.append(face)
        total += DICE_BITS[face]
    return faces


def make_entropy(query):
    """query: dict hasil parse_qs. Mengembalikan (status, dict)."""
    kind = (query.get('kind') or ['coin'])[0]
    if kind == 'u32':
        try:
            count = int((query.get('count') or ['1'])[0])
        except ValueError:
            count = 0
        if not 1 <= count <= 64:
            return 400, {'error': 'count harus 1-64'}
        return 200, {'kind': 'u32', 'values': [secrets.randbits(32) for _ in range(count)], 'generator': 'python secrets'}
    try:
        bits = int((query.get('bits') or ['128'])[0])
    except ValueError:
        bits = 0
    if kind not in ('coin', 'dice') or bits not in VALID_BITS:
        return 400, {'error': 'kind harus coin/dice, bits harus 128/160/192/224/256'}
    values = flip_coins(bits) if kind == 'coin' else roll_dice(bits)
    return 200, {'kind': kind, 'bits': bits, 'values': values, 'generator': 'python secrets'}


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        status, body = make_entropy(parse_qs(urlparse(self.path).query))
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)
