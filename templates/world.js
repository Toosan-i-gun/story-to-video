/* story-to-video · 参数化场景生成器 + 动作解释器
   场景 JSON 见 SKILL.md §4。build() 按 layers 顺序造世界并登记引用，
   OPS.apply() 把 ops 表翻成 GSAP 时间轴。
   铁律：
   1) 要动 x/y 的元素，外层 <g transform> 定位、内层 <g> 给 GSAP（否则 transform 属性被吃掉）
   2) 镜头一律 svgOrigin:"960 540"，子部件用百分比 pivot，翅膀用 scaleY 抖动
   3) 镜头一次推近 ≤1.35 倍                                    */
window.WORLD = (() => {
  const { mk, rnd, leafPath, poly, crayon, reed, firefly, snail } = window.KIT;

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
      mk("rect", { x: -400, y: -400, width: 2800, height: H + 400, fill: p.night }, grp);
      mk("path", {
        d: `M-400,-400 L2520,-400 L2520,${(H * 0.45).toFixed(0)} C1940,${(H * 0.43).toFixed(0)} 1520,${(H * 0.49).toFixed(0)} 1090,${(H * 0.45).toFixed(0)} C700,${(H * 0.41).toFixed(0)} 240,${(H * 0.47).toFixed(0)} -400,${(H * 0.43).toFixed(0)} Z`,
        fill: p.nightSoft, opacity: (L.band1 ?? 0.5).toFixed(2),
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
      crayon(grp, poly(pts), L.colour ?? "#0c1728", 5, { tintOpacity: 0.03 });
      mk("rect", { x: -400, y, width: 3200, height: 40, fill: L.colour ?? "#0c1728" }, grp);
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
          fill: i % 2 ? "#221c17" : "#141110", opacity: (0.35 + rnd(i + 80) * 0.4).toFixed(2),
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
      for (let i = 0; i <= 110; i++) {
        const x = -400 + (i / 110) * 3200, h = 34 + rnd(i + 30) * 128;
        pts.push([x - 16, top - h * 0.25], [x, top - h], [x + 16, top - h * 0.25]);
      }
      pts.push([2800, 1300]);
      crayon(grp, poly(pts), L.colour ?? "#0f1b26", 11, { tintOpacity: 0.04 });
    },

    blades(g, L, p, f, R) {
      const grp = mk("g", {}, g);
      for (let i = 0; i < (L.count ?? 46); i++) {
        const x = -120 + rnd(i + 900) * 2600;
        const by = (L.base ?? 1058) + rnd(i + 950) * 56;
        const h = (L.h ?? 110) + rnd(i + 1000) * (L.hVar ?? 190);
        const lean = (rnd(i + 1100) - 0.5) * (L.lean ?? 170);
        mk("path", {
          d: leafPath(x, by, x + lean * 0.34, by - h * 0.82, x + lean, by - h, 13 + rnd(i + 1200) * 12, 0.85),
          fill: i % 4 === 0 ? "#2a3f3e" : i % 3 === 0 ? "#1c2f31" : "#16272a",
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
          case "curl": {  // 缩成一团
            const c = R[o.target]; if (!c) break;
            tl.to(c.body, { scale: o.scale ?? 0.82, y: 14, duration: o.dur ?? 1.8, ease: "power2.inOut", transformOrigin: "0px 20px" }, t);
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
          default: console.warn(`[ops] 未知动作 ${o.op}`);
        }
      });
      return tl;
    },
  };

  return { build, OPS, LAYERS };
})();
