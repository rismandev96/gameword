"""Server lokal: file statis + /api/entropy (logika sama persis dengan api/entropy.py di Vercel).

    python3 dev_server.py        # lalu buka http://localhost:8000
"""
import importlib.util
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('entropy_api', os.path.join(ROOT, 'api', 'entropy.py'))
entropy_api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(entropy_api)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_GET(self):
        if urlparse(self.path).path == '/api/entropy':
            return entropy_api.handler.do_GET(self)
        return super().do_GET()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f'http://localhost:{port}')
    ThreadingHTTPServer(('', port), Handler).serve_forever()
