"""Vercel Python Function:
    GET /api/entropy?kind=hex&bits=256   -> angka hex acak untuk entropy (256 bit = 64 karakter hex)
    GET /api/entropy?kind=u32&count=24   -> bilangan acak 32-bit (untuk tombol "Kata acak")

Memakai modul `secrets` Python, bukan modul `random` (Mersenne Twister, hasilnya bisa ditebak).
"""
import json
import secrets
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse

VALID_BITS = (128, 160, 192, 224, 256)


def _int(query, key, default):
    try:
        return int((query.get(key) or [default])[0])
    except ValueError:
        return None


def make_entropy(query):
    """query: dict hasil parse_qs. Mengembalikan (status, dict)."""
    kind = (query.get('kind') or ['hex'])[0]
    if kind == 'hex':
        bits = _int(query, 'bits', '256')
        if bits not in VALID_BITS:
            return 400, {'error': 'bits harus 128/160/192/224/256'}
        return 200, {'kind': 'hex', 'bits': bits, 'hex': secrets.token_hex(bits // 8), 'generator': 'python secrets'}
    if kind == 'u32':
        count = _int(query, 'count', '1')
        if count is None or not 1 <= count <= 64:
            return 400, {'error': 'count harus 1-64'}
        return 200, {'kind': 'u32', 'values': [secrets.randbits(32) for _ in range(count)], 'generator': 'python secrets'}
    return 400, {'error': 'kind harus hex atau u32'}


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
