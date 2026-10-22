"""Claude Messages API 호출 (표준 라이브러리만). 키가 있을 때만 쓰인다."""

import json
import urllib.error
import urllib.request

from .genes import FORMS, SCHEMA

API_URL = "https://api.anthropic.com/v1/messages"

SYSTEM = (
    "너는 '말 걸면 자라는 정원'의 정원사다. 사용자가 건넨 문장 하나를 읽고, 그 말의 결과 감정을 담은 "
    "식물 하나의 유전자를 정한다. 문장마다 서로 다른 식물이 나오도록 과감하게 고른다.\n"
    "- name: 문장에서 떠올린 짧고 시적인 한국어 이름 (12자 이내)\n"
    f"- form: {', '.join(FORMS)} 중 하나\n"
    "- branching 1–5 (가지 수), angle 5–80 (가지 벌어짐 도), growth_speed 0.3–3.0\n"
    "- palette: #rrggbb 3–4개, 순서는 [줄기, 잎, 꽃, 강조]. 문장의 분위기를 색으로.\n"
    "- flower.shape 이 none 이면 꽃 없음, petals 3–12\n"
    "- lifespan_days 1–60 (덧없는 말은 짧게, 단단한 말은 길게)\n"
    "- mood: 문장의 감정을 한 단어로 (8자 이내)"
)


class ClaudeError(Exception):
    pass


def request_genes(text, api_key, model, timeout=60):
    body = {
        "model": model,
        "max_tokens": 4000,
        "system": SYSTEM,
        "output_config": {
            "effort": "low",
            "format": {"type": "json_schema", "schema": SCHEMA},
        },
        "messages": [{"role": "user", "content": text}],
    }
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        raise ClaudeError(f"API {e.code}: {detail}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise ClaudeError(f"API 연결 실패: {e}") from e

    if data.get("stop_reason") == "refusal":
        raise ClaudeError("Claude 가 이 문장을 거절했다")
    if data.get("stop_reason") == "max_tokens":
        raise ClaudeError("응답이 max_tokens 에서 잘렸다")
    texts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
    try:
        return json.loads("".join(texts))
    except json.JSONDecodeError as e:
        raise ClaudeError("유전자 JSON 파싱 실패") from e
