"""정원 서버. 실행: cd garden && python3 -m server"""

import json
import os
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

from .claude import ClaudeError, request_genes
from .garden import Garden, InputError, LimitError

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # garden/
WEB = os.path.join(ROOT, "web")


def load_env(path):
    """garden/.env 의 KEY=VALUE 를 환경변수에 없을 때만 채운다."""
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("'\""))
    except FileNotFoundError:
        pass


def make_garden(env=os.environ):
    key = env.get("ANTHROPIC_API_KEY", "").strip()
    model = env.get("GARDEN_MODEL", "claude-haiku-5-5")
    use_mock = not key or env.get("GARDEN_MOCK") == "1"
    return Garden(
        env.get("GARDEN_DATA", os.path.join(ROOT, "data", "garden.json")),
        generate=None if use_mock else partial(request_genes, api_key=key, model=model),
        max_chars=int(env.get("GARDEN_MAX_CHARS", 200)),
        daily_limit=int(env.get("GARDEN_DAILY_LIMIT", 200)),
    )


class Handler(SimpleHTTPRequestHandler):
    garden = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB, **kwargs)

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path.split("?")[0] == "/api/garden":
            g = self.garden
            return self._json(200, {"plants": g.plants(), "mode": g.mode,
                                    "usage": g.usage(), "max_chars": g.max_chars,
                                    "now": time.time()})
        if self.path.startswith("/api/"):
            return self._json(404, {"error": "없는 경로"})
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/plant":
            return self._json(404, {"error": "없는 경로"})
        try:
            length = int(self.headers.get("content-length", 0))
            if length > 8192:
                raise InputError("요청이 너무 크다")
            payload = json.loads(self.rfile.read(length) or b"{}")
            text = payload.get("text") if isinstance(payload, dict) else None
            plant = self.garden.plant(text)
        except (ValueError, InputError) as e:
            return self._json(400, {"error": str(e) if isinstance(e, InputError) else "JSON 이 아니다"})
        except LimitError as e:
            return self._json(429, {"error": str(e)})
        except ClaudeError as e:
            return self._json(502, {"error": str(e)})
        return self._json(201, {"plant": plant, "usage": self.garden.usage()})

    def log_message(self, fmt, *args):
        if self.path.startswith("/api/"):
            sys.stderr.write("%s %s\n" % (self.log_date_time_string(), fmt % args))


def serve(garden, host="127.0.0.1", port=8765):
    handler = type("GardenHandler", (Handler,), {"garden": garden})
    return ThreadingHTTPServer((host, port), handler)


def main():
    load_env(os.path.join(ROOT, ".env"))
    garden = make_garden()
    port = int(os.environ.get("PORT", 8765))
    server = serve(garden, port=port)
    print(f"정원: http://127.0.0.1:{port}  (모드: {garden.mode}, 저장: {garden.path})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
