// 정원 화면: 불러오기, 심기, 시간에 따른 성장·시듦, 마우스 올리면 정보.
// ?days=N 을 붙이면 N 일 뒤의 정원을 미리 본다 (시듦 확인용).
"use strict";

(() => {
  const canvas = document.getElementById("garden");
  const ctx = canvas.getContext("2d");
  const $ = (id) => document.getElementById(id);
  const form = $("say"), input = $("text"), count = $("count"), button = form.querySelector("button");
  const tip = $("tip"), status = $("status"), toast = $("toast");

  const DROP = 1.4;  // 씨앗이 떨어지는 시간(초)
  const FORM_SIZE = { tree: 1, shrub: 0.5, vine: 0.8, grass: 0.38, flower: 0.55, cactus: 0.5, fern: 0.48 };
  const FORM_KO = { tree: "나무", shrub: "덤불", vine: "덩굴", grass: "풀", flower: "꽃", cactus: "선인장", fern: "고사리" };
  const daysAhead = Number(new URLSearchParams(location.search).get("days")) || 0;

  let plants = [];          // { data, P, fresh }
  let clockOffset = 0;      // 서버 시각 - 브라우저 시각
  let mode = "", usage = null, maxChars = 200;
  let W = 0, H = 0, dpr = 1, hovered = null, mouse = null;

  const now = () => Date.now() / 1000 + clockOffset + daysAhead * 86400;
  const groundY = () => H - 110;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
  }

  function addPlant(data, fresh) {
    const P = Plant.build(data.genes);
    plants.push({ data, P, fresh });
    // 뒤쪽(밑동이 높은) 식물부터 그린다
    plants.sort((a, b) => depth(a) - depth(b));
  }
  // 큰 식물은 뒤로, 작은 식물은 앞으로 (0 = 맨 뒤)
  const depth = (pl) => (1 - FORM_SIZE[pl.data.genes.form]) * 0.7 + ((pl.data.genes.seed % 37) / 37) * 0.3;

  // 식물 하나의 지금 상태
  function stateOf(pl, t) {
    const g = pl.data.genes;
    const age = t - pl.data.planted_at;
    const days = age / 86400;
    const growDur = Plant.clamp(45 / g.growth_speed, 12, 120);
    const grow = Plant.clamp((age - (pl.fresh ? DROP : 0)) / growDur);
    const eased = 1 - Math.pow(1 - grow, 2);
    const life = g.lifespan_days;
    const mature = 1 + 0.25 * Plant.clamp(days / (life * 0.6));       // 실제 시간에 따라 조금 더 자란다
    const wilt = Plant.clamp((days - life * 0.7) / (life * 0.3));      // 수명 70% 부터 시든다
    const target = Math.min(H * 0.45, 360) * FORM_SIZE[g.form] * (0.8 + ((g.seed >>> 8) % 100) / 250);
    return { age, days, grow: eased, wilt, scale: (target / pl.P.height) * (0.35 + 0.65 * eased) * mature };
  }

  function base(pl) {
    return { x: pl.data.x * W, y: groundY() + depth(pl) * 40 };
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, groundY());
    sky.addColorStop(0, "#cfe1e8"); sky.addColorStop(0.7, "#f6ead8"); sky.addColorStop(1, "#f3dcc0");
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#c9b28e";
    ctx.beginPath(); ctx.moveTo(0, groundY() - 6);
    for (let x = 0; x <= W; x += 40) ctx.lineTo(x, groundY() - 6 + Math.sin(x * 0.013) * 5);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    const soil = ctx.createLinearGradient(0, groundY(), 0, H);
    soil.addColorStop(0, "#a88b66"); soil.addColorStop(1, "#7d6247");
    ctx.fillStyle = soil; ctx.fillRect(0, groundY() + 8, W, H);
  }

  function drawSeed(pl, age) {
    const b = base(pl), f = Plant.clamp(age / DROP);
    const y = -20 + (b.y + 20) * f * f;
    ctx.fillStyle = "#6b4a2b";
    ctx.beginPath(); ctx.ellipse(b.x, y, 4, 6, f * 6, 0, Math.PI * 2); ctx.fill();
  }

  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawBackground();
    const t = now(), wall = Date.now() / 1000;

    if (!plants.length) {
      ctx.fillStyle = "rgba(90,70,50,.55)"; ctx.font = "16px system-ui, sans-serif"; ctx.textAlign = "center";
      ctx.fillText("빈 정원이에요. 아래에 아무 말이나 건네 보세요.", W / 2, H * 0.45);
    }
    hovered = null;
    for (const pl of plants) {
      const st = stateOf(pl, t);
      if (pl.fresh && st.age < DROP) { drawSeed(pl, st.age); continue; }
      const b = base(pl);
      st.sway = Math.sin(wall * 0.8 + pl.data.genes.seed) * 0.012 * (1 - st.wilt);
      Plant.draw(ctx, pl.P, b.x, b.y, st);
      // 마우스 판정 상자 (가장 앞쪽 식물이 이긴다)
      const bx = pl.P.box, S = st.scale;
      pl.hit = { x0: b.x + bx.minX * S - 6, x1: b.x + bx.maxX * S + 6, y0: b.y + bx.minY * S - 6, y1: b.y + 8, st };
      if (mouse && mouse.x >= pl.hit.x0 && mouse.x <= pl.hit.x1 && mouse.y >= pl.hit.y0 && mouse.y <= pl.hit.y1) hovered = pl;
    }
    if (hovered) {
      const h = hovered.hit;
      ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.setLineDash([4, 4]);
      ctx.strokeRect(h.x0, h.y0, h.x1 - h.x0, h.y1 - h.y0); ctx.setLineDash([]);
    }
    showTip();
    requestAnimationFrame(frame);
  }

  function showTip() {
    if (!hovered || !mouse) { tip.hidden = true; return; }
    const { data, hit } = hovered, g = data.genes, st = hit.st;
    const when = new Date(data.planted_at * 1000).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const life = st.wilt >= 1 ? "시들었어요" : st.wilt > 0 ? "시들어 가요" : st.grow < 1 ? "자라는 중" : `${Math.max(1, Math.ceil(g.lifespan_days - st.days))}일 남짓 더 살아요`;
    const key = data.id + life;
    if (tip.dataset.key !== key) {
      tip.dataset.key = key;
      tip.replaceChildren();
      const b = document.createElement("b"); b.textContent = g.name;
      const q = document.createElement("q"); q.textContent = data.text;
      const s = document.createElement("small");
      s.textContent = `${FORM_KO[g.form]} · ${g.mood} · ${when} 심음 · ${life}`;
      tip.append(b, q, s);
    }
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    tip.style.left = Math.min(mouse.x + 14, W - r.width - 8) + "px";
    tip.style.top = Math.max(8, mouse.y - r.height - 14) + "px";
  }

  function showStatus() {
    const m = mode === "mock" ? "mock 모드" : "Claude";
    status.textContent = `${m} · 식물 ${plants.length} · 오늘 ${usage.used}/${usage.limit}` + (daysAhead ? ` · +${daysAhead}일 미리보기` : "");
  }

  let toastTimer;
  function showError(msg) {
    toast.textContent = msg; toast.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => (toast.hidden = true), 3500);
  }

  async function load() {
    const res = await fetch("/api/garden");
    const data = await res.json();
    clockOffset = data.now - Date.now() / 1000;
    mode = data.mode; usage = data.usage; maxChars = data.max_chars;
    input.maxLength = maxChars;
    for (const p of data.plants) addPlant(p, false);
    showStatus(); updateCount();
  }

  function updateCount() {
    count.textContent = `${input.value.length}/${maxChars}`;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    button.disabled = true;
    try {
      const res = await fetch("/api/plant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const data = await res.json();
      if (!res.ok) return showError(data.error || "심지 못했어요");
      addPlant(data.plant, true);
      usage = data.usage;
      input.value = ""; updateCount(); showStatus();
    } catch {
      showError("서버에 닿지 않아요");
    } finally {
      button.disabled = false; input.focus();
    }
  });
  input.addEventListener("input", updateCount);
  canvas.addEventListener("mousemove", (e) => (mouse = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener("mouseleave", () => (mouse = null));
  window.addEventListener("resize", resize);

  resize();
  load().catch(() => showError("정원을 불러오지 못했어요")).finally(() => requestAnimationFrame(frame));
})();
