"""식물 유전자: 스키마, 검증·잘라내기, mock 생성."""

import colorsys
import hashlib
import re

FORMS = ["tree", "shrub", "vine", "grass", "flower", "cactus", "fern"]
LEAF_SHAPES = ["round", "needle", "heart", "long", "none"]
FLOWER_SHAPES = ["star", "cup", "bell", "puff", "none"]

# 숫자 필드: (최소, 최대, 기본값)
RANGES = {
    "branching": (1, 5, 2),
    "angle": (5, 80, 30),
    "growth_speed": (0.3, 3.0, 1.0),
    "lifespan_days": (1, 60, 14),
    "petals": (3, 12, 5),
}
INT_FIELDS = {"branching", "lifespan_days", "petals"}
NAME_MAX = 12
MOOD_MAX = 8
HEX_RE = re.compile(r"^#[0-9a-fA-F]{6}$")
DEFAULT_PALETTE = ["#5b4636", "#4f8a3c", "#e88aa0", "#f4d35e"]

# Claude 구조화 출력용 JSON schema. 숫자 범위는 프롬프트로 알려주고 서버에서 잘라낸다.
SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "짧은 한국어 식물 이름 (12자 이내)"},
        "form": {"type": "string", "enum": FORMS},
        "branching": {"type": "integer", "description": "1–5"},
        "angle": {"type": "number", "description": "가지 벌어짐 각도, 5–80"},
        "growth_speed": {"type": "number", "description": "0.3–3.0"},
        "leaf_shape": {"type": "string", "enum": LEAF_SHAPES},
        "palette": {
            "type": "array",
            "items": {"type": "string", "description": "#rrggbb"},
            "description": "[줄기, 잎, 꽃, 강조] 3–4색",
        },
        "flower": {
            "type": "object",
            "properties": {
                "shape": {"type": "string", "enum": FLOWER_SHAPES},
                "petals": {"type": "integer", "description": "3–12"},
            },
            "required": ["shape", "petals"],
            "additionalProperties": False,
        },
        "lifespan_days": {"type": "integer", "description": "1–60"},
        "mood": {"type": "string", "description": "한 단어 (8자 이내)"},
    },
    "required": [
        "name", "form", "branching", "angle", "growth_speed", "leaf_shape",
        "palette", "flower", "lifespan_days", "mood",
    ],
    "additionalProperties": False,
}


def seed_of(text):
    """문장 → 32비트 시드. 같은 문장은 항상 같은 모양."""
    return int.from_bytes(hashlib.sha256(text.encode("utf-8")).digest()[:4], "big")


def _num(value, key):
    lo, hi, default = RANGES[key]
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return default
    if value != value:  # NaN
        return default
    value = min(hi, max(lo, value))
    return int(round(value)) if key in INT_FIELDS else round(float(value), 2)


def _text(value, limit, default):
    if not isinstance(value, str):
        return default
    value = "".join(ch for ch in value if ch.isprintable()).strip()
    return value[:limit] or default


def _enum(value, choices, default):
    return value if value in choices else default


def validate(raw, text):
    """어떤 입력이 와도 범위 안의 완전한 유전자를 돌려준다."""
    raw = raw if isinstance(raw, dict) else {}
    palette = raw.get("palette")
    palette = [c.lower() for c in palette if isinstance(c, str) and HEX_RE.match(c)] if isinstance(palette, list) else []
    palette = palette[:4]
    if len(palette) < 3:
        palette = (palette + DEFAULT_PALETTE[len(palette):])[:4]
    flower = raw.get("flower") if isinstance(raw.get("flower"), dict) else {}
    genes = {
        "name": _text(raw.get("name"), NAME_MAX, "이름 없는 풀"),
        "form": _enum(raw.get("form"), FORMS, "grass"),
        "leaf_shape": _enum(raw.get("leaf_shape"), LEAF_SHAPES, "round"),
        "palette": palette,
        "flower": {
            "shape": _enum(flower.get("shape"), FLOWER_SHAPES, "none"),
            "petals": _num(flower.get("petals"), "petals"),
        },
        "mood": _text(raw.get("mood"), MOOD_MAX, "고요"),
        "seed": seed_of(text),
    }
    for key in ("branching", "angle", "growth_speed", "lifespan_days"):
        genes[key] = _num(raw.get(key), key)
    return genes


# --- mock -----------------------------------------------------------------

_ADJ = ["새벽", "졸린", "반짝", "느린", "수줍은", "단단한", "작은", "떠도는",
        "따스한", "서늘한", "웃는", "흐린", "푸른", "고요한", "들뜬", "늦은"]
_NOUN = {
    "tree": ["나무", "참나무", "버들"], "shrub": ["덤불", "떨기", "관목"],
    "vine": ["덩굴", "넝쿨", "줄기풀"], "grass": ["풀", "억새", "갈대"],
    "flower": ["꽃", "봉오리", "들꽃"], "cactus": ["선인장", "가시풀", "통풀"],
    "fern": ["고사리", "양치", "깃풀"],
}
_MOODS = ["평온", "설렘", "지침", "그리움", "기대", "외로움", "용기", "나른함",
          "호기심", "안도", "들뜸", "쓸쓸함", "다정", "고집", "환희", "몽상"]
# 형태별로 어울리는 꽃·잎 (mock 이 너무 엉뚱하지 않게)
_FORM_LEAVES = {
    "tree": ["round", "heart", "needle", "long"], "shrub": ["round", "heart", "long"],
    "vine": ["heart", "round", "long"], "grass": ["long", "needle"],
    "flower": ["long", "round", "heart"], "cactus": ["none", "needle"],
    "fern": ["long", "needle", "round"],
}


def _hex(h, s, l):
    r, g, b = colorsys.hls_to_rgb(h % 1.0, l, s)
    return "#%02x%02x%02x" % (round(r * 255), round(g * 255), round(b * 255))


def mock_genes(text):
    """API 없이 문장 해시로 결정적인 유전자를 만든다."""
    d = hashlib.sha256(("garden-mock:" + text).encode("utf-8")).digest()

    def pick(i, seq):
        return seq[d[i] % len(seq)]

    def frac(i):
        return d[i] / 255.0

    form = pick(0, FORMS)
    flower_shape = pick(5, FLOWER_SHAPES[:-1]) if form == "flower" or d[6] % 3 else "none"
    hue = frac(7)
    leaf_hue = 0.22 + (frac(8) - 0.5) * 0.25  # 연두–청록 근처
    raw = {
        "name": pick(1, _ADJ) + " " + pick(2, _NOUN[form]),
        "form": form,
        "branching": 1 + d[3] % 5,
        "angle": 5 + frac(4) * 75,
        "growth_speed": 0.3 + frac(9) * 2.7,
        "leaf_shape": pick(10, _FORM_LEAVES[form]),
        "palette": [
            _hex(0.07 + frac(11) * 0.06, 0.35, 0.22 + frac(12) * 0.15),  # 줄기
            _hex(leaf_hue, 0.45 + frac(13) * 0.3, 0.3 + frac(14) * 0.2),  # 잎
            _hex(hue, 0.65 + frac(15) * 0.3, 0.55 + frac(16) * 0.15),     # 꽃
            _hex(hue + 0.5, 0.7, 0.6),                                     # 강조
        ],
        "flower": {"shape": flower_shape, "petals": 3 + d[17] % 10},
        "lifespan_days": 3 + d[18] % 40,
        "mood": pick(19, _MOODS),
    }
    return validate(raw, text)
