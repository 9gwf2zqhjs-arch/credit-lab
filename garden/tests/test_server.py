"""서버 단위 테스트. 실행: cd garden && python3 -m unittest -v"""

import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

from server.__main__ import make_garden, serve
from server.garden import Garden, InputError, LimitError
from server.genes import FLOWER_SHAPES, FORMS, LEAF_SHAPES, RANGES, mock_genes, validate

SENTENCES = [
    "오늘 좀 지쳤어", "첫눈이 왔으면", "엄마가 보고 싶다", "드디어 시험 끝!",
    "비 오는 날 창가에 앉아 있어", "새 프로젝트를 시작했어", "고양이가 무릎에서 잠들었다",
    "아무것도 하기 싫은 일요일", "바다 냄새가 그리워", "내일은 더 잘할 거야",
]


def check_genes(tc, g):
    tc.assertEqual(set(g), {"name", "form", "branching", "angle", "growth_speed", "leaf_shape",
                            "palette", "flower", "lifespan_days", "mood", "seed"})
    tc.assertIn(g["form"], FORMS)
    tc.assertIn(g["leaf_shape"], LEAF_SHAPES)
    tc.assertIn(g["flower"]["shape"], FLOWER_SHAPES)
    for key in ("branching", "angle", "growth_speed", "lifespan_days"):
        lo, hi, _ = RANGES[key]
        tc.assertTrue(lo <= g[key] <= hi, (key, g[key]))
    tc.assertTrue(3 <= g["flower"]["petals"] <= 12)
    tc.assertTrue(3 <= len(g["palette"]) <= 4)
    for c in g["palette"]:
        tc.assertRegex(c, r"^#[0-9a-f]{6}$")
    tc.assertTrue(0 < len(g["name"]) <= 12)
    tc.assertTrue(0 < len(g["mood"]) <= 8)


class ValidateTest(unittest.TestCase):
    def test_garbage_becomes_complete_genes(self):
        for raw in (None, [], "x", {}, {"form": "tree", "branching": "많이"}):
            check_genes(self, validate(raw, "문장"))

    def test_out_of_range_is_clamped(self):
        g = validate({"branching": 99, "angle": -5, "growth_speed": 1e9, "lifespan_days": 0,
                      "flower": {"shape": "star", "petals": 100}}, "t")
        self.assertEqual((g["branching"], g["angle"], g["growth_speed"], g["lifespan_days"]),
                         (5, 5, 3.0, 1))
        self.assertEqual(g["flower"], {"shape": "star", "petals": 12})

    def test_bad_types_use_defaults(self):
        g = validate({"branching": True, "angle": float("nan"), "form": "로봇",
                      "leaf_shape": 3, "flower": "yes"}, "t")
        self.assertEqual(g["branching"], RANGES["branching"][2])
        self.assertEqual(g["angle"], RANGES["angle"][2])
        self.assertEqual(g["form"], "grass")
        self.assertEqual(g["flower"]["shape"], "none")

    def test_strings_trimmed_and_cleaned(self):
        g = validate({"name": "  아주아주아주아주긴이름입니다요\n", "mood": "\x00\x07"}, "t")
        self.assertEqual(len(g["name"]), 12)
        self.assertEqual(g["mood"], "고요")

    def test_palette_filtered_and_padded(self):
        g = validate({"palette": ["#ABCDEF", "red", 3, "#12345"]}, "t")
        self.assertEqual(g["palette"][0], "#abcdef")
        self.assertEqual(len(g["palette"]), 4)
        g = validate({"palette": ["#000000"] * 9}, "t")
        self.assertEqual(len(g["palette"]), 4)

    def test_seed_comes_from_text_not_raw(self):
        self.assertEqual(validate({"seed": 1}, "가")["seed"], validate({}, "가")["seed"])
        self.assertNotEqual(validate({}, "가")["seed"], validate({}, "나")["seed"])


class MockTest(unittest.TestCase):
    def test_deterministic(self):
        for s in SENTENCES:
            self.assertEqual(mock_genes(s), mock_genes(s))

    def test_valid(self):
        for s in SENTENCES:
            check_genes(self, mock_genes(s))

    def test_ten_sentences_are_visibly_different(self):
        gs = [mock_genes(s) for s in SENTENCES]
        self.assertGreaterEqual(len({g["form"] for g in gs}), 5)
        self.assertEqual(len({g["palette"][2] for g in gs}), 10)
        self.assertEqual(len({g["name"] for g in gs}), 10)
        looks = {(g["form"], g["branching"], g["leaf_shape"], g["flower"]["shape"]) for g in gs}
        self.assertEqual(len(looks), 10)


class GardenTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.dir.name, "data", "garden.json")
        self.day = "2026-10-14"

    def tearDown(self):
        self.dir.cleanup()

    def make(self, **kw):
        kw.setdefault("today", lambda: self.day)
        return Garden(self.path, **kw)

    def test_persists_across_restart(self):
        g = self.make()
        p = g.plant("첫눈이 왔으면")
        g2 = self.make()
        self.assertEqual(g2.plants(), [p])

    def test_input_limits(self):
        g = self.make(max_chars=10)
        for bad in ("", "   ", None, 3, "가" * 11):
            with self.assertRaises(InputError):
                g.plant(bad)
        g.plant("가" * 10)
        g.plant("  가   나 ")
        self.assertEqual(g.plants()[-1]["text"], "가 나")

    def test_daily_limit_and_reset(self):
        g = self.make(daily_limit=3)
        for i in range(3):
            g.plant(f"문장 {i}")
        with self.assertRaises(LimitError):
            g.plant("문장 3")
        g.plant("문장 0")  # 캐시된 문장은 상한에 안 걸린다
        self.assertEqual(g.usage(), {"used": 3, "limit": 3})
        self.day = "2026-10-15"
        self.assertEqual(g.usage()["used"], 0)
        g.plant("문장 3")

    def test_cache_calls_generator_once(self):
        calls = []

        def gen(text):
            calls.append(text)
            return {"form": "tree", "branching": 99}

        g = self.make(generate=gen)
        a = g.plant("같은 말")
        b = g.plant("같은  말")
        self.assertEqual(calls, ["같은 말"])
        self.assertEqual(a["genes"], b["genes"])
        self.assertEqual(a["genes"]["branching"], 5)
        self.assertNotEqual(a["id"], b["id"])
        self.assertEqual(g.mode, "claude")

    def test_generator_failure_counts_but_stores_nothing(self):
        def gen(text):
            raise RuntimeError("down")

        g = self.make(generate=gen, daily_limit=1)
        with self.assertRaises(RuntimeError):
            g.plant("하나")
        self.assertEqual(g.plants(), [])
        with self.assertRaises(LimitError):
            g.plant("둘")


class ConfigTest(unittest.TestCase):
    def test_mock_without_key(self):
        self.assertEqual(make_garden({"GARDEN_DATA": "/nonexistent/x.json"}).mode, "mock")
        self.assertEqual(make_garden({"ANTHROPIC_API_KEY": "k", "GARDEN_MOCK": "1",
                                      "GARDEN_DATA": "/nonexistent/x.json"}).mode, "mock")
        self.assertEqual(make_garden({"ANTHROPIC_API_KEY": "k",
                                      "GARDEN_DATA": "/nonexistent/x.json"}).mode, "claude")


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.TemporaryDirectory()
        cls.garden = Garden(os.path.join(cls.dir.name, "g.json"), max_chars=20, daily_limit=50)
        cls.server = serve(cls.garden, port=0)
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.dir.cleanup()

    def call(self, path, body=None):
        data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
        req = urllib.request.Request(self.base + path, data=data, method="POST" if data else "GET")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, r.read()
        except urllib.error.HTTPError as e:
            return e.code, e.read()

    def test_plant_and_list(self):
        status, body = self.call("/api/plant", {"text": "바다 냄새"})
        self.assertEqual(status, 201)
        plant = json.loads(body)["plant"]
        check_genes(self, plant["genes"])
        status, body = self.call("/api/garden")
        data = json.loads(body)
        self.assertEqual(data["mode"], "mock")
        self.assertIn(plant["id"], [p["id"] for p in data["plants"]])

    def test_errors(self):
        self.assertEqual(self.call("/api/plant", {"text": "가" * 21})[0], 400)
        self.assertEqual(self.call("/api/plant", b"not json")[0], 400)
        self.assertEqual(self.call("/api/plant", [1])[0], 400)
        self.assertEqual(self.call("/api/nope")[0], 404)

    def test_serves_page(self):
        status, body = self.call("/")
        self.assertEqual(status, 200)
        self.assertIn(b"<canvas", body)


if __name__ == "__main__":
    unittest.main()
