/* story-to-video · 参数化场景生成器 + 动作解释器
   场景 JSON 见 SKILL.md §4。build() 按 layers 顺序造世界并登记引用，
   OPS.apply() 把 ops 表翻成 GSAP 时间轴。
   铁律：
   1) 要动 x/y 的元素，外层 <g transform> 定位、内层 <g> 给 GSAP（否则 transform 属性被吃掉）
   2) 镜头一律 svgOrigin:"960 540"，子部件用百分比 pivot，翅膀用 scaleY 抖动
   3) 镜头一次推近 ≤1.35 倍                                    */
window.WORLD = (() => {
  const { mk, rnd, leafPath, poly, crayon, reed, firefly, snail,
          hedgehog, squirrel, mole, chestnut } = window.KIT;

  const P = (spec) => spec.palette; // 色板

  // ---------- 滤镜：每场一套，id 带场景前缀 ----------
  function defs(svg, prefix) {
    const defsEl = svg.querySelector("defs") || mk("defs", {}, svg);
    mk("filter", {
      id: `${prefix}-wob`, x: "-6%", y: "-6%", width: "112%", height: "112%",
      innerHTML:
        `<feTurbulence type="fractalNoise" baseFrequency="0.011" numOctaves="3" seed="17" result="t"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="t" scale="9" xChannelSelector="R" yChannelSelector="G"/>`,
    }, defsEl);
    mk("filter", {
      id: `${prefix}-wob-s`, x: "-8%", y: "-8%", width: "116%", height: "116%",
      innerHTML:
        `<feTurbulence type="fractalNoise" baseFrequency="0.026" numOctaves="2" seed="41" result="t"/>` +
        `<feDisplacementMap in="SourceGraphic" in2="t" scale="4.2" xChannelSelector="R" yChannelSelector="G"/>`,
    }, defsEl);
    return { wob: `url(#${prefix}-wob)`, wobS: `url(#${prefix}-wob-s)` };
  }

  // ---------- 层 ----------
  const LAYERS = {
    sky(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const H = L.horizon ?? 700;
      // 天可以给一个竖向渐变：天顶暗、靠近地平线亮（天亮/黄昏都靠它）
      let fill = p.night;
      if (L.grad) {
        const svgEl = g.ownerSVGElement;
        const defsEl = svgEl.querySelector("defs") || mk("defs", {}, svgEl);
        const id = `skygrad-${Math.round(H)}-${String(L.grad[1]).replace("#", "")}`;
        if (!svgEl.querySelector(`#${id}`)) {
          const lg = mk("linearGradient", {
            id, gradientUnits: "userSpaceOnUse",
            x1: "0", y1: "-120", x2: "0", y2: String(H + 400),
          }, defsEl);
          const stops = L.grad.length === 3
            ? [[0, L.grad[0]], [((H + 120) / (H + 520)) * 100, L.grad[1]], [100, L.grad[2]]]
            : [[0, L.grad[0]], [100, L.grad[1]]];
          stops.forEach(([off, col]) =>
            mk("stop", { offset: `${off.toFixed(1)}%`, "stop-color": col }, lg));
        }
        fill = `url(#${id})`;
      }
      mk("rect", { x: -400, y: -400, width: 2800, height: H + 400, fill }, grp);
      mk("path", {
        d: `M-400,-400 L2520,-400 L2520,${(H * 0.45).toFixed(0)} C1940,${(H * 0.43).toFixed(0)} 1520,${(H * 0.49).toFixed(0)} 1090,${(H * 0.45).toFixed(0)} C700,${(H * 0.41).toFixed(0)} 240,${(H * 0.47).toFixed(0)} -400,${(H * 0.43).toFixed(0)} Z`,
        fill: L.bandColour ?? p.nightSoft, opacity: (L.band1 ?? 0.5).toFixed(2),
      }, grp);
      R.sky = grp;
    },

    stars(g, L, p, f, R) {
      const grp = mk("g", { fill: p.chalk }, g);
      const stars = [];
      for (let i = 0; i < (L.count ?? 64); i++) {
        stars.push(mk("rect", {
          x: -140 + rnd(i) * 2160, y: 22 + rnd(i + 100) * ((L.height ?? 470)),
          width: 2 + rnd(i + 200) * 9, height: 2.2, rx: 1.1,
          opacity: (0.16 + rnd(i + 300) * 0.46).toFixed(2),
        }, grp));
      }
      R.stars = stars;
    },

    farbank(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const y = L.y ?? 690, pts = [[-400, y + 70], [-400, y]];
      for (let i = 0; i <= 150; i++) {
        const x = -400 + (i / 150) * 3200, h = 6 + rnd(i + 30) * 30;
        pts.push([x - 5, y - h * 0.25], [x, y - h]);
      }
      pts.push([2800, y + 70]);
      crayon(grp, poly(pts), L.colour ?? p.bank ?? "#0c1728", 5, { tintOpacity: 0.03 });
      mk("rect", { x: -400, y, width: 3200, height: 40, fill: L.colour ?? p.bank ?? "#0c1728" }, grp);
    },

    water(g, L, p, f, R) {
      const grp = mk("g", {}, g);
      const y = L.y ?? 676, to = L.to ?? 900;
      mk("path", {
        d: `M-400,${y} L2800,${y} L2800,${to + 22} C2200,${to + 28} 1500,${to - 10} 900,${to + 18} C500,${to + 40} 60,${to + 4} -400,${to + 26} Z`,
        fill: p.waterDeep ?? "#0f1c34",
      }, grp);
      if (L.band !== false)
        mk("path", {
          d: `M-400,${y + 24} C420,${y + 2} 900,${y + 50} 1420,${y + 26} C1860,${y + 10} 2260,${y + 40} 2800,${y + 22} L2800,${y + 116} C2200,${y + 138} 1600,${y + 102} 980,${y + 126} C560,${y + 146} 120,${y + 116} -400,${y + 136} Z`,
          fill: p.waterBand ?? "#22385c", opacity: "0.3", filter: f.wob,
        }, grp);
      const rip = mk("g", { stroke: p.chalk, fill: "none", "stroke-linecap": "round", filter: f.wobS }, grp);
      const gli = mk("g", { fill: p.chalk, filter: f.wobS }, grp);
      for (let i = 0; i < (L.ripples ?? 20); i++) {
        const ry = y + 30 + rnd(i + 10) * (to - y - 40);
        mk("path", {
          d: `M${(-240 + rnd(i + 20) * 2800).toFixed(0)},${ry.toFixed(0)} q140,${(rnd(i) * 12 - 6).toFixed(0)} 280,0`,
          "stroke-width": (2.4 + rnd(i) * 3.4).toFixed(1),
          opacity: (0.05 + rnd(i + 50) * 0.1).toFixed(2),
        }, rip);
      }
      for (let i = 0; i < (L.glints ?? 16); i++) {
        mk("rect", {
          x: -220 + rnd(i + 500) * 2800, y: y + 24 + rnd(i + 400) * (to - y - 34),
          width: 12 + rnd(i + 600) * 40, height: 2.6, rx: 1.3,
          opacity: (0.1 + rnd(i + 700) * 0.24).toFixed(2),
        }, gli);
      }
      R.ripples = rip; R.glints = gli;
    },

    ground(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const y = L.y ?? 898;
      mk("path", {
        d: `M-400,${y} C180,${y - 22} 700,${y + 20} 1180,${y - 6} C1580,${y - 28} 2200,${y + 14} 2800,${y - 12} L2800,1400 L-400,1400 Z`,
        fill: L.colour ?? p.bank ?? "#121e2b",
      }, grp);
      for (let i = 0; i < (L.patches ?? 18); i++) {
        mk("ellipse", {
          cx: -300 + rnd(i + 40) * 2800, cy: y + 40 + rnd(i + 50) * 160,
          rx: 100 + rnd(i + 60) * 160, ry: 18 + rnd(i + 70) * 30,
          fill: i % 2 ? (p.patchA ?? "#221c17") : (p.patchB ?? "#141110"),
          opacity: (L.patchOp != null ? L.patchOp : 0.3 + rnd(i + 80) * 0.32).toFixed(2),
        }, grp);
      }
      R.ground = grp;
    },

    reeds(g, L, p, f, R) {
      const grp = mk("g", {}, g);
      const list = L.items || [];
      const refs = [];
      list.forEach((r, i) => {
        const g2 = reed(grp, {
          x: r[0], baseY: r[1], h: r[2], lean: r[3] ?? (rnd(i + 900) - 0.5) * 20,
          i: L.far ? 100 + i : i, scale: L.scale ?? 1, id: (L.far ? 100 : 0) + i,
          stem: L.stem ?? p.stem ?? "#243840", leaf: L.leaf ?? p.leaf ?? "#1a2b32",
          plume: L.plume ?? p.plume ?? "#2b3f42", leaves: L.leaves ?? 2,
        });
        refs.push({ g: g2, x: r[0], baseY: r[1] });
      });
      R[L.far ? "reedsFar" : "reedsNear"] = refs;
      if (L.sway) R.swayList = refs;
    },

    grassmass(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const top = L.top ?? 1010, pts = [[-400, 1300]];
      const h0 = L.h ?? 34, hv = L.hVar ?? 128;
      for (let i = 0; i <= 110; i++) {
        const x = -400 + (i / 110) * 3200, h = h0 + rnd(i + 30) * hv;
        pts.push([x - 16, top - h * 0.25], [x, top - h], [x + 16, top - h * 0.25]);
      }
      pts.push([2800, 1300]);
      crayon(grp, poly(pts), L.colour ?? "#0f1b26", 11, { tintOpacity: 0.04 });
    },

    blades(g, L, p, f, R) {
      const grp = mk("g", {}, g);
      const c1 = L.c1 ?? p.bladeA ?? "#3a3626", c2 = L.c2 ?? p.bladeB ?? "#2c3122", c3 = L.c3 ?? p.bladeC ?? "#232a1e";
      for (let i = 0; i < (L.count ?? 46); i++) {
        const x = -120 + rnd(i + 900) * 2600;
        const by = (L.base ?? 1058) + rnd(i + 950) * 56;
        const h = (L.h ?? 110) + rnd(i + 1000) * (L.hVar ?? 190);
        const lean = (rnd(i + 1100) - 0.5) * (L.lean ?? 170);
        mk("path", {
          d: leafPath(x, by, x + lean * 0.34, by - h * 0.82, x + lean, by - h, 13 + rnd(i + 1200) * 12, 0.85),
          fill: i % 4 === 0 ? c1 : i % 3 === 0 ? c2 : c3,
          opacity: (0.5 + rnd(i + 1300) * 0.42).toFixed(2),
        }, grp);
      }
    },

    blurmass(g, L, p, f, R) {
      // 失焦的草：软竖条，给特写当背景
      const grp = mk("g", { filter: f.wobS }, g);
      for (let i = 0; i < (L.count ?? 11); i++) {
        const x = -180 + i * ((L.step ?? 220)) + rnd(i) * 80;
        const h = (L.h ?? 380) + rnd(i + 20) * 480;
        mk("ellipse", {
          cx: x, cy: (L.bottom ?? 1120) - h / 2, rx: (L.rx ?? 34) + rnd(i + 80) * 26, ry: h / 2,
          fill: i % 3 === 0 ? "#0e1b2a" : "#101e2d",
          opacity: (0.28 + rnd(i + 90) * 0.3).toFixed(2),
        }, grp);
      }
    },

    leaf(g, L, p, f, R) {
      // 一片横过画面的宽叶，特写里给角色站
      const grp = mk("g", { filter: f.wob }, g);
      const [x0, y0] = L.from, [cx, cy] = L.ctrl, [x1, y1] = L.to;
      const sh = L.shadow ?? 82, rim = L.rim ?? 48, w = L.w ?? 96;
      crayon(grp, leafPath(x0, y0, cx, cy, x1, y1, w, 0.6), L.fill ?? "#0d1a24", 3, { tintOpacity: 0.02 });
      mk("path", {
        d: leafPath(x0, y0 + sh, cx, cy + sh, x1, y1 + sh, w * 0.85, 0.7),
        fill: "#0b1720", opacity: "0.9",
      }, grp);
      mk("path", {
        d: `M${x0},${y0 - rim} C${cx},${cy - rim} ${x1 * 0.72},${y1 - rim} ${x1},${y1 - rim}`,
        stroke: "#4a6b6a", "stroke-width": 3.2, fill: "none", opacity: "0.5",
      }, grp);
      R.leaf = grp;
    },

    stones(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wobS }, g);
      (L.items || []).forEach(([x, y, rx, ry]) => {
        mk("ellipse", { cx: x, cy: y + 12, rx: rx * 0.92, ry: ry * 0.7, fill: "#0a1524", opacity: "0.5" }, grp);
        mk("ellipse", { cx: x, cy: y, rx, ry, fill: "#182a40", stroke: "#f3ead9", "stroke-width": "1.6", "stroke-opacity": "0.2" }, grp);
        mk("ellipse", { cx: x - rx * 0.2, cy: y - ry * 0.35, rx: rx * 0.5, ry: ry * 0.3, fill: "#24384f", opacity: "0.55" }, grp);
      });
    },

    dandelions(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      (L.items || []).forEach(([x, k], i) => {
        const gy = L.y ?? 900;
        const gg = mk("g", { transform: `translate(${x},${gy})` }, grp);
        mk("path", { d: `M0,0 C-6,${-90 * k} 4,${-170 * k} 2,${-240 * k}`, stroke: "#2c3f38", "stroke-width": 5, fill: "none" }, gg);
        const hy = -244 * k;
        for (let s2 = 0; s2 < 26; s2++) {
          const a = (s2 / 26) * Math.PI * 2, len = 26 + rnd(s2 + i * 7) * 16;
          mk("path", {
            d: `M0,${hy} L${(Math.cos(a) * len).toFixed(1)},${(hy + Math.sin(a) * len).toFixed(1)}`,
            stroke: "#cfd6cd", "stroke-width": 1.7, opacity: "0.5",
          }, gg);
        }
        mk("circle", { cx: 0, cy: hy, r: 13, fill: "#e4e6da", opacity: "0.75" }, gg);
      });
    },

    twig(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      mk("path", {
        d: `M${L.x},${L.y} C${L.x + 60},${L.y - 16} ${L.x + 140},${L.y - 10} ${L.x + 200},${L.y - 28}`,
        stroke: "#3a2e22", "stroke-width": 17, fill: "none", "stroke-linecap": "round",
      }, grp);
    },

    rock(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const { x, y } = L;
      mk("ellipse", { cx: x, cy: y, rx: L.rx ?? 96, ry: L.ry ?? 74, fill: "#26333f" }, grp);
      mk("ellipse", { cx: x - 30, cy: y - 24, rx: (L.rx ?? 96) * 0.58, ry: (L.ry ?? 74) * 0.46, fill: "#33424f", opacity: "0.8" }, grp);
      // 青石头：底下留一条黑缝（蜗牛的家）
      if (L.crack)
        mk("path", {
          d: `M${x - 60},${y + 20} C${x - 64},${y - 6} ${x - 54},${y - 26} ${x - 36},${y - 38}
              C${x - 18},${y - 26} ${x - 12},${y - 2} ${x - 18},${y + 20} Z`,
          fill: "#070d14",
        }, grp);
    },

    tree(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const clumps = [];
      for (let i = 0; i < (L.clumps ?? 30); i++) {
        const cx = L.cx + rnd(i + 500) * (L.spread ?? 1000) - (L.spread ?? 1000) * 0.35;
        const cy = L.cy + rnd(i + 600) * (L.height ?? 480);
        const r = (L.r ?? 110) + rnd(i + 700) * (L.rVar ?? 100);
        clumps.push([cx, cy, r]);
        mk("ellipse", { cx, cy, rx: r * 1.16, ry: r * 0.86, fill: p.crown ?? "#0c2018", opacity: "0.99" }, grp);
      }
      for (let i = 0; i < (L.fringe ?? 30); i++) {
        const cx = L.cx + rnd(i + 750) * (L.spread ?? 1000) - (L.spread ?? 1000) * 0.35;
        const cy = L.cy + (L.fringeY ?? 300) + rnd(i + 760) * (L.fringeH ?? 200);
        mk("path", {
          d: leafPath(cx, cy + 40, cx + (rnd(i + 770) - 0.5) * 100, cy,
            cx + (rnd(i + 780) - 0.5) * 170, cy - 110, 34 + rnd(i + 790) * 26, 0.6),
          fill: i % 2 ? "#0b1e17" : p.crown ?? "#0c2018", opacity: (0.65 + rnd(i + 795) * 0.3).toFixed(2),
        }, grp);
      }
      if (L.trunk) {
        const [tx, ty0, ty1] = L.trunk;
        crayon(grp, `M${tx - 28},${ty0} C${tx - 20},${ty0 - 200} ${tx - 8},${ty1 + 160} ${tx},${ty1} L${tx + 74},${ty1} C${tx + 86},${ty1 + 160} ${tx + 96},${ty0 - 200} ${tx + 106},${ty0} Z`,
          "#15241d", 3, { tintOpacity: 0.03 });
      }
      const lights = mk("g", {}, g);
      for (let i = 0; i < (L.lights ?? 64); i++) {
        const cx = L.cx + rnd(i + 800) * (L.spread ?? 1000) - (L.spread ?? 1000) * 0.35;
        const cy = L.cy + rnd(i + 900) * (L.height ?? 480);
        mk("circle", {
          cx, cy, r: 3.4, fill: p.lamp ?? "#f6c445",
          opacity: (0.35 + rnd(i + 950) * 0.55).toFixed(2),
        }, lights);
      }
      R.treeLights = lights;
      R.crown = clumps;
    },

    pool(g, L, p, f, R) {
      const host = mk("g", {}, g);
      if (L.x != null) host.setAttribute("transform", `translate(${L.x},${L.y ?? 900})`);
      const grp = mk("g", { filter: f.wob, opacity: L.opacity ?? 1 }, host);
      mk("ellipse", { cx: 0, cy: 0, rx: 300, ry: 94, fill: p.lamp ?? "#f6c445", opacity: "0.05" }, grp);
      mk("ellipse", { cx: 0, cy: 0, rx: 150, ry: 46, fill: "#f8cf6a", opacity: "0.085" }, grp);
      R.pool = grp;   // 内层：x/scale 都动它
    },

    farflies(g, L, p, f, R) {
      const grp = mk("g", {}, g);
      const refs = [];
      (L.items || []).forEach(([x, y], k) => {
        const host = mk("g", {}, grp);
        const placed = mk("g", { transform: `translate(${x},${y})` }, host);
        mk("circle", { cx: 0, cy: 0, r: 12, fill: p.lamp ?? "#f6c445", opacity: "0.07" }, placed);
        mk("circle", { cx: 0, cy: 0, r: 3.2, fill: p.lamp ?? "#f6c445", opacity: "0.85" }, placed);
        refs.push({ host, k });
      });
      R.farflies = refs;
    },

    dusk(g, L, p, f, R) {
      const grp = mk("g", { filter: f.wob }, g);
      const y = L.y ?? 700;
      const d = `M-300,1300 L-300,${y} C-120,${y - 30} 40,${y + 28} 210,${y - 14} C380,${y - 56} 520,${y + 22} 700,${y - 20}
                 C880,${y - 62} 1010,${y + 16} 1200,${y - 26} C1390,${y - 68} 1520,${y + 10} 1700,${y - 32}
                 C1880,${y - 74} 2040,${y + 4} 2300,${y - 38} L2300,1300 Z`;
      const body = mk("path", { id: "dusk-body", d, fill: L.colour ?? "#0a1526", opacity: (L.opacity ?? 0.62).toFixed(2) }, grp);
      body.setAttribute("transform", `translate(0,${L.hiddenY ?? 620})`);
      R.dusk = body;
    },

    // ================= 秋日 · 洞穴 · 雨（小刺猬那类故事） =================

    autumnTree(g, L, p, f, R) {
      // 秋树：树干 + 橄榄褐树冠 + 垂下来的叶簇
      const grp = mk("g", { filter: f.wob }, g);
      const x = L.x ?? 1560, baseY = L.baseY ?? 980, topY = L.topY ?? 330;
      crayon(grp, `M${x - 54},${baseY} C${x - 40},${baseY - 240} ${x - 26},${baseY - 400} ${x - 18},${topY + 190}
        L${x + 46},${topY + 190} C${x + 58},${baseY - 380} ${x + 74},${baseY - 220} ${x + 88},${baseY} Z`,
        p.trunk ?? "#241d18", 3, { tintOpacity: 0.03 });
      [[-1, 0.6], [1, 0.7], [-1, 0.84], [1, 0.88]].forEach(([d, t], i) => {
        const by = baseY - (baseY - topY) * t;
        mk("path", {
          d: `M${x + d * 6},${by} C${x + d * 96},${by - 52} ${x + d * 176},${by - 70} ${x + d * 262},${by - 100}`,
          stroke: p.trunk ?? "#241d18", "stroke-width": (18 - i * 3.4).toFixed(1),
          fill: "none", "stroke-linecap": "round",
        }, grp);
      });
      const cy = L.cy ?? 340, spread = L.spread ?? 1240, ch = L.height ?? 430;
      for (let i = 0; i < (L.clumps ?? 34); i++) {
        const cx = x + rnd(i + 500) * spread - spread * 0.55;
        const yy = cy + rnd(i + 600) * ch;
        const r = (L.r ?? 96) + rnd(i + 700) * (L.rVar ?? 88);
        mk("ellipse", {
          cx, cy: yy, rx: r * 1.2, ry: r * 0.84,
          fill: i % 3 === 0 ? (p.crownB ?? "#3a3524") : (p.crown ?? "#2a2c1e"), opacity: "0.97",
        }, grp);
      }
      for (let i = 0; i < (L.fringe ?? 26); i++) {
        const cx = x + rnd(i + 750) * spread - spread * 0.55;
        const yy = cy + ch + rnd(i + 760) * (L.fringeH ?? 200);
        mk("path", {
          d: leafPath(cx, yy + 36, cx + (rnd(i + 770) - 0.5) * 90, yy,
            cx + (rnd(i + 780) - 0.5) * 150, yy - 96, 30 + rnd(i + 790) * 22, 0.6),
          fill: i % 2 ? (p.leafDry ?? "#3a3222") : (p.crown ?? "#2a2c1e"),
          opacity: (0.6 + rnd(i + 795) * 0.34).toFixed(2),
        }, grp);
      }
      R.canopy = grp;
    },

    chestFall(g, L, p, f, R) {
      // 从枝头掉下来的栗子刺球：落地即隐，下一轮从高处重新掉
      const grp = mk("g", {}, g);
      const refs = [];
      const s = L.size ?? 1;
      (L.items || []).forEach(([x, y0, y1], i) => {
        const host = mk("g", { transform: `translate(${x},${y1})` }, grp);
        const el = mk("g", {}, host);
        mk("circle", { cx: 0, cy: 0, r: 15 * s, fill: p.burr ?? "#3a3320" }, el);
        for (let k = 0; k < 15; k++) {
          const a = (k / 15) * Math.PI * 2 + rnd(i + k);
          mk("path", {
            d: `M${(Math.cos(a) * 12 * s).toFixed(1)},${(Math.sin(a) * 12 * s).toFixed(1)}
                L${(Math.cos(a) * 21 * s).toFixed(1)},${(Math.sin(a) * 21 * s).toFixed(1)}`,
            stroke: p.burrLight ?? "#4d4229", "stroke-width": 2.6 * s, "stroke-linecap": "round",
          }, el);
        }
        mk("circle", { cx: -3 * s, cy: -4 * s, r: 4.6 * s, fill: p.burrLight ?? "#5c4e2c", opacity: "0.8" }, el);
        refs.push({ el, y0, y1, i });
      });
      R.chestFall = refs;
    },

    leafFall(g, L, p, f, R) {
      // 飘下来的黄叶：一边落一边飘一点
      const grp = mk("g", {}, g);
      const refs = [];
      const s = L.size ?? 1;
      (L.items || []).forEach(([x, y0, y1], i) => {
        const host = mk("g", { transform: `translate(${x},${y1})` }, grp);
        const el = mk("g", {}, host);
        const w = (16 + rnd(i + 40) * 12) * s;
        mk("path", {
          d: leafPath(0, 0, (rnd(i + 50) - 0.5) * 20 * s, -w * 1.6, (rnd(i + 60) - 0.5) * 26 * s, -w * 3,
            w, 0.7),
          fill: i % 3 === 0 ? (p.leafFallA ?? "#5a4a2c") : i % 3 === 1 ? (p.leafFallB ?? "#4a3d26") : (p.leafFallC ?? "#3f3520"),
          opacity: (0.55 + rnd(i + 70) * 0.4).toFixed(2),
        }, el);
        refs.push({ el, y0, y1, i });
      });
      R.leafFall = refs;
    },

    burrowOut(g, L, p, f, R) {
      // 洞口：一座土丘（本地的小丘，不是整条地平线）+ 丘上一个黑拱门 + 门口一块石头
      const cx = L.x ?? 960, baseY = L.y ?? 1000;
      const w = L.w ?? 300, h = L.h ?? 280, hw = L.hw ?? w * 2.4;
      const top = baseY - h - 110;
      const grp = mk("g", { filter: f.wob }, g);
      crayon(grp, `M${cx - hw},${baseY + 40}
        C${cx - hw * 0.9},${baseY - h * 0.28} ${cx - hw * 0.66},${top + 90} ${cx - w * 0.72},${top + 34}
        C${cx - w * 0.2},${top - 12} ${cx + w * 0.34},${top + 6} ${cx + w * 0.86},${top + 60}
        C${cx + hw * 0.5},${top + 150} ${cx + hw * 0.84},${baseY - h * 0.16} ${cx + hw},${baseY + 40}
        L${cx + hw},1500 L${cx - hw},1500 Z`, p.soil ?? "#2a2320", 5, { tintOpacity: 0.03 });
      // 丘顶一层薄薄的落叶色，跟下面的土分开
      mk("path", {
        d: `M${cx - hw * 0.92},${baseY - h * 0.3}
            C${cx - hw * 0.7},${top + 96} ${cx - w * 0.7},${top + 38} ${cx - w * 0.2},${top - 8}
            C${cx + w * 0.34},${top + 10} ${cx + w * 0.86},${top + 64} ${cx + hw * 0.5},${top + 154}`,
        stroke: p.soilDeep ?? "#3d3423", "stroke-width": 12, fill: "none", opacity: "0.35", "stroke-linecap": "round",
      }, grp);
      // 拱门
      const springY = baseY - h * 0.55;
      const arch = `M${cx - w / 2},${baseY + 40} L${cx - w / 2},${springY} A${w / 2},${w / 2} 0 0 1 ${cx + w / 2},${springY} L${cx + w / 2},${baseY + 40} Z`;
      mk("path", { d: arch, fill: p.hole ?? "#05070b" }, grp);
      mk("path", { d: arch, fill: "none", stroke: p.chalk, "stroke-width": 3.4, opacity: "0.13" }, grp);
      mk("path", {
        d: `M${cx - w / 2 - 16},${baseY + 40} L${cx - w / 2 - 16},${springY} A${w / 2 + 16},${w / 2 + 16} 0 0 1 ${cx + w / 2 + 16},${springY} L${cx + w / 2 + 16},${baseY + 40}`,
        fill: "none", stroke: "#1a1512", "stroke-width": 20, opacity: "0.5",
      }, grp);
      // 门口那块石头（雨点打在上面）
      const sx = cx + w * 0.52, sy = baseY - 14;
      mk("ellipse", { cx: sx, cy: sy + 8, rx: 42, ry: 12, fill: p.hole ?? "#080b10", opacity: "0.55" }, grp);
      mk("ellipse", { cx: sx, cy: sy, rx: 40, ry: 26, fill: p.stone ?? "#2b3644" }, grp);
      mk("ellipse", { cx: sx - 10, cy: sy - 8, rx: 22, ry: 13, fill: p.stoneLit ?? "#3a4756", opacity: "0.75" }, grp);
      // 丘上的草
      for (let i = 0; i < 16; i++) {
        const gx = cx - hw * 0.8 + rnd(i + 20) * hw * 1.6;
        const gy = top + 40 + rnd(i + 30) * 120;
        mk("path", {
          d: leafPath(gx, gy + 30, gx + (rnd(i + 40) - 0.5) * 30, gy + 6, gx + (rnd(i + 50) - 0.5) * 54, gy - 26,
            12 + rnd(i + 60) * 10, 0.6),
          fill: p.crown ?? "#2c3122", opacity: (0.4 + rnd(i + 70) * 0.3).toFixed(2),
        }, grp);
      }
      R.burrow = grp;
    },

    burrowIn(g, L, p, f, R) {
      // 从洞里往外看：外头一片夜色，土壁围出一个拱形的口
      const cx = L.x ?? 980, w = L.w ?? 330;
      const springY = L.springY ?? 470, floorY = L.floorY ?? 1020;
      const grp = mk("g", {}, g);
      mk("rect", { x: -400, y: -400, width: 2720, height: 1900, fill: L.outside ?? p.night }, grp);
      const arch = `M${cx - w / 2},${floorY + 260} L${cx - w / 2},${springY} A${w / 2},${w / 2} 0 0 1 ${cx + w / 2},${springY} L${cx + w / 2},${floorY + 260} Z`;
      mk("path", {
        d: `M-400,-400 H2320 V1500 H-400 Z ${arch}`,
        "fill-rule": "evenodd", fill: L.wall ?? p.soil ?? "#2a2320",
      }, grp);
      // 拱门边上，外面的光落在土上
      mk("path", { d: arch, fill: "none", stroke: p.chalk, "stroke-width": 4, opacity: "0.12" }, grp);
      mk("path", {
        d: arch, fill: "none", stroke: p.hole ?? "#000000", "stroke-width": 26, opacity: "0.35",
      }, grp);
      // 土壁的颗粒感
      for (let i = 0; i < 46; i++) {
        const px = -200 + rnd(i + 10) * 2400, py = 60 + rnd(i + 20) * 1000;
        const insideArch = px > cx - w / 2 - 10 && px < cx + w / 2 + 10 && py > springY - w / 2;
        if (insideArch) continue;
        mk("circle", {
          cx: px, cy: py, r: 2 + rnd(i + 30) * 5,
          fill: i % 2 ? "#1e1813" : "#3a3025", opacity: (0.2 + rnd(i + 40) * 0.35).toFixed(2),
        }, grp);
      }
      // 从土顶垂下来的几条草根，让墙不是一块空板
      for (let i = 0; i < 9; i++) {
        const rx0 = -100 + rnd(i + 70) * 2200;
        const len = 90 + rnd(i + 80) * 240;
        mk("path", {
          d: `M${rx0.toFixed(0)},${-20 + rnd(i + 90) * 40}
              C${(rx0 + 12).toFixed(0)},${len * 0.4} ${(rx0 - 14).toFixed(0)},${len * 0.7} ${(rx0 + 6).toFixed(0)},${len}`,
          stroke: "#4a3d2c", "stroke-width": (1.6 + rnd(i + 100) * 2.2).toFixed(1),
          fill: "none", "stroke-linecap": "round", opacity: (0.12 + rnd(i + 110) * 0.16).toFixed(2),
        }, grp);
      }
      R.wall = grp;
    },

    straw(g, L, p, f, R) {
      // 干草：铺在地上的一层短草秆
      const grp = mk("g", {}, g);
      const y = L.y ?? 1000, n = L.count ?? 70;
      for (let i = 0; i < n; i++) {
        const x = (L.from ?? -60) + rnd(i + 10) * (L.span ?? 2040);
        const yy = y + rnd(i + 20) * (L.depth ?? 120);
        const len = 34 + rnd(i + 30) * 60;
        const a = (rnd(i + 40) - 0.5) * 0.9;
        mk("path", {
          d: `M${x},${yy} q${(Math.cos(a) * len * 0.5).toFixed(1)},${(Math.sin(a) * len * 0.5 - 6).toFixed(1)} ${(Math.cos(a) * len).toFixed(1)},${(Math.sin(a) * len).toFixed(1)}`,
          stroke: i % 3 === 0 ? "#6a5a3c" : i % 3 === 1 ? "#544732" : "#4a3f2c",
          "stroke-width": (2 + rnd(i + 50) * 2.4).toFixed(1),
          fill: "none", "stroke-linecap": "round",
          opacity: (0.25 + rnd(i + 60) * 0.4).toFixed(2),
        }, grp);
      }
      R.straw = grp;
    },

    fruitPile(g, L, p, f, R) {
      // 洞里码好的一小堆果子：橡子、山楂、小梨
      const x = L.x ?? 640, y = L.y ?? 950, n = L.count ?? 18, s = L.scale ?? 1;
      const grp = mk("g", { filter: f.wobS }, g);
      for (let i = 0; i < n; i++) {
        const ig = mk("g", { class: "fruit-item" }, grp);
        const ix = x + (rnd(i + 10) - 0.5) * 230 * s;
        const iy = y - rnd(i + 20) * 96 * s;
        const k = i % 3;
        if (k === 0) {
          // 橡子
          mk("ellipse", { cx: ix, cy: iy, rx: 11 * s, ry: 13 * s, fill: "#6b4a2e" }, ig);
          mk("path", { d: `M${ix - 11 * s},${iy - 5 * s} q${11 * s},${-8 * s} ${22 * s},0`, stroke: "#4a3320", "stroke-width": 3.4 * s, fill: "none" }, ig);
        } else if (k === 1) {
          // 山楂
          mk("circle", { cx: ix, cy: iy, r: 8.4 * s, fill: "#7d3b32" }, ig);
          mk("path", { d: `M${ix},${iy - 8 * s} l${2 * s},${-7 * s}`, stroke: "#4a2a22", "stroke-width": 2.4 * s, "stroke-linecap": "round" }, ig);
        } else {
          // 小梨
          mk("ellipse", { cx: ix, cy: iy, rx: 9 * s, ry: 12 * s, fill: "#8a7a3a" }, ig);
          mk("ellipse", { cx: ix, cy: iy - 6 * s, rx: 6 * s, ry: 6 * s, fill: "#8a7a3a" }, ig);
        }
      }
      // 堆底的一层暗影，让它坐在地上
      mk("ellipse", { cx: x, cy: y + 12 * s, rx: 140 * s, ry: 16 * s, fill: p.shadow ?? "#05070b", opacity: p.shadowOp ?? 0.35 }, grp);
      R.pile = grp;
    },

    gifts(g, L, p, f, R) {
      // 天亮时洞口的一小堆：一颗栗子（带那道缝）、橡子、野莓、干蘑菇、一片羽毛
      const x = L.x ?? 960, y = L.y ?? 1000, s = L.scale ?? 1;
      const grp = mk("g", { filter: f.wobS }, g);
      mk("ellipse", { cx: x, cy: y + 10 * s, rx: 150 * s, ry: 18 * s, fill: p.shadow ?? "#05070b", opacity: p.shadowOp ?? 0.3 }, grp);

      const add = (fn) => { const it = mk("g", { class: "gift-item" }, grp); fn(it); };

      // 栗子（正中，最亮）
      add((it) => {
        const cx = x - 10 * s, cy = y - 14 * s;
        mk("path", {
          d: `M${cx},${cy - 27 * s} C${cx + 13 * s},${cy - 27 * s} ${cx + 24 * s},${cy - 16 * s} ${cx + 24 * s},${cy - 2 * s}
              C${cx + 24 * s},${cy + 12 * s} ${cx + 14 * s},${cy + 22 * s} ${cx},${cy + 22 * s}
              C${cx - 14 * s},${cy + 22 * s} ${cx - 24 * s},${cy + 12 * s} ${cx - 24 * s},${cy - 2 * s}
              C${cx - 24 * s},${cy - 16 * s} ${cx - 13 * s},${cy - 27 * s} ${cx},${cy - 27 * s} Z`,
          fill: p.chest ?? "#a9714f",
        }, it);
        const seam = mk("g", { class: "cs-seam" }, it);
        mk("ellipse", { cx, cy: cy - 2 * s, rx: 22 * s, ry: 7 * s, fill: "#f6c445", opacity: "0.18" }, seam);
        mk("path", {
          d: `M${cx - 19 * s},${cy - 5 * s} C${cx - 8 * s},${cy + 2 * s} ${cx + 8 * s},${cy + 1 * s} ${cx + 19 * s},${cy - 7 * s}`,
          stroke: "#f6c445", "stroke-width": 3.2 * s, fill: "none", "stroke-linecap": "round",
        }, seam);
      });
      // 橡子三颗
      [[-96, -4, 1], [-70, -16, 0.9], [-118, 8, 0.85]].forEach(([dx, dy, k]) => add((it) => {
        mk("ellipse", { cx: x + dx * s, cy: y + dy * s, rx: 11 * k * s, ry: 13 * k * s, fill: "#6b4a2e" }, it);
        mk("path", { d: `M${x + (dx - 11 * k) * s},${y + (dy - 5 * k) * s} q${11 * k * s},${-8 * k * s} ${22 * k * s},0`, stroke: "#4a3320", "stroke-width": 3.2 * k * s, fill: "none" }, it);
      }));
      // 一小把野莓
      [[64, 4], [80, -6], [96, 6], [72, -20], [92, -18]].forEach(([dx, dy], i) => add((it) => {
        mk("circle", { cx: x + dx * s, cy: y + dy * s, r: (7 + rnd(i) * 2) * s, fill: "#7d3b32" }, it);
      }));
      // 两朵晒干的蘑菇
      [[132, 2, 1], [156, -6, 0.85]].forEach(([dx, dy, k]) => add((it) => {
        mk("path", { d: `M${x + dx * s},${y + dy * s} l0,${-14 * k * s}`, stroke: "#8a7550", "stroke-width": 5 * k * s, "stroke-linecap": "round" }, it);
        mk("path", {
          d: `M${x + (dx - 15 * k) * s},${y + (dy - 13 * k) * s} q${15 * k * s},${-16 * k * s} ${30 * k * s},0 Z`,
          fill: "#7a6444",
        }, it);
      }));
      // 一片特别软的羽毛
      add((it) => {
        const fx = x - 168 * s, fy = y - 6 * s;
        mk("path", {
          d: `M${fx},${fy} C${fx + 34 * s},${fy - 26 * s} ${fx + 74 * s},${fy - 30 * s} ${fx + 96 * s},${fy - 16 * s}
              C${fx + 74 * s},${fy - 12 * s} ${fx + 40 * s},${fy - 2 * s} ${fx},${fy} Z`,
          fill: "#cfc4ae", opacity: "0.5",
        }, it);
        mk("path", {
          d: `M${fx},${fy} C${fx + 34 * s},${fy - 18 * s} ${fx + 70 * s},${fy - 22 * s} ${fx + 96 * s},${fy - 16 * s}`,
          stroke: "#e6dcc6", "stroke-width": 1.6 * s, fill: "none", opacity: "0.6",
        }, it);
      });
      R.gifts = grp;
      R.giftSeam = { g: grp.querySelector(".cs-seam"), seam: grp.querySelector(".cs-seam") };
    },

    moon(g, L, p, f, R) {
      // 月亮：冷白的，跟那颗栗子的暖缝分得清
      const x = L.x ?? 1620, y = L.y ?? 210, r = L.r ?? 58;
      const grp = mk("g", {}, g);
      mk("circle", { cx: x, cy: y, r: r * 3.6, fill: p.moon ?? "#dfe9f2", opacity: "0.035" }, grp);
      mk("circle", { cx: x, cy: y, r: r * 2.2, fill: p.moon ?? "#dfe9f2", opacity: "0.055" }, grp);
      mk("circle", { cx: x, cy: y, r, fill: p.moon ?? "#dfe9f2", opacity: "0.86" }, grp);
      mk("circle", { cx: x - r * 0.34, cy: y - r * 0.26, r: r * 0.9, fill: p.night, opacity: "0.1" }, grp);
      R.moon = grp;
    },

    moonPool(g, L, p, f, R) {
      // 一小片月光：栗子滚出去，正好停在里头
      const host = mk("g", {}, g);
      if (L.x != null) host.setAttribute("transform", `translate(${L.x},${L.y ?? 940})`);
      const grp = mk("g", { filter: f.wob, opacity: L.opacity ?? 1 }, host);
      const c = p.moon ?? "#dfe9f2";
      mk("ellipse", { cx: 0, cy: 0, rx: (L.rx ?? 300), ry: (L.ry ?? 74), fill: c, opacity: "0.07" }, grp);
      mk("ellipse", { cx: 0, cy: 0, rx: (L.rx ?? 300) * 0.62, ry: (L.ry ?? 74) * 0.6, fill: c, opacity: "0.1" }, grp);
      mk("ellipse", { cx: 0, cy: 0, rx: (L.rx ?? 300) * 0.3, ry: (L.ry ?? 74) * 0.34, fill: c, opacity: "0.15" }, grp);
      mk("ellipse", {
        cx: 0, cy: 0, rx: (L.rx ?? 300) * 0.86, ry: (L.ry ?? 74) * 0.86,
        fill: "none", stroke: c, "stroke-width": 2.4, opacity: "0.14",
      }, grp);
      R.moonPool = grp;
    },

    rain(g, L, p, f, R) {
      // 秋雨：三层斜线，一层比一层慢。给了 clip 就只下在拱门里（从洞里往外看）
      const grp = mk("g", {}, g);
      if (L.clip) {
        const svgEl = g.ownerSVGElement;
        const defsEl = svgEl.querySelector("defs") || mk("defs", {}, svgEl);
        const id = `rain-clip-${Math.round(L.clip[0])}-${Math.round(L.clip[1])}`;
        const cp = mk("clipPath", { id }, defsEl);
        const [ccx, cw, sy, floor] = L.clip;
        mk("path", {
          d: `M${ccx - cw / 2},${floor} L${ccx - cw / 2},${sy} A${cw / 2},${cw / 2} 0 0 1 ${ccx + cw / 2},${sy} L${ccx + cw / 2},${floor} Z`,
        }, cp);
        grp.setAttribute("clip-path", `url(#${id})`);
      }
      const x0 = L.from ?? -200, x1 = L.to ?? 2200;
      const y0 = L.y0 ?? -120, y1 = L.y1 ?? 1280;
      const layers = [];
      const total = L.count ?? 130;
      for (let li = 0; li < 3; li++) {
        const lg = mk("g", { opacity: 0 }, grp);
        const n = Math.round(total / 3);
        for (let i = 0; i < n; i++) {
          const x = x0 + rnd(i * 7 + li * 131) * (x1 - x0);
          const y = y0 + rnd(i * 11 + li * 271) * (y1 - y0);
          const len = (34 + rnd(i * 13 + li * 37) * 62) * (L.len ?? 1);
          mk("path", {
            d: `M${x.toFixed(0)},${y.toFixed(0)} l${(-len * 0.24).toFixed(1)},${len.toFixed(1)}`,
            stroke: p.chalk, "stroke-width": (1.4 + rnd(i + li) * 1.6).toFixed(1),
            "stroke-linecap": "round", opacity: (0.1 + rnd(i * 3 + li) * 0.26).toFixed(2),
          }, lg);
        }
        layers.push(lg);
      }
      R.rain = layers;
    },

    dawn(g, L, p, f, R) {
      // 天亮：一道冷白的光从地平线漫上来，压一条更亮的边
      const grp = mk("g", { filter: f.wob }, g);
      const y = L.y ?? 760;
      mk("path", {
        d: `M-400,1500 L-400,${y + 40} C200,${y - 30} 700,${y + 20} 1180,${y - 10}
            C1600,${y - 40} 2100,${y + 16} 2320,${y - 6} L2320,1500 Z`,
        fill: p.dawn ?? "#8fa4bd", opacity: (L.opacity ?? 0.26).toFixed(2),
      }, grp);
      mk("path", {
        d: `M-400,${y + 42} C200,${y - 28} 700,${y + 22} 1180,${y - 8} C1600,${y - 38} 2100,${y + 18} 2320,${y - 4}`,
        stroke: p.chalk ?? "#f3ead9", "stroke-width": 3, fill: "none", opacity: (L.lineOpacity ?? 0.2).toFixed(2),
      }, grp);
      const bandHost = mk("g", { transform: `translate(0,${L.hiddenY ?? 260})` }, grp);
      const band = mk("ellipse", {
        cx: L.cx ?? 960, cy: y + 30, rx: L.rx ?? 1100, ry: L.ry ?? 120,
        fill: p.dawn ?? "#8fa4bd", opacity: (L.bandOpacity ?? 0.1).toFixed(2),
      }, bandHost);
      R.dawn = band;
      R.dawnWrap = grp;
    },

    dirtHole(g, L, p, f, R) {
      // 鼹鼠钻出来的土洞：一堆新土 + 一个黑洞
      const x = L.x ?? 620, y = L.y ?? 1010, s = L.scale ?? 1;
      const grp = mk("g", { filter: f.wobS }, g);
      mk("path", {
        d: `M${x - 110 * s},${y + 10} C${x - 96 * s},${y - 46 * s} ${x - 40 * s},${y - 62 * s} ${x + 4 * s},${y - 58 * s}
            C${x + 60 * s},${y - 54 * s} ${x + 104 * s},${y - 22 * s} ${x + 110 * s},${y + 10} Z`,
        fill: p.soil ?? "#33291f",
      }, grp);
      mk("ellipse", { cx: x, cy: y - 22 * s, rx: 40 * s, ry: 24 * s, fill: p.hole ?? "#0a0806" }, grp);
      mk("ellipse", { cx: x, cy: y - 22 * s, rx: 40 * s, ry: 24 * s, fill: "none", stroke: "#4d4030", "stroke-width": 3, opacity: "0.6" }, grp);
      for (let i = 0; i < 12; i++)
        mk("circle", {
          cx: x + (rnd(i + 10) - 0.5) * 220 * s, cy: y + rnd(i + 20) * 22 * s,
          r: (2 + rnd(i + 30) * 4) * s, fill: "#3f3325", opacity: (0.4 + rnd(i + 40) * 0.4).toFixed(2),
        }, grp);
      R.dirtHole = grp;
    },
  };

  // ---------- 角色 ----------
  const CHARACTERS = {
    firefly(g, C, p, R) {
      const f = firefly(g, { x: C.x, y: C.y, id: C.id, size: C.size ?? 1.5, opacity: C.opacity ?? 0, grandpa: !!C.grandpa });
      return {
        g: f, body: f.querySelector(".dou-body"), lamp: f.querySelector(".lamp"),
        core: f.querySelector(".lamp-core"),
        wingL: f.querySelector(".wing-l"), wingR: f.querySelector(".wing-r"),
      };
    },
    snail(g, C, p, R) {
      const s = snail(g, { x: C.x, y: C.y, id: C.id, size: C.size ?? 1.2, opacity: C.opacity ?? 1 });
      return {
        g: s, body: s.querySelector(".snail-body"),
        eyeL: s.querySelector(".eye-l"), eyeR: s.querySelector(".eye-r"),
      };
    },
    hedgehog(g, C, p, R) {
      const h = hedgehog(g, { x: C.x, y: C.y, id: C.id, size: C.size ?? 1, opacity: C.opacity ?? 1,
        shadow: p.shadow, shadowOp: p.shadowOp ?? 0.4 });
      return { g: h.g, body: h.body };
    },
    squirrel(g, C, p, R) {
      const q = squirrel(g, { x: C.x, y: C.y, id: C.id, size: C.size ?? 1,
        opacity: C.opacity ?? 1, droop: !!C.droop,
        shadow: p.shadow, shadowOp: p.shadowOp ?? 0.4 });
      return { g: q.g, body: q.body, tail: q.tail };
    },
    mole(g, C, p, R) {
      const m = mole(g, { x: C.x, y: C.y, id: C.id, size: C.size ?? 1, opacity: C.opacity ?? 1,
        shadow: p.shadow, shadowOp: p.shadowOp ?? 0.4 });
      return { g: m.g, body: m.body };
    },
    chestnut(g, C, p, R) {
      const c = chestnut(g, { x: C.x, y: C.y, id: C.id, size: C.size ?? 1, opacity: C.opacity ?? 1,
        shadow: p.shadow, shadowOp: p.shadowOp ?? 0.35, shell: p.chest });
      return { g: c.g, body: c.body, seam: c.seam };
    },
  };

  // ---------- build：按 layers 造世界 ----------
  function build(svg, spec) {
    const prefix = spec.prefix || spec.id;
    const p = spec.palette;
    const f = defs(svg, prefix);
    const cam = svg.querySelector(`#${prefix}-cam`);
    const R = { cam };
    (spec.layers || []).forEach((L) => {
      const fn = LAYERS[L.type];
      if (!fn) { console.warn(`[world] 未知层类型 ${L.type}`); return; }
      fn(cam, L, p, f, R);
    });
    (spec.characters || []).forEach((C) => {
      const fn = CHARACTERS[C.kind];
      if (!fn) { console.warn(`[world] 未知角色 ${C.kind}`); return; }
      R[C.id] = fn(cam, C, p, R);
      R[`${C.id}Host`] = cam;
    });
    return R;
  }

  // ---------- 动作表 → GSAP 时间轴 ----------
  const OPS = {
    apply(gsap, R, spec) {
      const tl = gsap.timeline({ paused: true });
      gsap.set(R.cam, { svgOrigin: "960 540" });
      const camFocus = (t, dur, s, px, py, ease = "power1.inOut", from = null) => {
        const x = -(px - 960) * s, y = -(py - 540) * s;
        if (from)
          tl.fromTo(R.cam, { scale: from.scale, x: -(from.focus[0] - 960) * from.scale, y: -(from.focus[1] - 540) * from.scale },
            { scale: s, x, y, duration: dur, ease, svgOrigin: "960 540" }, t);
        else
          tl.to(R.cam, { scale: s, x, y, duration: dur, ease, svgOrigin: "960 540" }, t);
      };
      const el = (key) => {
        const r = R[key];
        if (!r) { console.warn(`[ops] 引用不存在: ${key}`); return null; }
        return r.g ?? r;
      };

      (spec.ops || []).forEach((o) => {
        const t = o.t ?? 0;
        switch (o.op) {
          case "cam": camFocus(t, o.dur ?? 5, o.scale, o.focus[0], o.focus[1], o.ease, o.from); break;
          case "camFrom": camFocus(t, o.dur ?? 5, o.scale, o.focus[0], o.focus[1], o.ease, o.from); break;
          case "move": { const e = el(o.target); if (e) tl.to(e, { x: o.x ?? 0, y: o.y ?? 0, duration: o.dur ?? 2, ease: o.ease ?? "power2.inOut" }, t); break; }
          case "fade": { const e = el(o.target); if (e) tl.fromTo(e, { opacity: o.from ?? 0 }, { opacity: o.to ?? 1, duration: o.dur ?? 1, ease: o.ease ?? "power2.out" }, t); break; }
          case "scale": { const e = el(o.target); if (e) tl.fromTo(e, { scale: o.from ?? 1 }, { scale: o.to ?? 1.2, duration: o.dur ?? 2, ease: o.ease ?? "power2.out", transformOrigin: o.origin ?? "50% 50%" }, t); break; }
          case "rise": {  // 角色登场：升起来 + 一个小过冲
            const c = R[o.target]; if (!c) break;
            tl.fromTo(c.g, { opacity: 0, y: o.fromY ?? 52, scale: o.fromScale ?? 0.9 },
              { opacity: 1, y: 0, scale: 1, duration: o.dur ?? 1.6, ease: "power2.out" }, t);
            break;
          }
          case "flap": {   // 翅膀：scaleY 抖动（别用 rotation，pivot 会跑）
            const c = R[o.target]; if (!c) break;
            const d = o.rate ?? 0.12, n = Math.floor((o.until ?? 20) / (d * 2));
            const from = o.from ?? 1, to = o.to ?? (from > 1 ? 0.5 : 1 - (1 - 0.5));
            [c.wingL, c.wingR].forEach((w) => w && tl.fromTo(w, { scaleY: from },
              { scaleY: o.to ?? 0.5, duration: d, yoyo: true, repeat: n, ease: "sine.inOut" }, t));
            break;
          }
          case "blink": {  // 灯的"眨眼"：像谁不小心眨了一下眼睛
            const c = R[o.target]; if (!c || !c.lamp) break;
            (o.at || [3.5, 5.3]).forEach((at, i) => {
              tl.to(c.lamp, { opacity: 0.22, duration: 0.3, ease: "power2.in" }, t + at);
              tl.to(c.lamp, { opacity: 0.95, duration: 0.28, ease: "power2.out" }, t + at + 0.36);
            });
            break;
          }
          case "bob": {   // 待机呼吸
            const c = R[o.target]; if (!c) break;
            tl.fromTo(c.body, { y: 0 }, { y: o.amp ?? -6, duration: o.dur ?? 1.6, yoyo: true, repeat: o.repeat ?? 12, ease: "sine.inOut" }, t);
            break;
          }
          case "glow": { const c = R[o.target]; if (c && c.lamp) tl.fromTo(c.lamp, { opacity: o.from ?? 0.7 }, { opacity: o.to ?? 1, duration: o.dur ?? 1.2, yoyo: true, repeat: o.repeat ?? 8, ease: "sine.inOut" }, t); break; }
          case "lampOut": { const c = R[o.target]; if (c && c.lamp) tl.to(c.lamp, { opacity: o.to ?? 0.06, duration: o.dur ?? 1.6, ease: "power2.in" }, t); break; }
          case "curl": {  // 缩成一团（给 scaleX/scaleY 就压扁摊宽，像个球）
            const c = R[o.target]; if (!c) break;
            const tw = { scale: o.scale ?? 0.82, y: o.y ?? 14, duration: o.dur ?? 1.8,
              ease: "power2.inOut", transformOrigin: o.origin ?? "0px 20px" };
            if (o.scaleX != null) tw.scaleX = o.scaleX;
            if (o.scaleY != null) tw.scaleY = o.scaleY;
            tl.to(c.body, tw, t);
            break;
          }
          case "lookDown": { const c = R[o.target]; if (!c) break;
            tl.to(c.body, { rotation: o.deg ?? 9, duration: o.dur ?? 1.4, ease: "sine.inOut", transformOrigin: "0px 0px" }, t);
            tl.to(c.body, { rotation: 0, duration: o.dur ?? 1.2, ease: "sine.inOut", transformOrigin: "0px 0px" }, t + (o.hold ?? 1.8));
            break; }
          case "eyes": {  // 眼柱摆动（蜗牛）
            const c = R[o.target]; if (!c) break;
            [["eyeL", 12], ["eyeR", -14]].forEach(([k, deg]) => {
              const e = c[k]; if (!e) return;
              tl.fromTo(e, { rotation: -deg }, { rotation: deg, duration: o.dur ?? 1.6, yoyo: true, repeat: o.repeat ?? 4, ease: "sine.inOut", transformOrigin: "50% 100%" }, t);
            });
            break;
          }
          case "slide": { const e = el(o.target); if (e) tl.fromTo(e, { x: o.from ?? 0 }, { x: o.x ?? 0, duration: o.dur ?? 10, ease: o.ease ?? "none" }, t); break; }
          case "sway": {  // 芦苇摇，每根错开
            (R.swayList || []).forEach((r, i) => {
              tl.fromTo(r.g, { rotation: -1.0 }, {
                rotation: 1.2, duration: 2.7 + (i % 4) * 0.4, yoyo: true, repeat: o.repeat ?? 7,
                ease: "sine.inOut", transformOrigin: `${r.x}px ${r.baseY}px`,
              }, t + i * (o.step ?? 0.2));
            });
            break;
          }
          case "twinkle": (R.stars || []).forEach((s2, i) => {
            if (i % (o.every ?? 7) !== 0) return;
            tl.to(s2, { opacity: 0.06, duration: 1.5 + i * 0.08, yoyo: true, repeat: 4, ease: "sine.inOut" }, t + i * (o.step ?? 0.55));
          }); break;
          case "float": (R.farflies || []).forEach((ff, k) => {
            tl.fromTo(ff.host, { x: 0, y: 0 }, { x: 26 - k * 18, y: -14 + k * 8, duration: 9, yoyo: true, repeat: 1, ease: "sine.inOut" }, t + k * 1.1);
            tl.fromTo(ff.host, { opacity: 0.9 }, { opacity: 0.16, duration: 1.5 + k * 0.4, yoyo: true, repeat: 7, ease: "sine.inOut" }, t + k * 0.9);
          }); break;
          case "poolMove": { if (R.pool) tl.to(R.pool, { x: o.x, duration: o.dur ?? 2, ease: "power2.inOut" }, t); break; }
          case "poolGrow": { if (R.pool) tl.fromTo(R.pool, { scale: o.from ?? 1 }, { scale: o.to ?? 1.25, duration: o.dur ?? 3, ease: "power2.out", transformOrigin: "0px 0px" }, t); break; }
          case "duskRise": { if (R.dusk) tl.fromTo(R.dusk, { y: o.fromY ?? 620 }, { y: 0, duration: o.dur ?? 6, ease: "power2.inOut" }, t); break; }
          case "lightsIn": (R.treeLights ? Array.from(R.treeLights.children) : []).forEach((c2, i) => {
            tl.fromTo(c2, { opacity: 0 }, { opacity: (0.35 + rnd(i + 950) * 0.55).toFixed(2), duration: o.dur ?? 1.5, ease: "power2.out" }, t + rnd(i + 51) * (o.spread ?? 11));
          }); break;
          case "wingOpen": { const c = R[o.target]; if (!c) break;
            [c.wingL, c.wingR].forEach((w) => w && tl.to(w, { scale: o.scale ?? 1.45, duration: o.dur ?? 1.4, ease: "power2.out" }, t));
            break; }
          case "open": { const e = el(o.target); if (e) e.style.opacity = 1; break; }

          // ---- 秋日 · 洞穴（小刺猬那类故事）
          case "roll": {   // 栗子滚出去：只走 x，不转（SVG 的 pivot 会跑）
            const e = el(o.target); if (!e) break;
            tl.to(e, { x: o.x ?? 200, duration: o.dur ?? 2.6, ease: o.ease ?? "power1.out" }, t);
            if (o.bounce)
              tl.to(e, { y: o.bounce, duration: 0.34, yoyo: true, repeat: o.bounceN ?? 5, ease: "sine.inOut" }, t);
            break;
          }
          case "fall": {   // 从枝头掉下来（栗子/叶子），落地即隐，下一轮重来
            (R[o.target] || []).forEach((it, i) => {
              const dy = it.y0 - it.y1;
              tl.fromTo(it.el, { y: dy, opacity: 0 },
                { y: 0, opacity: o.opacity ?? 1, duration: o.dur ?? 2.4, ease: "power1.in",
                  repeat: o.repeat ?? 10 }, t + (i % (o.spread ?? 5)) * (o.step ?? 1.15) + rnd(i + 3) * 0.7);
            });
            break;
          }
          case "rainfall": {
            (R.rain || []).forEach((lg, i) => {
              tl.fromTo(lg, { y: -170, opacity: 0 },
                { y: 0, opacity: 1, duration: o.dur ?? 1.5, ease: "none", repeat: o.repeat ?? 40 },
                t + i * (o.step ?? 0.42));
            });
            break;
          }
          case "pileIn": {  // 一堆东西一样一样出现
            const e = el(o.target); if (!e) break;
            Array.from(e.children).forEach((c2, i) => {
              tl.fromTo(c2, { opacity: 0, y: o.rise ?? 16 },
                { opacity: 1, y: 0, duration: o.dur ?? 0.8, ease: "power2.out" },
                t + i * (o.step ?? 0.3));
            });
            break;
          }
          case "dawnRise": {
            // 注意：不要写死 opacity:1，会把图层自己的低透明度顶掉（天亮就变成一条亮带）
            if (R.dawn) tl.fromTo(R.dawn, { y: o.fromY ?? 240, opacity: 0 },
              { y: 0, opacity: o.to ?? 0.1, duration: o.dur ?? 6, ease: "power2.inOut" }, t);
            break;
          }
          case "seam": {    // 栗子壳上那道缝，亮一下，暗一下
            const c = R[o.target]; if (!c || !c.seam) break;
            tl.fromTo(c.seam, { opacity: o.from ?? 0.62 }, { opacity: o.to ?? 1, duration: o.dur ?? 1.8, yoyo: true, repeat: o.repeat ?? 4, ease: "sine.inOut" }, t);
            break;
          }
          case "droop": {   // 尾巴耷拉下来
            const c = R[o.target]; if (!c || !c.tail) break;
            tl.to(c.tail, { rotation: o.deg ?? 12, duration: o.dur ?? 1.6, ease: "sine.inOut", transformOrigin: "100% 100%" }, t);
            break;
          }
          case "lie": {     // 躺下（压扁一点 + 沉一点）
            const c = R[o.target]; if (!c) break;
            tl.to(c.body, { scaleY: o.scaleY ?? 0.84, y: o.y ?? 12, duration: o.dur ?? 1.3, ease: "power2.inOut", transformOrigin: "50% 100%" }, t);
            break;
          }
          case "unlie": {
            const c = R[o.target]; if (!c) break;
            tl.to(c.body, { scaleY: 1, y: 0, duration: o.dur ?? 1.1, ease: "power2.out", transformOrigin: "50% 100%" }, t);
            break;
          }
          case "shiver": {  // 抖一下（雨里/心里闷的时候）
            const c = R[o.target]; if (!c) break;
            tl.to(c.body, { x: o.amp ?? 4, duration: 0.16, yoyo: true, repeat: o.repeat ?? 6, ease: "sine.inOut" }, t);
            break;
          }
          default: console.warn(`[ops] 未知动作 ${o.op}`);
        }
      });
      return tl;
    },
  };

  return { build, OPS, LAYERS };
})();
