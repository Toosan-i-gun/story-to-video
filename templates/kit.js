/* story-to-video · 绘图工具箱
   所有函数都接受 prefix（场景 id），保证整页合成时 id 唯一。
   原则：大面积剪影 + 少量清晰形状 + 全片唯一暖色只给"光"。*/
window.KIT = (() => {
  const NS = "http://www.w3.org/2000/svg";

  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) {
      // innerHTML 必须走属性，setAttribute("innerHTML", ...) 只会加一个同名 attribute，
      // 滤镜（<filter> 里的 feTurbulence）就永远是空的 —— 空滤镜 = 元素整块不渲染。
      if (k === "innerHTML") el.innerHTML = attrs[k];
      else el.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(el);
    return el;
  };

  // 确定性伪随机：同一帧永远同一张画
  const rnd = (i) => {
    const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
  };

  const poly = (pts) =>
    "M" + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L") + " Z";

  // 一片叶子：带宽度渐收的弯曲脊线。w0 是根部半宽。
  const leafPath = (x0, y0, cx, cy, x1, y1, w0, taper = 0.65) => {
    const N = 14, pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, mt = 1 - t;
      pts.push([
        mt * mt * x0 + 2 * mt * t * cx + t * t * x1,
        mt * mt * y0 + 2 * mt * t * cy + t * t * y1,
      ]);
    }
    const L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const w = (w0 * Math.pow(1 - t, taper)) / 2;
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, N)];
      let dx = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
      R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
    }
    return poly(L.concat(R.reverse()));
  };

  // 蜡笔填充：同一形状画两遍，第二遍挪一点、淡一点，没有一块是平的
  // 光晕用的径向渐变：中心偏白、外圈透明。同一个 id 只建一次。
  const glowGrad = (defsEl, id, glow, core) => {
    if (!defsEl) return null;
    if (!defsEl.querySelector("#" + id)) {
      const el = mk("radialGradient", { id, cx: "50%", cy: "50%", r: "50%" }, defsEl);
      [[0, core, 0.55], [22, glow, 0.4], [52, glow, 0.13], [100, glow, 0]].forEach(([off, col, op]) =>
        mk("stop", { offset: off + "%", "stop-color": col, "stop-opacity": op }, el));
    }
    return "url(#" + id + ")";
  };

  const crayon = (parent, d, color, i = 0, opts = {}) => {
    const g = mk("g", {}, parent);
    mk("path", { d, fill: color, opacity: (opts.base ?? 1).toFixed(2) }, g);
    if ((opts.tintOpacity ?? 0.04) > 0)
      mk("path", {
        d, fill: opts.tint || "#ffffff", opacity: (opts.tintOpacity ?? 0.04).toFixed(2),
        transform: `translate(${((rnd(i) - 0.5) * 14).toFixed(1)},${((rnd(i + 7) - 0.5) * 10).toFixed(1)})`,
      }, g);
    return g;
  };

  // 一根芦苇/草：茎 + 几片尖叶 + 穗
  const reed = (parent, o) => {
    const { x, baseY, h, lean = 0, i = 0, scale = 1, stem = "#243840",
      leaf = "#1c2f36", plume = "#2b3f42", leaves = 2, plumeOn = true, id = i } = o;
    const g = mk("g", { "data-reed": id }, parent);
    const topY = baseY - h, tipX = x + lean;
    mk("path", {
      d: `M${x},${baseY} C${x + lean * 0.25},${baseY - h * 0.42} ${x + lean * 0.8},${baseY - h * 0.76} ${tipX},${topY}`,
      stroke: stem, "stroke-width": (4.6 * scale).toFixed(1), fill: "none", "stroke-linecap": "round",
    }, g);
    for (let b = 0; b < leaves; b++) {
      const t = 0.24 + b * 0.17 + rnd(i * 7 + b) * 0.05;
      const bx = x + lean * t, by = baseY - h * t;
      const dir = (b + i) % 2 === 0 ? -1 : 1;
      const len = (86 + rnd(i * 11 + b) * 84) * scale;
      const ang = (1.02 + rnd(i * 13 + b) * 0.42) * dir;
      const tipX2 = bx + Math.cos(ang) * len, tipY2 = by - Math.sin(ang) * len;
      const mx = (bx + tipX2) / 2, my = (by + tipY2) / 2;
      const bow = (rnd(i * 29 + b) - 0.5) * 0.5 * len;
      mk("path", {
        d: leafPath(bx, by, mx - (tipY2 - by) / len * bow, my + (tipX2 - bx) / len * bow,
          tipX2, tipY2, (13 + rnd(i * 23 + b) * 8) * scale, 0.7),
        fill: leaf, opacity: (0.68 + rnd(i * 17 + b) * 0.3).toFixed(2),
      }, g);
    }
    if (plumeOn) {
      const dir = lean >= 0 ? 1 : -1;
      mk("path", {
        d: leafPath(tipX, topY, tipX + dir * 16 * scale, topY - 34 * scale,
          tipX + dir * 8 * scale, topY - 70 * scale, 13 * scale, 0.5),
        fill: plume, opacity: "0.86",
      }, g);
    }
    return g;
  };

  // 萤火虫：泪滴身子 + 两片窄翅（pivot 在肩）+ 暖色光晕 + 米粒灯芯
  // 外层 <g> 定位（有 transform），返回的内层 <g> 才是给 GSAP 动的 —— 别搞反。
  const firefly = (parent, o = {}) => {
    const { x, y, id, size = 1, grandpa = false, opacity = 1 } = o;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    const skin = grandpa ? "#101f31" : "#0a1424";
    const skinTop = grandpa ? "#1b2e42" : "#15263a";
    const lampY = 23 * s;
    const halo = Math.pow(s, 0.62); // 光晕比身子长得慢，大萤火虫不等于大灯

    const wing = (dir) => {
      const w = mk("g", { transform: `translate(${dir * 5 * s},${-9 * s})` }, g);
      const inner = mk("g", { class: `wing wing-${dir < 0 ? "l" : "r"}` }, w);
      mk("path", {
        d: leafPath(0, 0, dir * 22 * s, -16 * s, dir * 40 * s, -6 * s, 22 * s, 0.55),
        fill: "#f3ead9", opacity: grandpa ? 0.15 : 0.21,
      }, inner);
      mk("path", {
        d: leafPath(0, 0, dir * 16 * s, -8 * s, dir * 28 * s, 4 * s, 12 * s, 0.6),
        fill: "#f3ead9", opacity: grandpa ? 0.09 : 0.13,
      }, inner);
      return inner;
    };
    wing(-1); wing(1);

    const b = mk("g", { class: "dou-body" }, g);
    const lamp = mk("g", { class: "lamp" }, b);   // 光晕和灯芯在一组，一个 opacity 能全关
    mk("circle", { cx: 0, cy: lampY, r: 44 * halo, fill: "#f6c445", opacity: 0.06 }, lamp);
    mk("circle", { cx: 0, cy: lampY, r: 28 * halo, fill: "#f6c445", opacity: 0.1 }, lamp);
    mk("circle", { cx: 0, cy: lampY, r: 16 * halo, fill: "#f8cf6a", opacity: 0.18 }, lamp);
    const core = mk("g", { class: "lamp-core" }, lamp);
    mk("ellipse", { cx: 0, cy: lampY, rx: 7.2 * s, ry: 8.4 * s, fill: "#f6c445" }, core);
    mk("ellipse", { cx: 0, cy: lampY - 1.2 * s, rx: 4 * s, ry: 4.8 * s, fill: "#fff0bc" }, core);

    mk("path", {
      d: `M0,${-21 * s} C${9 * s},${-21 * s} ${14 * s},${-11 * s} ${14 * s},${2 * s}
          C${14 * s},${16 * s} ${8 * s},${26 * s} 0,${26 * s}
          C${-8 * s},${26 * s} ${-14 * s},${16 * s} ${-14 * s},${2 * s}
          C${-14 * s},${-11 * s} ${-9 * s},${-21 * s} 0,${-21 * s} Z`,
      fill: skin,
    }, b);
    mk("path", {
      d: `M${-12 * s},${-6 * s} C${-10 * s},${-16 * s} ${-5 * s},${-20 * s} 0,${-20 * s}
          C${5 * s},${-20 * s} ${10 * s},${-16 * s} ${12 * s},${-6 * s}
          C${6 * s},${-12 * s} ${-6 * s},${-12 * s} ${-12 * s},${-6 * s} Z`,
      fill: skinTop, opacity: "0.9",
    }, b);
    mk("circle", { cx: -3.4 * s, cy: -13.2 * s, r: 4.4 * s, fill: "#f3ead9" }, b);
    mk("circle", { cx: 3.4 * s, cy: -13.2 * s, r: 4.4 * s, fill: "#f3ead9" }, b);
    mk("circle", { cx: -2.6 * s, cy: -12.6 * s, r: 2.1 * s, fill: "#0c1826" }, b);
    mk("circle", { cx: 4.2 * s, cy: -12.6 * s, r: 2.1 * s, fill: "#0c1826" }, b);
    mk("path", {
      d: `M${-2.2 * s},${-19 * s} C${-4 * s},${-26 * s} ${-8 * s},${-29 * s} ${-11 * s},${-30 * s}`,
      stroke: "#f3ead9", "stroke-width": 1.15 * s, fill: "none", "stroke-linecap": "round", opacity: 0.55,
    }, b);
    mk("path", {
      d: `M${2.2 * s},${-19 * s} C${4 * s},${-26 * s} ${8 * s},${-29 * s} ${11 * s},${-30 * s}`,
      stroke: "#f3ead9", "stroke-width": 1.15 * s, fill: "none", "stroke-linecap": "round", opacity: 0.55,
    }, b);
    return g;
  };

  // 小蜗牛：朝右。外壳陶土色（全片第二个暖色，只给它）
  const snail = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1 } = o;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    const body = mk("g", { class: "snail-body" }, g);
    mk("path", {
      d: `M${-52 * s},0 C${-54 * s},${-12 * s} ${-44 * s},${-17 * s} ${-28 * s},${-17 * s}
          L${18 * s},${-17 * s} C${34 * s},${-17 * s} ${46 * s},${-22 * s} ${50 * s},${-30 * s}
          C${54 * s},${-22 * s} ${52 * s},${-6 * s} ${44 * s},0 Z`,
      fill: "#d9cbb2", opacity: "0.94",
    }, body);
    mk("ellipse", { cx: -2 * s, cy: 2 * s, rx: 52 * s, ry: 5 * s, fill: "#0a1424", opacity: "0.4" }, body);
    const stalk = (bx, tx, ty, cls) => {
      const sg = mk("g", { class: cls }, body);
      mk("path", {
        d: `M${bx * s},${-15 * s} C${(bx + 2) * s},${-26 * s} ${tx * s},${-32 * s} ${tx * s},${ty * s}`,
        stroke: "#d9cbb2", "stroke-width": 4 * s, fill: "none", "stroke-linecap": "round",
      }, sg);
      mk("circle", { cx: tx * s, cy: ty * s, r: 5 * s, fill: "#e6d9c2" }, sg);
      mk("circle", { cx: tx * s, cy: ty * s, r: 2.4 * s, fill: "#221a16" }, sg);
      return sg;
    };
    stalk(44, 52, -52, "eye eye-r");
    stalk(30, 30, -58, "eye eye-l");
    const shell = mk("g", { class: "shell" }, g);
    mk("circle", { cx: -14 * s, cy: -34 * s, r: 34 * s, fill: "#a9714f" }, shell);
    mk("circle", { cx: -14 * s, cy: -34 * s, r: 34 * s, fill: "none", stroke: "#8d5a3d", "stroke-width": 2.4 * s, opacity: "0.7" }, shell);
    let d = "";
    for (let i = 0; i <= 150; i++) {
      const t = i / 150, a = t * Math.PI * 2 * 2.6 - 0.6, r = 3 + t * 29;
      d += (i === 0 ? "M" : "L") + (-14 * s + Math.cos(a) * r * s).toFixed(1) + "," + (-34 * s + Math.sin(a) * r * s).toFixed(1);
    }
    mk("path", { d, stroke: "#7d4a30", "stroke-width": 2.6 * s, fill: "none", opacity: "0.85" }, shell);
    mk("path", {
      d: `M${-42 * s},${-46 * s} C${-36 * s},${-64 * s} ${-4 * s},${-70 * s} ${10 * s},${-56 * s}`,
      stroke: "#e8dcc4", "stroke-width": 3.4 * s, fill: "none", opacity: "0.4", "stroke-linecap": "round",
    }, shell);
    return g;
  };

  // 小刺猬：朝右。背是一整片锯齿剪影（从地面长起来，不是"戴了顶刺帽子"），
  // 前面伸出一张小尖脸。外层 <g> 定位，内层 .hg-body 给 GSAP 动（蜷成球动它）。
  const hedgehog = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1 } = o;
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.42;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 4 * s, cy: 2 * s, rx: 86 * s, ry: 9 * s, fill: sh, opacity: sho }, g);
    const body = mk("g", { class: "hg-body" }, g);

    const R0 = 46 * s, cx = 0, cy = -46 * s;

    // ---- 刺：从右底角起，绕过头顶到左底角；一长一短交替，形成锯齿
    const N = 40, pts = [[R0 * 0.96, -2 * s]];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const a = Math.PI * (0.02 + 0.96 * t);
      const rr = (i % 2 === 0 ? 1.22 : 1.03) * R0;
      pts.push([cx + Math.cos(a) * rr, cy - Math.sin(a) * rr * 0.96]);
    }
    pts.push([-R0 * 0.96, -2 * s]);
    crayon(body, poly(pts), "#2a2118", 2, { tintOpacity: 0.02 });

    // ---- 刺上的一道亮边（蜡笔的笔触，让剪影不平）
    let rim = "";
    for (let i = 0; i <= N; i += 2) {
      const t = i / N, a = Math.PI * (0.02 + 0.96 * t);
      rim += `${i === 0 ? "M" : "L"}${(cx + Math.cos(a) * R0 * 1.2).toFixed(1)},${(cy - Math.sin(a) * R0 * 1.14).toFixed(1)} `;
    }
    mk("path", { d: rim, stroke: "#7a6448", "stroke-width": 2.6 * s, fill: "none", "stroke-linecap": "round", opacity: "0.4" }, body);

    // ---- 里层：稍微亮一点的一团绒，让刺有厚度，不是一块死黑
    mk("ellipse", { cx: 0, cy: cy + 8 * s, rx: R0 * 0.74, ry: R0 * 0.64, fill: "#2b231a" }, body);

    // ---- 头：从刺里探出来的一小颗，前面接一个尖鼻子（脸不能大，大了就像熊）
    mk("circle", { cx: R0 * 0.70, cy: -46 * s, r: R0 * 0.44, fill: "#3b2f24" }, body);
    mk("path", {
      d: `M${R0 * 0.84},${-64 * s} C${R0 * 1.10},${-58 * s} ${R0 * 1.30},${-44 * s} ${R0 * 1.38},${-30 * s}
          C${R0 * 1.42},${-23 * s} ${R0 * 1.36},${-17 * s} ${R0 * 1.24},${-18 * s}
          C${R0 * 1.06},${-21 * s} ${R0 * 0.94},${-34 * s} ${R0 * 0.82},${-48 * s} Z`,
      fill: "#4a3a2b",
    }, body);
    // 鼻头
    mk("ellipse", { cx: R0 * 1.36, cy: -22 * s, rx: 5 * s, ry: 4 * s, fill: "#100c08" }, body);
    mk("ellipse", { cx: R0 * 1.37, cy: -23.4 * s, rx: 1.8 * s, ry: 1.3 * s, fill: "#7a6046", opacity: "0.7" }, body);
    // 眼
    mk("circle", { cx: R0 * 0.92, cy: -50 * s, r: 4.4 * s, fill: "#0b0906" }, body);
    mk("circle", { cx: R0 * 0.94, cy: -51.4 * s, r: 1.5 * s, fill: "#f3ead9", opacity: "0.9" }, body);
    // 耳
    mk("circle", { cx: R0 * 0.56, cy: -72 * s, r: 7.5 * s, fill: "#2b221a" }, body);
    mk("circle", { cx: R0 * 0.56, cy: -72 * s, r: 3.4 * s, fill: "#4a3a2b", opacity: "0.9" }, body);
    // 爪
    mk("ellipse", { cx: R0 * 1.10, cy: -5 * s, rx: 9 * s, ry: 5.6 * s, fill: "#3f3226" }, body);
    mk("ellipse", { cx: R0 * 0.40, cy: -4 * s, rx: 10 * s, ry: 5.6 * s, fill: "#352a20" }, body);
    return { g, body, head: body };
  };

  // 小松鼠：朝右。大尾巴在身后，droop 让尾巴尖垂下来（蓬蓬那天就垂着）
  const squirrel = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1, droop = false } = o;
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.4;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 3 * s, rx: 46 * s, ry: 7 * s, fill: sh, opacity: sho }, g);

    // 尾巴：从臀部往上卷，垂的时候整条压低
    const tailHost = mk("g", { transform: `translate(${-24 * s},${-26 * s})` }, g);
    const tail = mk("g", { class: "sq-tail" }, tailHost);
    mk("path", {
      d: leafPath(0, 0, -66 * s, -50 * s, -54 * s, -128 * s, 46 * s, 0.32),
      fill: "#4a3a29",
    }, tail);
    mk("path", {
      d: leafPath(-4 * s, -12 * s, -54 * s, -54 * s, -44 * s, -112 * s, 26 * s, 0.4),
      fill: "#5c4834", opacity: "0.55",
    }, tail);

    const body = mk("g", { class: "sq-body" }, g);
    mk("ellipse", { cx: 0, cy: -46 * s, rx: 28 * s, ry: 40 * s, fill: "#4a3a29" }, body);
    mk("ellipse", { cx: 6 * s, cy: -40 * s, rx: 17 * s, ry: 26 * s, fill: "#6b543c", opacity: "0.5" }, body);
    mk("circle", { cx: 12 * s, cy: -96 * s, r: 25 * s, fill: "#4a3a29" }, body);
    // 耳朵
    mk("path", { d: `M${4 * s},${-114 * s} L${8 * s},${-136 * s} L${22 * s},${-118 * s} Z`, fill: "#4a3a29" }, body);
    mk("path", { d: `M${24 * s},${-116 * s} L${36 * s},${-130 * s} L${36 * s},${-108 * s} Z`, fill: "#4a3a29" }, body);
    // 脸
    mk("path", {
      d: `M${26 * s},${-104 * s} C${40 * s},${-100 * s} ${46 * s},${-92 * s} ${46 * s},${-86 * s}
          C${46 * s},${-80 * s} ${34 * s},${-78 * s} ${26 * s},${-84 * s} Z`,
      fill: "#6b543c",
    }, body);
    mk("circle", { cx: 45 * s, cy: -87 * s, r: 3.4 * s, fill: "#120e0a" }, body);
    mk("circle", { cx: 32 * s, cy: -101 * s, r: 4 * s, fill: "#0b0906" }, body);
    mk("circle", { cx: 33.4 * s, cy: -102.4 * s, r: 1.3 * s, fill: "#f3ead9", opacity: "0.85" }, body);
    // 前爪
    mk("ellipse", { cx: 20 * s, cy: -44 * s, rx: 7 * s, ry: 5 * s, fill: "#5c4834" }, body);
    mk("ellipse", { cx: -4 * s, cy: -4 * s, rx: 10 * s, ry: 6 * s, fill: "#3f3123" }, body);
    return { g, body, tail, eye: null };
  };

  // 小鼹鼠：从土里冒出来的圆团子，大鼻子，爪子上带土
  const mole = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1 } = o;
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.4;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 2 * s, rx: 62 * s, ry: 8 * s, fill: sh, opacity: sho }, g);
    const body = mk("g", { class: "ml-body" }, g);
    // 身子：一个拱起来的团（后腰高、前肩低）
    mk("path", {
      d: `M${-58 * s},0 C${-62 * s},${-44 * s} ${-34 * s},${-74 * s} ${0},${-74 * s}
          C${34 * s},${-74 * s} ${58 * s},${-46 * s} ${56 * s},${-2 * s} Z`,
      fill: "#3d3227",
    }, body);
    // 背上的高光（一层软一点的毛色）
    mk("path", {
      d: `M${-44 * s},${-10 * s} C${-46 * s},${-48 * s} ${-22 * s},${-64 * s} ${2 * s},${-63 * s}
          C${28 * s},${-62 * s} ${42 * s},${-42 * s} ${40 * s},${-12 * s} Z`,
      fill: "#544632", opacity: "0.5",
    }, body);
    mk("path", {
      d: `M${-52 * s},${-6 * s} C${-56 * s},${-46 * s} ${-30 * s},${-70 * s} ${0},${-70 * s} C${24 * s},${-70 * s} ${44 * s},${-56 * s} ${50 * s},${-34 * s}`,
      stroke: "#6f5b3f", "stroke-width": 2.6 * s, fill: "none", "stroke-linecap": "round", opacity: "0.35",
    }, body);
    // 头：一个往前探的圆，跟身子分得开
    mk("circle", { cx: 30 * s, cy: -56 * s, r: 22 * s, fill: "#443729" }, body);
    // 长鼻子（鼹鼠的招牌）
    mk("path", {
      d: `M${40 * s},${-64 * s} C${58 * s},${-60 * s} ${74 * s},${-50 * s} ${80 * s},${-40 * s}
          C${84 * s},${-33 * s} ${78 * s},${-27 * s} ${70 * s},${-30 * s}
          C${56 * s},${-34 * s} ${44 * s},${-44 * s} ${38 * s},${-52 * s} Z`,
      fill: "#5c4b36",
    }, body);
    mk("ellipse", { cx: 78 * s, cy: -35 * s, rx: 8 * s, ry: 7 * s, fill: "#9c6a5c" }, body);
    mk("ellipse", { cx: 79.5 * s, cy: -37 * s, rx: 3 * s, ry: 2.2 * s, fill: "#c78a78", opacity: "0.85" }, body);
    // 鼻子上的土（刚从地底下钻出来）
    [[84, -26, 2.6], [72, -24, 2], [80, -44, 1.8], [90, -32, 1.6], [66, -30, 1.5]].forEach(([dx, dy, r]) =>
      mk("circle", { cx: dx * s, cy: dy * s, r: r * s, fill: "#6b5334", opacity: "0.8" }, body));
    // 眼睛：两条眯起来的线（几乎看不见东西，但他笑了）
    mk("path", { d: `M${28 * s},${-62 * s} q${5 * s},${-4 * s} ${10 * s},${-1 * s}`, stroke: "#140f0a", "stroke-width": 2.6 * s, fill: "none", "stroke-linecap": "round" }, body);
    mk("path", { d: `M${44 * s},${-46 * s} q${7 * s},${6 * s} ${14 * s},${1 * s}`, stroke: "#1a130d", "stroke-width": 2.4 * s, fill: "none", "stroke-linecap": "round" }, body);
    // 两只大爪子（挖土的）
    mk("path", {
      d: `M${30 * s},${-16 * s} C${44 * s},${-18 * s} ${56 * s},${-12 * s} ${56 * s},${-2 * s}
          C${56 * s},${2 * s} ${30 * s},${2 * s} ${28 * s},${-4 * s} Z`,
      fill: "#56472f",
    }, body);
    for (let i = 0; i < 3; i++)
      mk("path", {
        d: `M${(40 + i * 6) * s},${-14 * s} L${(38 + i * 6) * s},${-3 * s}`,
        stroke: "#241c14", "stroke-width": 2.2 * s, "stroke-linecap": "round", opacity: "0.75",
      }, body);
    mk("ellipse", { cx: 2 * s, cy: -6 * s, rx: 15 * s, ry: 8 * s, fill: "#4a3d2c" }, body);
    return { g, body, nose: null };
  };

  // 一颗栗子：圆圆的身子 + 壳上一道亮亮的缝（全片唯一暖色在这里）
  const chestnut = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1 } = o;
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.35;
    const shell = o.shell ?? "#a9714f";
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    const body = mk("g", { class: "cs-body" }, g);
    mk("ellipse", { cx: 0, cy: 3 * s, rx: 24 * s, ry: 5 * s, fill: sh, opacity: sho }, body);
    mk("path", {
      d: `M0,${-27 * s} C${13 * s},${-27 * s} ${24 * s},${-16 * s} ${24 * s},${-2 * s}
          C${24 * s},${12 * s} ${14 * s},${22 * s} 0,${22 * s}
          C${-14 * s},${22 * s} ${-24 * s},${12 * s} ${-24 * s},${-2 * s}
          C${-24 * s},${-16 * s} ${-13 * s},${-27 * s} 0,${-27 * s} Z`,
      fill: shell,
    }, body);
    mk("path", {
      d: `M${-4 * s},${-26 * s} C${-2 * s},${-33 * s} ${2 * s},${-33 * s} ${4 * s},${-26 * s} Z`,
      fill: "#7d4a30",
    }, body);
    // 壳底的暗面
    mk("path", {
      d: `M${-24 * s},${-2 * s} C${-24 * s},${12 * s} ${-14 * s},${22 * s} 0,${22 * s}
          C${14 * s},${22 * s} ${24 * s},${12 * s} ${24 * s},${-2 * s}
          C${20 * s},${12 * s} ${-20 * s},${12 * s} ${-24 * s},${-2 * s} Z`,
      fill: "#8a5a3e", opacity: "0.55",
    }, body);
    // 那道缝：暖色，只在这里
    const seam = mk("g", { class: "cs-seam" }, body);
    mk("ellipse", { cx: 0, cy: -2 * s, rx: 22 * s, ry: 7 * s, fill: "#f6c445", opacity: "0.16" }, seam);
    mk("path", {
      d: `M${-19 * s},${-5 * s} C${-8 * s},${2 * s} ${8 * s},${1 * s} ${19 * s},${-7 * s}`,
      stroke: "#f6c445", "stroke-width": 3.4 * s, fill: "none", "stroke-linecap": "round",
    }, seam);
    mk("path", {
      d: `M${-16 * s},${-6 * s} C${-6 * s},${-0.5 * s} ${6 * s},${-1 * s} ${16 * s},${-7 * s}`,
      stroke: "#ffe9a8", "stroke-width": 1.5 * s, fill: "none", "stroke-linecap": "round", opacity: "0.9",
    }, seam);
    return { g, body, seam };
  };

  // 小獾团子：朝右。矮、圆、贴着地走；一张白脸从黑毛里探出来（獾的招牌就是那道白脸纹）。
  // flip=true 时朝左（站在同伴右边时用）。
  const badger = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1, flip = false } = o;
    const fur = o.fur ?? "#2a241e", furLight = o.furLight ?? "#3d352c";
    const stripe = o.stripe ?? "#d8cdb8", ink = o.ink ?? "#100d0a", rim = o.rim;
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.4;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y}) scale(${flip ? -1 : 1},1)` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 3 * s, rx: 54 * s, ry: 8 * s, fill: sh, opacity: sho }, g);
    const body = mk("g", { class: "bd-body" }, g);

    // 身子：一整个压扁的团
    mk("path", {
      d: `M${-46 * s},${-6 * s} C${-52 * s},${-44 * s} ${-30 * s},${-70 * s} ${2 * s},${-72 * s}
          C${34 * s},${-74 * s} ${52 * s},${-50 * s} ${50 * s},${-10 * s}
          C${48 * s},${-2 * s} ${-44 * s},${-2 * s} ${-46 * s},${-6 * s} Z`,
      fill: fur,
    }, body);
    // 背上的亮面（让剪影不是一块死黑）
    mk("path", {
      d: `M${-34 * s},${-14 * s} C${-38 * s},${-48 * s} ${-18 * s},${-64 * s} ${4 * s},${-64 * s}
          C${26 * s},${-64 * s} ${40 * s},${-48 * s} ${38 * s},${-18 * s} Z`,
      fill: furLight, opacity: "0.55",
    }, body);
    // 头：往前探，跟身子连成一块
    mk("circle", { cx: 40 * s, cy: -62 * s, r: 24 * s, fill: fur }, body);
    // 吻：短而钝
    mk("path", {
      d: `M${52 * s},${-70 * s} C${68 * s},${-64 * s} ${76 * s},${-54 * s} ${76 * s},${-48 * s}
          C${76 * s},${-43 * s} ${66 * s},${-41 * s} ${58 * s},${-46 * s}
          C${52 * s},${-50 * s} ${48 * s},${-58 * s} ${48 * s},${-64 * s} Z`,
      fill: furLight,
    }, body);
    // 白脸纹：从额头一直拉到鼻尖
    mk("path", {
      d: `M${36 * s},${-84 * s} C${44 * s},${-80 * s} ${50 * s},${-70 * s} ${56 * s},${-58 * s}
          C${62 * s},${-52 * s} ${70 * s},${-50 * s} ${74 * s},${-47 * s}
          C${72 * s},${-43 * s} ${64 * s},${-44 * s} ${56 * s},${-50 * s}
          C${48 * s},${-58 * s} ${40 * s},${-70 * s} ${32 * s},${-78 * s} Z`,
      fill: stripe,
    }, body);
    mk("path", {
      d: `M${20 * s},${-80 * s} C${26 * s},${-76 * s} ${30 * s},${-68 * s} ${32 * s},${-60 * s}
          C${26 * s},${-62 * s} ${18 * s},${-70 * s} ${14 * s},${-78 * s} Z`,
      fill: stripe, opacity: "0.8",
    }, body);
    // 眼罩：一道横过眼睛的黑
    mk("path", {
      d: `M${30 * s},${-66 * s} C${42 * s},${-70 * s} ${54 * s},${-66 * s} ${58 * s},${-60 * s}
          C${50 * s},${-58 * s} ${38 * s},${-60 * s} ${30 * s},${-66 * s} Z`,
      fill: ink,
    }, body);
    mk("circle", { cx: 47 * s, cy: -63 * s, r: 3.6 * s, fill: "#0b0906" }, body);
    mk("circle", { cx: 48.2 * s, cy: -64.2 * s, r: 1.3 * s, fill: "#f3ead9", opacity: "0.85" }, body);
    mk("ellipse", { cx: 76 * s, cy: -47 * s, rx: 4.4 * s, ry: 3.6 * s, fill: ink }, body);
    // 耳
    mk("circle", { cx: 30 * s, cy: -84 * s, r: 7 * s, fill: fur }, body);
    mk("circle", { cx: 46 * s, cy: -86 * s, r: 6.2 * s, fill: fur }, body);
    // 短腿
    mk("ellipse", { cx: 26 * s, cy: -4 * s, rx: 11 * s, ry: 5.6 * s, fill: ink }, body);
    mk("ellipse", { cx: -26 * s, cy: -4 * s, rx: 11 * s, ry: 5.6 * s, fill: ink }, body);
    mk("ellipse", { cx: -46 * s, cy: -30 * s, rx: 9 * s, ry: 7 * s, fill: fur }, body);
    // 受光的一侧（灯在旁边时给一道暖边）
    if (rim) mk("path", {
      d: `M${-44 * s},${-10 * s} C${-48 * s},${-48 * s} ${-26 * s},${-71 * s} ${4 * s},${-72 * s}
          C${30 * s},${-73 * s} ${48 * s},${-62 * s} ${52 * s},${-46 * s}`,
      stroke: rim, "stroke-width": 3.4 * s, fill: "none", "stroke-linecap": "round", opacity: "0.5",
    }, body);
    return { g, body, head: body };
  };

  // 小狐狸：朝右（flip 可朝左）。大尾巴、尖耳朵、长吻，尾巴尖和胸口是浅色。
  const fox = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1, flip = false } = o;
    const fur = o.fur ?? "#4a3a2b", furLight = o.furLight ?? "#6b5340";
    const pale = o.pale ?? "#cfc2a8", ink = o.ink ?? "#100d0a", rim = o.rim;
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.4;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y}) scale(${flip ? -1 : 1},1)` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 3 * s, rx: 46 * s, ry: 7 * s, fill: sh, opacity: sho }, g);

    const tailHost = mk("g", { transform: `translate(${-26 * s},${-30 * s})` }, g);
    const tail = mk("g", { class: "fx-tail" }, tailHost);
    mk("path", { d: leafPath(0, 0, -64 * s, -44 * s, -46 * s, -124 * s, 50 * s, 0.34), fill: fur }, tail);
    mk("path", { d: leafPath(-16 * s, -62 * s, -42 * s, -86 * s, -42 * s, -118 * s, 24 * s, 0.5), fill: pale, opacity: "0.92" }, tail);

    const body = mk("g", { class: "fx-body" }, g);
    mk("ellipse", { cx: 0, cy: -44 * s, rx: 27 * s, ry: 38 * s, fill: fur }, body);
    mk("ellipse", { cx: 8 * s, cy: -36 * s, rx: 16 * s, ry: 24 * s, fill: furLight, opacity: "0.55" }, body);
    mk("circle", { cx: 14 * s, cy: -92 * s, r: 24 * s, fill: fur }, body);
    // 耳朵
    mk("path", { d: `M${-2 * s},${-108 * s} L${2 * s},${-136 * s} L${18 * s},${-112 * s} Z`, fill: fur }, body);
    mk("path", { d: `M${22 * s},${-112 * s} L${34 * s},${-134 * s} L${36 * s},${-106 * s} Z`, fill: fur }, body);
    mk("path", { d: `M${2 * s},${-112 * s} L${5 * s},${-129 * s} L${14 * s},${-113 * s} Z`, fill: pale, opacity: "0.55" }, body);
    // 长吻
    mk("path", {
      d: `M${26 * s},${-102 * s} C${44 * s},${-96 * s} ${58 * s},${-84 * s} ${62 * s},${-76 * s}
          C${64 * s},${-70 * s} ${56 * s},${-68 * s} ${50 * s},${-72 * s}
          C${40 * s},${-78 * s} ${32 * s},${-88 * s} ${28 * s},${-96 * s} Z`,
      fill: furLight,
    }, body);
    mk("circle", { cx: 62 * s, cy: -75 * s, r: 3.6 * s, fill: ink }, body);
    // 胸口的白
    mk("path", {
      d: `M${6 * s},${-64 * s} C${18 * s},${-58 * s} ${24 * s},${-40 * s} ${20 * s},${-16 * s}
          C${8 * s},${-18 * s} ${0 * s},${-40 * s} ${0 * s},${-58 * s} Z`,
      fill: pale, opacity: "0.7",
    }, body);
    mk("circle", { cx: 30 * s, cy: -97 * s, r: 4 * s, fill: "#0b0906" }, body);
    mk("circle", { cx: 31.3 * s, cy: -98.4 * s, r: 1.4 * s, fill: "#f3ead9", opacity: "0.85" }, body);
    mk("ellipse", { cx: 18 * s, cy: -4 * s, rx: 9 * s, ry: 6 * s, fill: ink, opacity: "0.9" }, body);
    mk("ellipse", { cx: -14 * s, cy: -4 * s, rx: 9 * s, ry: 6 * s, fill: ink, opacity: "0.9" }, body);
    if (rim) mk("path", {
      d: `M${-24 * s},${-8 * s} C${-30 * s},${-48 * s} ${-8 * s},${-72 * s} ${14 * s},${-72 * s}`,
      stroke: rim, "stroke-width": 3 * s, fill: "none", "stroke-linecap": "round", opacity: "0.45",
    }, body);
    return { g, body, tail };
  };

  // 小兔子：朝右。长耳朵、圆身子、一团白尾巴。
  const rabbit = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1, flip = false } = o;
    const fur = o.fur ?? "#4a3a2b", furLight = o.furLight ?? "#6b5340";
    const pale = o.pale ?? "#cfc2a8", ink = o.ink ?? "#100d0a";
    const sh = o.shadow ?? "#07090e", sho = o.shadowOp ?? 0.35;
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y}) scale(${flip ? -1 : 1},1)` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 3 * s, rx: 30 * s, ry: 6 * s, fill: sh, opacity: sho }, g);
    const body = mk("g", { class: "rb-body" }, g);
    mk("ellipse", { cx: 0, cy: -30 * s, rx: 24 * s, ry: 28 * s, fill: fur }, body);
    mk("circle", { cx: 14 * s, cy: -62 * s, r: 18 * s, fill: fur }, body);
    // 耳朵：两根细长的
    mk("path", { d: `M${8 * s},${-76 * s} C${4 * s},${-100 * s} ${6 * s},${-118 * s} ${10 * s},${-120 * s} C${15 * s},${-120 * s} ${16 * s},${-100 * s} ${15 * s},${-78 * s} Z`, fill: fur }, body);
    mk("path", { d: `M${20 * s},${-76 * s} C${20 * s},${-102 * s} ${24 * s},${-116 * s} ${28 * s},${-114 * s} C${32 * s},${-112 * s} ${30 * s},${-96 * s} ${27 * s},${-76 * s} Z`, fill: fur }, body);
    mk("ellipse", { cx: 12 * s, cy: -96 * s, rx: 2.4 * s, ry: 16 * s, fill: pale, opacity: "0.45" }, body);
    mk("ellipse", { cx: 25 * s, cy: -94 * s, rx: 2.2 * s, ry: 14 * s, fill: pale, opacity: "0.4" }, body);
    // 眼 + 鼻
    mk("circle", { cx: 22 * s, cy: -64 * s, r: 3.2 * s, fill: "#0b0906" }, body);
    mk("circle", { cx: 23.1 * s, cy: -65.2 * s, r: 1.1 * s, fill: "#f3ead9", opacity: "0.8" }, body);
    mk("circle", { cx: 30 * s, cy: -58 * s, r: 2.4 * s, fill: ink }, body);
    // 白尾巴
    mk("circle", { cx: -22 * s, cy: -22 * s, r: 8 * s, fill: pale, opacity: "0.9" }, body);
    mk("ellipse", { cx: 8 * s, cy: -4 * s, rx: 9 * s, ry: 5 * s, fill: ink, opacity: "0.85" }, body);
    return { g, body };
  };

  // 铜灯：半个拳头大，提手上有一道弯（被摸亮的那道）。火苗 + 光晕在一个 <g class="cp-lamp"> 里，一个 opacity 能全灭。
  const copperLamp = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1 } = o;
    const copper = o.copper ?? "#8a5a34", copperLit = o.copperLit ?? "#c98a4a";
    const glow = o.glow ?? "#f16d16", core = o.core ?? "#ffe6a8";
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 2 * s, rx: 22 * s, ry: 5 * s, fill: o.shadow ?? "#07090e", opacity: o.shadowOp ?? 0.4 }, g);
    const lamp = mk("g", { class: "cp-lamp", opacity: o.lampOp ?? 1 }, g);
    const dEl = parent.ownerSVGElement && parent.ownerSVGElement.querySelector("defs");
    const halo = glowGrad(dEl, "cp-glow-" + id, glow, core);
    mk("ellipse", { cx: 0, cy: -34 * s, rx: 96 * s, ry: 84 * s, fill: halo || glow, opacity: halo ? 0.85 : 0.09 }, lamp);
    const flame = mk("g", { class: "cp-flame" }, lamp);
    mk("path", { d: `M0,${-54 * s} C${6.4 * s},${-45 * s} ${7 * s},${-36 * s} 0,${-30 * s} C${-7 * s},${-36 * s} ${-6.4 * s},${-45 * s} 0,${-54 * s} Z`, fill: glow }, flame);
    mk("path", { d: `M0,${-48 * s} C${3.4 * s},${-42 * s} ${3.6 * s},${-36 * s} 0,${-33 * s} C${-3.6 * s},${-36 * s} ${-3.4 * s},${-42 * s} 0,${-48 * s} Z`, fill: core, opacity: "0.95" }, flame);
    const shell = mk("g", { class: "cp-shell" }, g);
    mk("path", { d: `M${-11 * s},${-21 * s} C${-13 * s},${-45 * s} ${13 * s},${-45 * s} ${11 * s},${-21 * s}`, stroke: copperLit, "stroke-width": 3.4 * s, fill: "none", "stroke-linecap": "round" }, shell);
    mk("path", { d: `M${-13 * s},${-20 * s} L${13 * s},${-20 * s} L${16 * s},${-2 * s} C${16 * s},${2 * s} ${-16 * s},${2 * s} ${-16 * s},${-2 * s} Z`, fill: copper }, shell);
    mk("ellipse", { cx: 0, cy: -20 * s, rx: 13 * s, ry: 4 * s, fill: copperLit }, shell);
    mk("path", { d: `M${-8 * s},${-17 * s} L${-9.5 * s},${-5 * s}`, stroke: core, "stroke-width": 2.2 * s, opacity: "0.45", "stroke-linecap": "round" }, shell);
    return { g, body: shell, lamp, flame };
  };

  // 马灯：铁架 + 玻璃罩 + 提梁。小狐狸扛来的那盏，比铜灯大，光也更狠。
  const hurricaneLamp = (parent, o = {}) => {
    const { x, y, id, size = 1, opacity = 1 } = o;
    const metal = o.metal ?? "#3a3229", metalLit = o.metalLit ?? "#6b5a44";
    const glass = o.glass ?? "#f2ce86", glow = o.glow ?? "#f16d16", core = o.core ?? "#ffe6a8";
    const s = size;
    const host = mk("g", { transform: `translate(${x},${y})` }, parent);
    const g = mk("g", { id, opacity }, host);
    mk("ellipse", { cx: 0, cy: 2 * s, rx: 30 * s, ry: 6 * s, fill: o.shadow ?? "#07090e", opacity: o.shadowOp ?? 0.45 }, g);
    const lamp = mk("g", { class: "hl-lamp", opacity: o.lampOp ?? 1 }, g);
    const dEl2 = parent.ownerSVGElement && parent.ownerSVGElement.querySelector("defs");
    const halo2 = glowGrad(dEl2, "hl-glow-" + id, glow, core);
    mk("ellipse", { cx: 0, cy: -52 * s, rx: 170 * s, ry: 148 * s, fill: halo2 || glow, opacity: halo2 ? 0.9 : 0.08 }, lamp);
    const flame = mk("g", { class: "hl-flame" }, lamp);
    mk("path", { d: `M0,${-72 * s} C${9 * s},${-60 * s} ${10 * s},${-46 * s} 0,${-38 * s} C${-10 * s},${-46 * s} ${-9 * s},${-60 * s} 0,${-72 * s} Z`, fill: glow }, flame);
    mk("path", { d: `M0,${-64 * s} C${4.6 * s},${-56 * s} ${5 * s},${-46 * s} 0,${-42 * s} C${-5 * s},${-46 * s} ${-4.6 * s},${-56 * s} 0,${-64 * s} Z`, fill: core, opacity: "0.95" }, flame);
    const shell = mk("g", { class: "hl-shell" }, g);
    // 提梁
    mk("path", { d: `M${-16 * s},${-96 * s} C${-18 * s},${-136 * s} ${18 * s},${-136 * s} ${16 * s},${-96 * s}`, stroke: metalLit, "stroke-width": 4 * s, fill: "none", "stroke-linecap": "round" }, shell);
    // 顶盖
    mk("path", { d: `M${-20 * s},${-92 * s} L${20 * s},${-92 * s} L${13 * s},${-104 * s} L${-13 * s},${-104 * s} Z`, fill: metalLit }, shell);
    // 玻璃罩
    mk("rect", { x: -17 * s, y: -90 * s, width: 34 * s, height: 62 * s, rx: 6 * s, fill: glass, opacity: "0.22" }, shell);
    mk("rect", { x: -17 * s, y: -90 * s, width: 34 * s, height: 62 * s, rx: 6 * s, fill: "none", stroke: metalLit, "stroke-width": 2.4 * s, opacity: "0.9" }, shell);
    // 两根立铁
    mk("path", { d: `M${-19 * s},${-90 * s} L${-19 * s},${-30 * s} M${19 * s},${-90 * s} L${19 * s},${-30 * s}`, stroke: metal, "stroke-width": 3.4 * s, "stroke-linecap": "round" }, shell);
    // 底座
    mk("path", { d: `M${-24 * s},${-30 * s} L${24 * s},${-30 * s} L${18 * s},${-4 * s} L${-18 * s},${-4 * s} Z`, fill: metal }, shell);
    mk("path", { d: `M${-24 * s},${-30 * s} L${24 * s},${-30 * s}`, stroke: metalLit, "stroke-width": 3 * s, "stroke-linecap": "round" }, shell);
    return { g, body: shell, lamp, flame };
  };

  return { NS, mk, rnd, poly, leafPath, crayon, reed, firefly, snail,
           hedgehog, squirrel, mole, chestnut, badger, fox, rabbit,
           copperLamp, hurricaneLamp };
})();
