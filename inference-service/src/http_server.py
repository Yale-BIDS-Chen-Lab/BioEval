"""Lightweight HTTP server for synchronous analysis tasks (runs alongside RabbitMQ consumers)."""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json

from statistics.handler import run_statistical_analysis


class RequestHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == "/statistics":
            content_length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(content_length))

            models = body.get("models", {})
            sample_size = body.get("sampleSize", 40)
            n_boot = body.get("nBoot", 1000)

            result = run_statistical_analysis(models, sample_size, n_boot)

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        print(f"[http] {args[0]}")


def start_http_server(port: int = 8000):
    server = HTTPServer(("0.0.0.0", port), RequestHandler)
    print(f"Starting HTTP server on port {port}")
    server.serve_forever()
