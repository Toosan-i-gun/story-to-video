/* story-to-video · 绘图工具箱
   所有函数都接受 prefix（场景 id），保证整页合成时 id 唯一。
   原则：大面积剪影 + 少量清晰形状 + 全片唯一暖色只给"光"。*/
window.KIT = (() => {
  const NS = "http://www.w3.org/2000/svg";

  const mk = (tag, attrs, parent) => {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
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

  return { NS, mk, rnd, poly, leafPath, crayon, reed, firefly, snail };
})();
