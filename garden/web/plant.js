// 유전자 → 식물 구조(한 번 계산) → 성장·시듦 상태로 그리기.
// 좌표는 밑동이 (0,0), 위가 -y, 키가 대략 1 인 단위. 같은 유전자는 항상 같은 모양.
"use strict";

const Plant = (() => {
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
  const DEG = Math.PI / 180;

  // ---- 구조 만들기 -------------------------------------------------------

  function build(g) {
    const rnd = mulberry32(g.seed);
    const jit = (s) => (rnd() - 0.5) * 2 * s;
    const A = g.angle * DEG;
    const B = g.branching;
    const P = { segs: [], leaves: [], flowers: [], spines: [], g };
    const hasFlower = g.flower.shape !== "none";

    const seg = (x, y, ang, len, w, t0, t1) => {
      const s = { x1: x, y1: y, x2: x + Math.sin(ang) * len, y2: y - Math.cos(ang) * len, w, t0, t1 };
      P.segs.push(s);
      return s;
    };
    const leaf = (x, y, ang, size, t) => {
      if (g.leaf_shape !== "none") P.leaves.push({ x, y, ang, size, t, r: rnd() });
    };
    const flower = (x, y, ang, size, t) => {
      if (hasFlower) P.flowers.push({ x, y, ang, size, t, spin: rnd() * Math.PI });
    };

    // 재귀 가지: 나무·덤불이 같이 쓴다
    function branch(x, y, ang, len, w, depth, maxD, t0, span) {
      const t1 = t0 + span;
      const s = seg(x, y, ang, len, w, t0, t1);
      if (depth >= maxD) {
        const n = 1 + Math.floor(rnd() * 3);
        for (let i = 0; i < n; i++) leaf(s.x2, s.y2, ang + jit(1.2), 0.05 + rnd() * 0.03, t1 + rnd() * 0.08);
        if (rnd() < 0.3) flower(s.x2, s.y2, ang, 0.045 + rnd() * 0.02, 0.82 + rnd() * 0.1);
        return;
      }
      if (depth >= maxD - 2 && rnd() < 0.6) leaf((x + s.x2) / 2, (y + s.y2) / 2, ang + jit(1.4), 0.045, t1);
      const kids = Math.max(2, B);
      for (let i = 0; i < kids; i++) {
        const spread = kids === 1 ? 0 : (i / (kids - 1) - 0.5) * 2 * A;
        branch(s.x2, s.y2, ang + spread + jit(A * 0.25 + 0.05), len * (0.68 + rnd() * 0.12),
               w * 0.68, depth + 1, maxD, t1, span);
      }
    }

    switch (g.form) {
      case "tree": {
        const maxD = clamp(Math.floor(Math.log(80) / Math.log(Math.max(2, B))), 3, 7);
        const span = 0.8 / (maxD + 1);
        // 줄기 길이 합이 ~1 이 되도록
        let total = 0, l = 1;
        for (let d = 0; d <= maxD; d++) { total += l; l *= 0.75; }
        branch(0, 0, jit(0.08), 1.25 / total, 0.06, 0, maxD, 0, span);
        break;
      }
      case "shrub": {
        const stems = 3 + Math.floor(rnd() * 3) + Math.floor(B / 2);
        const maxD = 3, span = 0.8 / (maxD + 1);
        for (let i = 0; i < stems; i++) {
          const ang = (i / (stems - 1) - 0.5) * (A + 0.6) + jit(0.1);
          branch(jit(0.04), 0, ang, 0.2 + rnd() * 0.08, 0.025, 0, maxD, rnd() * 0.08, span);
        }
        break;
      }
      case "vine": {
        const stems = 1 + Math.floor(B / 2);
        for (let k = 0; k < stems; k++) {
          let x = jit(0.03), y = 0, ang = jit(0.3);
          const n = 22, len = 1.25 / n, freq = 0.35 + rnd() * 0.5, lean = jit(0.04), ph = rnd() * 6;
          for (let i = 0; i < n; i++) {
            const t0 = (i / n) * 0.85, t1 = ((i + 1) / n) * 0.85;
            ang += Math.sin(i * freq + ph) * A * 0.35 + lean;
            ang = clamp(ang, -1.3, 1.3);
            const s = seg(x, y, ang, len, 0.018 * (1 - i / n) + 0.005, t0, t1);
            const side = i % 2 ? 1 : -1;
            if (i > 1) leaf(s.x2, s.y2, ang + side * (0.9 + jit(0.3)), 0.06 + rnd() * 0.02, t1);
            if (i > 6 && i % 5 === 0) {  // 덩굴손
              let cx = s.x2, cy = s.y2, ca = ang - side * 1.2;
              for (let j = 0; j < 5; j++) {
                const c = seg(cx, cy, ca, 0.025, 0.004, t1, t1 + 0.06);
                cx = c.x2; cy = c.y2; ca += side * 0.9;
              }
            }
            if (i > 8 && rnd() < 0.18) flower(s.x2, s.y2, ang, 0.04, 0.8 + rnd() * 0.15);
            x = s.x2; y = s.y2;
          }
          flower(x, y, ang, 0.05, 0.92);
        }
        break;
      }
      case "grass": {
        const blades = 6 + B * 4;
        for (let k = 0; k < blades; k++) {
          let x = jit(0.12), y = 0, ang = jit(A * 0.6 + 0.15);
          const h = 0.45 + rnd() * 0.6, n = 6, bend = jit(0.12) + Math.sign(ang) * 0.08;
          const t0 = rnd() * 0.25;
          for (let i = 0; i < n; i++) {
            const a = t0 + (i / n) * 0.6, b = t0 + ((i + 1) / n) * 0.6;
            const s = seg(x, y, ang, h / n, 0.014 * (1 - i / n) + 0.002, a, b);
            ang += bend;
            x = s.x2; y = s.y2;
          }
          if (g.leaf_shape === "needle" && rnd() < 0.5) leaf(x, y, ang, 0.04, 0.85);
          if (rnd() < 0.3) flower(x, y, ang, 0.03 + rnd() * 0.015, 0.85 + rnd() * 0.1);
        }
        break;
      }
      case "flower": {
        const sides = B - 1;
        let x = 0, y = 0, ang = jit(0.1);
        const n = 7, h = 0.85 + rnd() * 0.25;
        for (let i = 0; i < n; i++) {
          const t0 = (i / n) * 0.7, t1 = ((i + 1) / n) * 0.7;
          const s = seg(x, y, ang, h / n, 0.016 * (1 - i / n) + 0.006, t0, t1);
          ang += jit(0.08);
          if (i < 4 && i % 2 === 0) {
            leaf(s.x2, s.y2, ang - 0.9, 0.09, t1);
            leaf(s.x2, s.y2, ang + 0.9, 0.08, t1 + 0.03);
          }
          if (i >= 2 && i - 2 < sides) {
            const side = i % 2 ? 1 : -1;
            let sx = s.x2, sy = s.y2, sa = ang + side * (A * 0.8 + 0.2);
            for (let j = 0; j < 3; j++) {
              const c = seg(sx, sy, sa, 0.08, 0.008, t1 + j * 0.04, t1 + (j + 1) * 0.04);
              sx = c.x2; sy = c.y2; sa -= side * 0.15;
            }
            flower(sx, sy, sa, 0.06, 0.85);
          }
          x = s.x2; y = s.y2;
        }
        if (hasFlower) flower(x, y, ang, 0.11, 0.8);
        else P.flowers.push({ x, y, ang, size: 0.1, t: 0.8, spin: 0, bud: true });
        break;
      }
      case "cactus": {
        const w = 0.09 + rnd() * 0.05, h = 0.65 + rnd() * 0.25;
        const trunk = seg(0, 0, jit(0.05), h, w, 0, 0.55);
        const arms = B - 1;
        for (let i = 0; i < arms; i++) {
          const side = i % 2 ? 1 : -1;
          const at = 0.25 + rnd() * 0.45;
          const ax = trunk.x1 + (trunk.x2 - trunk.x1) * at, ay = trunk.y1 + (trunk.y2 - trunk.y1) * at;
          const out = seg(ax, ay, side * (Math.PI / 2 - A * 0.3), 0.1 + rnd() * 0.08, w * 0.75, 0.5, 0.62);
          const up = seg(out.x2, out.y2, side * A * 0.15, 0.15 + rnd() * 0.2, w * 0.7, 0.62, 0.78);
          flower(up.x2, up.y2, 0, 0.045, 0.9);
        }
        for (const s of P.segs) {  // 가시
          const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
          const n = Math.floor(len / 0.05);
          for (let i = 1; i < n; i++) {
            const f = i / n, px = s.x1 + (s.x2 - s.x1) * f, py = s.y1 + (s.y2 - s.y1) * f;
            for (const side of [-1, 1]) {
              P.spines.push({ x: px, y: py, nx: (s.y2 - s.y1) / len * side, ny: -(s.x2 - s.x1) / len * side,
                              w: s.w, t: s.t0 + (s.t1 - s.t0) * f + 0.05 });
            }
          }
        }
        flower(trunk.x2, trunk.y2, 0, 0.07, 0.88);
        break;
      }
      case "fern": {
        const fronds = 3 + B;
        for (let k = 0; k < fronds; k++) {
          let x = 0, y = 0;
          let ang = (k / (fronds - 1) - 0.5) * (1.6 + A * 0.02) + jit(0.08);
          const curl = Math.sign(ang || 1) * (0.06 + rnd() * 0.05), n = 11, len = (0.7 + rnd() * 0.35) / n;
          const t0 = rnd() * 0.15;
          for (let i = 0; i < n; i++) {
            const a = t0 + (i / n) * 0.7, b = t0 + ((i + 1) / n) * 0.7;
            const s = seg(x, y, ang, len, 0.01 * (1 - i / n) + 0.002, a, b);
            const ls = 0.07 * (1 - i / n) + 0.015;
            if (i > 0) {
              P.leaves.push({ x: s.x2, y: s.y2, ang: ang - 0.4 - A * 0.02, size: ls, t: b, r: rnd(), frond: true });
              P.leaves.push({ x: s.x2, y: s.y2, ang: ang + 0.4 + A * 0.02, size: ls, t: b, r: rnd(), frond: true });
            }
            ang += curl * (1 + i * 0.25);
            x = s.x2; y = s.y2;
          }
          if (rnd() < 0.35) flower(x, y, ang, 0.035, 0.9);
        }
        break;
      }
    }

    // 경계 상자 (마우스 판정용)
    let minX = 0, maxX = 0, minY = 0;
    for (const s of P.segs) {
      minX = Math.min(minX, s.x1, s.x2); maxX = Math.max(maxX, s.x1, s.x2); minY = Math.min(minY, s.y1, s.y2);
    }
    for (const o of P.leaves.concat(P.flowers)) {
      minX = Math.min(minX, o.x - o.size); maxX = Math.max(maxX, o.x + o.size); minY = Math.min(minY, o.y - o.size);
    }
    P.box = { minX, maxX, minY };
    P.height = -minY || 1;
    return P;
  }

  // ---- 색 ---------------------------------------------------------------

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // 시들수록 갈색 쪽으로
  function wither(hex, wilt) {
    const [r, g, b] = hexToRgb(hex);
    const k = wilt * 0.75, gray = (r + g + b) / 3;
    const mix = (c, brown) => Math.round(c + ((c * 0.4 + gray * 0.6) * 0.5 + brown * 0.5 - c) * k);
    return `rgb(${mix(r, 138)},${mix(g, 107)},${mix(b, 74)})`;
  }

  // ---- 그리기 -----------------------------------------------------------

  function drawLeaf(ctx, shape, s) {
    ctx.beginPath();
    switch (shape) {
      case "round": ctx.ellipse(s * 0.55, 0, s * 0.55, s * 0.36, 0, 0, Math.PI * 2); break;
      case "long": ctx.ellipse(s * 0.75, 0, s * 0.75, s * 0.16, 0, 0, Math.PI * 2); break;
      case "heart":
        ctx.moveTo(0, 0);
        ctx.bezierCurveTo(s * 0.3, -s * 0.55, s * 1.05, -s * 0.45, s * 0.85, 0);
        ctx.bezierCurveTo(s * 1.05, s * 0.45, s * 0.3, s * 0.55, 0, 0);
        break;
      case "needle":
        ctx.moveTo(0, -s * 0.04); ctx.lineTo(s * 1.1, 0); ctx.lineTo(0, s * 0.04); break;
    }
    ctx.fill();
  }

  function drawFlower(ctx, shape, n, s, petal, accent) {
    ctx.fillStyle = petal;
    switch (shape) {
      case "star": {
        ctx.beginPath();
        for (let i = 0; i < n * 2; i++) {
          const a = (i / (n * 2)) * Math.PI * 2, r = i % 2 ? s * 0.38 : s;
          ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, s * 0.25, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "cup": {  // 위를 향한 튤립
        const k = Math.min(n, 5);
        for (let i = 0; i < k; i++) {
          const off = (i / (k - 1 || 1) - 0.5) * s * 0.9;
          ctx.globalAlpha *= 0.92;
          ctx.beginPath(); ctx.ellipse(off * 0.6, -s * 0.55, s * 0.42, s * 0.7, off / s * 0.6, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, -s * 0.15, s * 0.12, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "bell": {  // 아래로 늘어진 종
        ctx.beginPath();
        ctx.moveTo(-s * 0.25, 0);
        ctx.quadraticCurveTo(-s * 0.55, s * 0.5, -s * 0.6, s * 1.0);
        for (let i = 0; i <= n; i++) {
          const x = -s * 0.6 + (i / n) * s * 1.2;
          ctx.quadraticCurveTo(x - s * 0.6 / n, s * 1.18, x, s * 1.0);
        }
        ctx.quadraticCurveTo(s * 0.55, s * 0.5, s * 0.25, 0);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, s * 1.1, s * 0.1, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case "puff": {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          ctx.beginPath(); ctx.arc(Math.cos(a) * s * 0.55, Math.sin(a) * s * 0.55, s * 0.38, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.fill();
        break;
      }
    }
  }

  // st: { grow 0–1, scale px, wilt 0–1, sway 라디안 }
  function draw(ctx, P, bx, by, st) {
    const g = P.g, S = st.scale, p = st.grow, wilt = st.wilt;
    const [stem, leafC, petal, accent] = g.palette;
    const accentC = accent || petal;
    const droop = wilt * (g.form === "cactus" ? 0.06 : 0.16) + st.sway;
    // 높이에 따라 휘게: 시들면 한쪽으로 처진다
    const wx = (x, y) => bx + (x + droop * y * y / P.height * (g.seed & 1 ? 1 : -1)) * S;
    const wy = (y) => by + y * S;

    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = wilt >= 1 ? 0.55 : 1;
    const isCactus = g.form === "cactus";
    ctx.strokeStyle = wither(isCactus ? leafC : stem, wilt);

    for (const s of P.segs) {
      if (p <= s.t0) continue;
      const f = clamp((p - s.t0) / (s.t1 - s.t0));
      const x2 = s.x1 + (s.x2 - s.x1) * f, y2 = s.y1 + (s.y2 - s.y1) * f;
      ctx.lineWidth = Math.max(0.8, s.w * S * (isCactus ? 1 : 0.6 + 0.4 * f));
      ctx.beginPath(); ctx.moveTo(wx(s.x1, s.y1), wy(s.y1)); ctx.lineTo(wx(x2, y2), wy(y2)); ctx.stroke();
    }

    if (isCactus) {
      ctx.strokeStyle = wither(accentC, wilt * 0.5);
      ctx.lineWidth = 1;
      ctx.globalAlpha *= 0.8;
      for (const sp of P.spines) {
        if (p <= sp.t) continue;
        const x = sp.x + sp.nx * sp.w * 0.5, y = sp.y + sp.ny * sp.w * 0.5;
        ctx.beginPath(); ctx.moveTo(wx(x, y), wy(y));
        ctx.lineTo(wx(x + sp.nx * 0.025, y + sp.ny * 0.025 - 0.01), wy(y + sp.ny * 0.025 - 0.01)); ctx.stroke();
      }
      ctx.globalAlpha = wilt >= 1 ? 0.55 : 1;
    }

    const shape = g.leaf_shape;
    for (const L of P.leaves) {
      if (p <= L.t || L.r < wilt * 1.1 - 0.1) continue;  // 시들면 잎이 하나씩 떨어진다
      const f = clamp((p - L.t) / 0.12);
      ctx.fillStyle = wither(leafC, wilt);
      ctx.save();
      ctx.translate(wx(L.x, L.y), wy(L.y));
      ctx.rotate(L.ang - Math.PI / 2 + wilt * 0.6);
      drawLeaf(ctx, L.frond ? (shape === "needle" ? "needle" : "long") : shape, L.size * S * f);
      ctx.restore();
    }

    for (const F of P.flowers) {
      if (p <= F.t) continue;
      const f = clamp((p - F.t) / 0.15);
      ctx.save();
      ctx.globalAlpha = (wilt >= 1 ? 0.4 : 1) * (1 - wilt * 0.6);
      ctx.translate(wx(F.x, F.y), wy(F.y));
      if (F.bud) {  // 꽃 없는 꽃대는 봉오리
        ctx.fillStyle = wither(leafC, wilt);
        ctx.beginPath(); ctx.ellipse(0, -F.size * S * 0.3 * f, F.size * S * 0.22 * f, F.size * S * 0.4 * f, 0, 0, Math.PI * 2); ctx.fill();
      } else {
        const fs = g.flower.shape;
        if (fs === "star" || fs === "puff") ctx.rotate(F.spin);
        else if (fs === "cup") ctx.rotate(F.ang * 0.5 + wilt);
        drawFlower(ctx, fs, g.flower.petals, F.size * S * f * (1 - wilt * 0.4),
                   wither(petal, wilt), wither(accentC, wilt));
      }
      ctx.restore();
    }
    ctx.restore();
  }

  return { build, draw, clamp };
})();
