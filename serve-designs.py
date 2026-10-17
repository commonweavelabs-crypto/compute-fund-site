"""Static server for the design-exploration comparison pages (Gui review).
Serves design-exploration/ at 0.0.0.0:8860 so LAN devices can open it too."""
import http.server, socketserver, functools, os
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "design-exploration")

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw): super().__init__(*a, directory=DIR, **kw)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

with socketserver.TCPServer(("0.0.0.0", 8860), H) as httpd:
    print("serving design-exploration on http://localhost:8860/compare.html", flush=True)
    httpd.serve_forever()
