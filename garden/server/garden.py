"""정원 상태: 식물 목록, 문장 캐시, 하루 생성 상한. garden.json 하나에 저장."""

import datetime
import json
import os
import random
import tempfile
import threading
import time

from .genes import mock_genes, seed_of, validate


class InputError(Exception):
    pass


class LimitError(Exception):
    pass


def normalize(text):
    return " ".join(text.split()) if isinstance(text, str) else ""


class Garden:
    def __init__(self, path, generate=None, max_chars=200, daily_limit=200,
                 clock=time.time, today=None):
        """generate(text) -> 원시 유전자 dict. None 이면 mock."""
        self.path = path
        self.generate = generate
        self.max_chars = max_chars
        self.daily_limit = daily_limit
        self.clock = clock
        self.today = today or (lambda: datetime.date.today().isoformat())
        self.lock = threading.Lock()
        self.data = self._load()

    @property
    def mode(self):
        return "mock" if self.generate is None else "claude"

    def _load(self):
        empty = {"plants": [], "cache": {}, "usage": {"date": "", "count": 0}}
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except FileNotFoundError:
            return empty
        for key, value in empty.items():
            data.setdefault(key, value)
        return data

    def _save(self):
        os.makedirs(os.path.dirname(self.path) or ".", exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(self.path) or ".", suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(self.data, f, ensure_ascii=False, indent=1)
        os.replace(tmp, self.path)

    def plants(self):
        with self.lock:
            return list(self.data["plants"])

    def usage(self):
        with self.lock:
            u = self.data["usage"]
            used = u["count"] if u["date"] == self.today() else 0
            return {"used": used, "limit": self.daily_limit}

    def _spot(self, rng):
        """후보 자리 몇 개 중 최근 식물들과 가장 먼 곳 (한쪽에 몰리지 않게)."""
        recent = [p["x"] for p in self.data["plants"][-12:]]
        candidates = [0.06 + rng.random() * 0.88 for _ in range(8)]
        best = max(candidates, key=lambda x: min((abs(x - r) for r in recent), default=1))
        return round(best, 4)

    def plant(self, text):
        text = normalize(text)
        if not text:
            raise InputError("빈 문장은 심을 수 없다")
        if len(text) > self.max_chars:
            raise InputError(f"{self.max_chars}자까지만 심을 수 있다")

        with self.lock:
            genes = self.data["cache"].get(text)
            if genes is None:
                usage = self.data["usage"]
                if usage["date"] != self.today():
                    usage.update(date=self.today(), count=0)
                if usage["count"] >= self.daily_limit:
                    raise LimitError(f"오늘 생성 상한({self.daily_limit}회)에 닿았다")
                usage["count"] += 1  # 실패해도 호출은 일어났으므로 센다

        if genes is None:
            # 네트워크 호출은 잠금 밖에서. 실패하면 예외가 그대로 올라간다.
            raw = mock_genes(text) if self.generate is None else self.generate(text)
            genes = validate(raw, text)

        with self.lock:
            self.data["cache"][text] = genes
            rng = random.Random(seed_of(text) ^ len(self.data["plants"]))
            plant = {
                "id": f"p{int(self.clock() * 1000):x}{rng.randrange(16 ** 4):04x}",
                "text": text,
                "genes": genes,
                "planted_at": self.clock(),
                "x": self._spot(rng),
            }
            self.data["plants"].append(plant)
            self._save()
            return plant
