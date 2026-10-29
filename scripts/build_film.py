#!/usr/bin/env python3
"""film.json → HyperFrames 项目（index.html + compositions/ + 字幕 + 视口垫片）。

film.json 是唯一事实来源：时长、场景、镜头、字幕、配色全在里面。
用法：
  python3 build_film.py --project ./projects/firefly
"""
import argparse, json, os, shutil, sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from color_lib import load as load_colors, deep_resolve

SCENE_TMPL = """<template>
  <style>
    @font-face {{
      font-family: "Rounded";
      src: url("assets/fonts/rounded.woff2") format("woff2");
      font-weight: 500; font-display: block;
    }}
    #root {{ position: absolute; inset: 0; background: {night}; overflow: hidden; }}
    #{sid}-svg {{ position: absolute; inset: 0; width: 1920px; height: 1080px; }}
{extra_css}  </style>

  <div id="root" data-composition-id="{sid}" data-width="1920" data-height="1080">
    <svg id="{sid}-svg" viewBox="0 0 1920 1080" preserveAspectRatio="none">
      <defs></defs>
      <g id="{sid}-cam"></g>
    </svg>
{overlays}  </div>

  <script src="assets/kit.js"></script>
  <script src="assets/world.js"></script>
  <script>
    (() => {{
      const S = {spec};
      const svg = document.getElementById("{sid}-svg");
      const R = WORLD.build(svg, S);
      const tl = WORLD.OPS.apply(window.gsap, R, S);
{extra_js}      window.__timelines["{sid}"] = tl;
    }})();
  </script>
</template>
"""

TITLE_CSS = """
    /* 片名：蜡笔从左往右"画"出来，停一会儿就被夜色收走 */
    #{sid}-title {{
      position: absolute; left: 152px; top: 146px;
      font-family: "Rounded", serif; font-size: 118px; line-height: 1.1;
      letter-spacing: 0.05em; color: {lamp}; white-space: nowrap;
    }}
    #{sid}-title-in {{ display: block; clip-path: inset(-20% 100% -20% -4%); }}
    #{sid}-sub {{
      position: absolute; left: 166px; top: 312px;
      font-family: "Rounded", serif; font-size: 36px; letter-spacing: 0.32em;
      color: {ink}; opacity: 0; white-space: nowrap;
    }}
"""

TITLE_HTML = """
    <div id="{sid}-title" class="clip" data-start="{t0}" data-duration="{dur}">
      <span id="{sid}-title-in" data-var-text="title">{title}</span>
    </div>
    <div id="{sid}-sub" class="clip" data-start="{t1}" data-duration="{d1}">{sub}</div>
"""

TITLE_JS = """      // 片名：从左画出来 → 停 → 被夜色收走
      tl.fromTo("#{sid}-title-in",
        {{ clipPath: "inset(-20% 100% -20% -4%)" }},
        {{ clipPath: "inset(-20% -6% -20% -4%)", duration: 1.6, ease: "power2.out" }}, {t0});
      tl.fromTo("#{sid}-title", {{ opacity: 1 }}, {{ opacity: 0, duration: 1.1, ease: "power1.in" }}, {fade});
      tl.fromTo("#{sid}-sub", {{ opacity: 0, x: -14 }}, {{ opacity: 0.62, x: 0, duration: 1.3, ease: "power2.out" }}, {t1});
      tl.to("#{sid}-sub", {{ opacity: 0, duration: 0.9, ease: "power1.in" }}, {fade2});
"""

ENDCARD_CSS = """
    /* 落款 */
    #{sid}-end {{ position: absolute; left: 150px; bottom: 132px;
      font-family: "Rounded", serif; color: {ink}; }}
    #{sid}-end-title {{ display: block; font-size: 46px; letter-spacing: 0.16em; opacity: 0; }}
    #{sid}-end-word {{ display: block; margin-top: 14px; font-size: 132px;
      letter-spacing: 0.12em; color: {lamp}; clip-path: inset(-20% 100% -20% -4%); }}
"""

ENDCARD_HTML = """
    <div id="{sid}-end" class="clip" data-start="{t}" data-duration="{dur}">
      <span id="{sid}-end-title" data-var-text="title">{title}</span>
      <span id="{sid}-end-word" data-var-text="signoff">{word}</span>
    </div>
"""

ENDCARD_JS = """      // 落款：等最后一句说完再出现
      tl.fromTo("#{sid}-end-word", {{ clipPath: "inset(-20% 100% -20% -4%)" }},
        {{ clipPath: "inset(-20% -6% -20% -4%)", duration: 1.4, ease: "power2.out" }}, {t1});
      tl.fromTo("#{sid}-end-title", {{ opacity: 0, y: 10 }},
        {{ opacity: 0.66, y: 0, duration: 1.2, ease: "power2.out" }}, {t2});
"""

CAPTIONS_TMPL = """<template>
  <style>
    @font-face {{
      font-family: "Rounded";
      src: url("assets/fonts/rounded.woff2") format("woff2");
      font-weight: 500; font-display: block;
    }}
    #root {{ position: absolute; inset: 0; overflow: hidden; }}
    .cap {{
      position: absolute; left: 0; right: 0; bottom: {bottom}px;
      display: flex; justify-content: center;
    }}
    .cap-in {{
      position: relative; max-width: 1420px; padding: 8px 34px;
      font-family: "Rounded", sans-serif; font-weight: 500;
      font-size: {size}px; line-height: 1.56; letter-spacing: 0.035em;
      text-align: center; opacity: 0;
    }}
    /* 预模糊的光晕贴图：每条字幕都不带 filter/gradient，渲染不吃力。
       dark = 深色托底（浅字用）；light = 浅色托底（深字用，白天场景） */
    .cap-smear {{
      position: absolute; inset: -30px -80px;
      background: url("assets/images/cap-halo.png") 50% 50% / 100% 100% no-repeat;
    }}
    .cap-smear.light {{
      background-image: url("assets/images/cap-halo-light.png");
    }}
    .cap-in span {{ position: relative; }}
  </style>

  <div id="root" data-composition-id="captions" data-width="1920" data-height="1080">
{groups}  </div>

  <script>
    (() => {{
      const tl = gsap.timeline({{ paused: true }});
      document.querySelectorAll(".cap").forEach((cap) => {{
        const at = parseFloat(cap.dataset.start);
        const inner = cap.querySelector(".cap-in");
        tl.fromTo(inner, {{ opacity: 0 }},
          {{ opacity: 0.9, duration: 0.28, ease: "power2.out" }}, at + 0.04);
        tl.to(inner, {{ opacity: 0, duration: 0.2, ease: "power1.in" }},
          at + parseFloat(cap.dataset.duration) - 0.22);
      }});
      window.__timelines["captions"] = tl;
    }})();
  </script>
</template>
"""

# 字幕颜色/描边按"这一句属于哪一场"逐条注入：白天深字+浅托底，夜里浅字+深托底。
# 一部片子会从白天走到夜里，一条字幕颜色不可能通用。
CAP_GROUP = """      <div id="cap-{n}" class="cap clip" data-start="{s}" data-duration="{d}" data-track-index="0">
        <div class="cap-in" style="color:{colour};text-shadow:{shadow}"><i class="cap-smear{halo_cls}"></i><span>{t}</span></div>
      </div>"""

CAP_STYLES = {
    "light-text": {"colour": "#f1e6d0",
                   "shadow": "0 2px 2px rgba(6,12,22,.5), 0 5px 20px rgba(6,12,22,.55)",
                   "halo": "dark"},
    "dark-text": {"colour": "#2a2119",
                  "shadow": "0 1px 1px rgba(255,248,232,.75), 0 4px 18px rgba(255,246,228,.65)",
                  "halo": "light"},
}


def split_caption(text, limit=21):
    """在句中的停顿符号后断行，「」不拆开。"""
    PAUSE = "，。！？；：、…—"
    if len(text) <= limit:
        return [text]
    cands = [i + 1 for i, c in enumerate(text) if c in PAUSE and 5 <= i + 1 <= len(text) - 5]
    if not cands:
        mid = len(text) // 2
        return [text[:mid], text[mid:]]
    cut = min(cands, key=lambda i: abs(i - len(text) / 2))
    head, tail = text[:cut], text[cut:]
    while tail and tail[0] in "」』）":
        head, tail = head + tail[0], tail[1:]
    return [head, tail]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--strict-palette", action="store_true",
                    help="palette 里出现 #rrggbb 自定义色就报错（配色只许用 C-01–C-36）")
    ap.add_argument("--sync-templates", action="store_true",
                    help="强制用技能库的 templates 覆盖项目里的 kit.js/world.js"
                         "（默认：项目内副本优先，见 SKILL.md 开头的铁律）")
    a = ap.parse_args()
    proj = os.path.abspath(a.project)
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))

    total = float(film["total"])
    fps = int(film.get("fps", 30))
    colors = load_colors()
    pal = film.get("palette", {})   # 值可以是 "C-34" 这样的色号，下面统一解析
    lines = film["lines"]
    cap_cfg = film.get("captions", {})
    scenes = film["scenes"]

    os.makedirs(os.path.join(proj, "compositions"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "voice"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "fonts"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "images"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "vendor"), exist_ok=True)

    # ---- 共享脚本（kit.js / world.js）
    # 跑片子时扩展素材写在项目里、不许改技能仓库，所以拷贝的优先级是：
    #   1) projects/<name>/templates/<f>   项目内模板（显式覆盖，最优先）
    #   2) 已存在的 assets/<f>            用户直接改过的副本 —— 保留，不覆盖
    #   3) 技能库 templates/<f>           只在项目里还没有时铺一份
    # 想跟技能库强制对齐（会冲掉项目内的扩展）：--sync-templates
    for f in ("kit.js", "world.js"):
        local = os.path.join(proj, "templates", f)
        dst = os.path.join(proj, "assets", f)
        if a.sync_templates:
            shutil.copy(os.path.join(SKILL, "templates", f), dst)
            print(f"  · {f} ← 技能库模板（--sync-templates）")
        elif os.path.exists(local):
            shutil.copy(local, dst)
            print(f"  · {f} ← 项目内 templates/{f}")
        elif not os.path.exists(dst):
            shutil.copy(os.path.join(SKILL, "templates", f), dst)
        else:
            print(f"  · {f} 用项目内副本（技能模板未覆盖）")

    # ---- hyperframes.json（渲染必需；已有则不覆盖，保留用户自定义）
    hf_cfg = os.path.join(proj, "hyperframes.json")
    if not os.path.exists(hf_cfg):
        json.dump({
            "$schema": "https://hyperframes.heygen.com/schema/hyperframes.json",
            "registry": "https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry",
            "paths": {"blocks": "compositions", "components": "compositions/components",
                      "assets": "assets"},
            "media": {"autoProxy": True},
            "authoringSkill": "hyperframes",
        }, open(hf_cfg, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # ---- 光晕贴图（预模糊，别用 filter:blur）；深色托底 + 浅色托底各一张
    try:
        from PIL import Image, ImageDraw, ImageFilter
        for fname, rgb in (("cap-halo.png", (7, 7, 7)), ("cap-halo-light.png", (255, 249, 236))):
            halo = os.path.join(proj, "assets", "images", fname)
            if os.path.exists(halo):
                continue
            W, H = 720, 260
            im = Image.new("L", (W, H), 0)
            ImageDraw.Draw(im).rounded_rectangle([70, 40, W - 70, H - 40], radius=70, fill=255)
            im = im.filter(ImageFilter.GaussianBlur(42))
            alpha = im.point(lambda v: int(v * 0.4))
            Image.merge("RGBA", [Image.new("L", (W, H), c) for c in rgb] + [alpha]).save(halo, optimize=True)
    except Exception as e:
        print(f"warn: 光晕贴图生成失败（{e}），字幕将没有托底")

    # ---- 逐句时长：film.json 可只给 start，duration 由配音实测回填
    timing_path = os.path.join(proj, "voice_timing.json")
    measured = {}
    if os.path.exists(timing_path):
        for t in json.load(open(timing_path, encoding="utf-8")):
            measured[t["id"]] = t["duration"]

    for l in lines:
        if l.get("duration") is None:
            l["duration"] = measured.get(l["id"], round(len(l["text"]) / 3.9, 2))
        l["end"] = round(l["start"] + l["duration"], 3)
    for x, y in zip(lines, lines[1:]):
        if x["end"] > y["start"]:
            sys.exit(f"时间表重叠：{x['id']} 结束 {x['end']} > {y['id']} 开始 {y['start']}")

    json.dump({"total": total, "fps": fps, "lines": lines},
              open(os.path.join(proj, "timing.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    # ---- cue：动作绑台词（"这个动作属于哪一句"），t 由台词的实际起止算出来
    # 为什么要它：动作时间手填，一改语速/改台词就错位，而且错位是看不出来的
    # （叶子提前 4 秒长在壳上、台词里小鹿在问、画面上小鹿已经没了）。
    # 绑了 cue 之后，改语速只需要重跑 build，画面自动跟着旁白走。
    by_id = {l["id"]: l for l in lines}
    for sc in scenes:
        for o in sc.get("ops", []):
            cue = o.get("cue")
            if not cue:
                continue
            l = by_id.get(cue)
            if not l:
                sys.exit(f"{sc['id']} 的 {o['op']} 绑了不存在的台词 {cue}")
            base = l["end"] if o.get("cueAt") == "end" else l["start"]
            o["t"] = round(base - float(sc["start"]) + float(o.get("cueOff", 0)), 2)
            if o["t"] < 0:
                o["t"] = 0.0

    # ---- 场景
    scene_hosts, scene_files = [], []
    for idx, sc in enumerate(scenes):
        sid = sc["id"]
        spec = dict(sc)
        spec["prefix"] = sid
        # 逐场配色：scene.palette 盖在 film.palette 上。
        # 一部片子要从白天走到夜里，全片一份色板 = 全片一个时刻 = 看起来像模板。
        spec["palette"] = {**pal, **sc.get("palette", {})}
        custom = []
        spec = deep_resolve(spec, colors, a.strict_palette, sid, custom)
        for where, v in custom:
            print(f"  ! {where} = {v} 不在 handraw-style 色库里（自定义色）")
        scene_pal = spec["palette"]
        spec_json = json.dumps(spec, ensure_ascii=False)

        extra_css, overlays, extra_js = "", "", ""
        if idx == 0 and film.get("title"):
            T = film["title"]
            t0 = T.get("start", 0.85)
            dur = T.get("duration", 8.2)
            fade = round(t0 + dur - 1.1, 2)
            t1 = round(T.get("subStart", t0 + 1.7), 2)
            fade2 = round(t1 + 4.2, 2)
            extra_css += TITLE_CSS.format(sid=sid, lamp=scene_pal.get("lamp", "#f6c445"),
                                          ink=scene_pal.get("ink", "#f3ead9"))
            overlays += TITLE_HTML.format(sid=sid, t0=t0, dur=dur, fade=fade, t1=t1,
                                          d1=round(fade2 - t1, 2), fade2=fade2,
                                          title=T["text"], sub=T.get("sub", ""))
            extra_js += TITLE_JS.format(sid=sid, t0=t0, fade=fade, t1=t1, fade2=fade2)
        if idx == len(scenes) - 1 and film.get("endcard"):
            E = film["endcard"]
            t = round(E["show"] - sc["start"], 2)
            dur = round(sc["end"] - E["show"], 2)
            extra_css += ENDCARD_CSS.format(sid=sid, lamp=scene_pal.get("lamp", "#f6c445"),
                                            ink=scene_pal.get("ink", "#f3ead9"))
            overlays += ENDCARD_HTML.format(sid=sid, t=t, dur=dur,
                                            title=film["title"]["text"], word=E["word"])
            extra_js += ENDCARD_JS.format(sid=sid, t1=round(t + 0.2, 2), t2=round(t + 1.1, 2))

        html = SCENE_TMPL.format(sid=sid, night=scene_pal.get("night", "#16233a"),
                                 extra_css=extra_css, overlays=overlays,
                                 extra_js=extra_js, spec=spec_json)
        path = os.path.join(proj, "compositions", f"{sid}.html")
        open(path, "w", encoding="utf-8").write(html)
        scene_files.append(path)
        scene_hosts.append(
            f'      <div\n        id="{sid}"\n        data-composition-id="{sid}"\n'
            f'        data-composition-src="compositions/{sid}.html"\n'
            f'        data-start="{sc["start"]}"\n        data-duration="{round(sc["end"] - sc["start"], 3)}"\n'
            f'        data-track-index="{idx + 1}"\n        data-track-kind="graphics"\n'
            f'        data-width="1920"\n        data-height="1080"\n      ></div>')

    # ---- 字幕：位置/字号全片统一，颜色按"这一句落在哪一场"逐条换
    cc = cap_cfg
    cap_bottom = cc.get("bottom", 88)
    cap_size = cc.get("size", 45)
    lead = cc.get("lead", 0.12)
    tail = cc.get("tail", 0.45)

    def style_for(line):
        sc = next((s for s in scenes if s["start"] <= line["start"] < s["end"]), scenes[-1])
        cfg = {**cc, **sc.get("captions", {})}
        st = dict(CAP_STYLES[cfg.get("style", "light-text")])
        for k in ("colour", "shadow"):
            if cfg.get(k):
                st[k] = cfg[k]
        if cfg.get("halo"):
            st["halo"] = cfg["halo"]
        return st

    groups = []
    for i, l in enumerate(lines):
        nxt = lines[i + 1]["start"] if i + 1 < len(lines) else total
        s = round(max(0.0, l["start"] - lead), 3)
        e = min(l["end"] + tail, nxt - 0.02)
        st = style_for(l)
        groups.append(CAP_GROUP.format(
            n=i + 1, s=s, d=round(e - s, 3), colour=st["colour"], shadow=st["shadow"],
            halo_cls="" if st["halo"] == "dark" else " light",
            t="<br />".join(split_caption(l["text"]))))
    open(os.path.join(proj, "compositions", "captions.html"), "w", encoding="utf-8").write(
        CAPTIONS_TMPL.format(bottom=cap_bottom, size=cap_size, groups="\n".join(groups)))

    # ---- 主合成（含视口垫片：没有它，渲染器会把画面底部用页面背景色填掉）
    first_pal = deep_resolve({**pal, **scenes[0].get("palette", {})}, colors) if scenes else pal
    voice_clips = "\n".join(
        f'      <audio id="{l["id"]}" class="clip" src="assets/voice/{l["id"]}.wav"\n'
        f'        data-start="{l["start"]}" data-duration="{l["duration"]}"\n'
        f'        data-track-index="{100 + i}" data-volume="1"></audio>'
        for i, l in enumerate(lines))
    scene_html = "\n".join(scene_hosts)

    index_html = f"""<!doctype html>
<html lang="zh-CN"
      data-composition-variables='[{{"id":"title","type":"string","label":"片名","default":"{film['title']['text']}"}},{{"id":"signoff","type":"string","label":"落款","default":"{film.get('endcard',{}).get('word','晚安')}"}}]'>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>{film['title']['text']}</title>
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      @font-face {{
        font-family: "Rounded";
        src: url("assets/fonts/rounded.woff2") format("woff2");
        font-weight: 500; font-display: block;
      }}
      :root {{
        --night: {first_pal.get("night", "#16233a")};
        --ink: {first_pal.get("ink", "#0a1220")};
        --chalk: {first_pal.get("chalk", "#f3ead9")};
        --lamp: {first_pal.get("lamp", "#f6c445")};
      }}
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ width: 1920px; height: 1080px; overflow: hidden; background: var(--night); }}
      #root {{ position: absolute; inset: 0; background: var(--night); }}
      #paper-grain {{ position: absolute; inset: 0; z-index: 40; pointer-events: none;
        opacity: 0.5; mix-blend-mode: overlay; }}
      #paper-edge {{ position: absolute; inset: 0; z-index: 41; pointer-events: none; }}
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="{total}"
      data-width="1920"
      data-height="1080"
    >
{scene_html}

      <div
        id="captions"
        data-composition-id="captions"
        data-composition-src="compositions/captions.html"
        data-start="0"
        data-duration="{total}"
        data-track-index="20"
        data-track-kind="captions"
        data-width="1920"
        data-height="1080"
      ></div>

      <audio id="bed" class="clip" src="assets/audio/bed.wav" data-start="0"
        data-volume="{film.get('bedVolume', 0.26)}"></audio>

{voice_clips}

      <svg id="paper-grain" class="clip" data-start="0" data-duration="{total}" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <filter id="grain-f" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="saturate" values="0" />
        </filter>
        <rect width="1920" height="1080" filter="url(#grain-f)" opacity="0.14" />
      </svg>
      <svg id="paper-edge" class="clip" data-start="0" data-duration="{total}" viewBox="0 0 1920 1080" preserveAspectRatio="none">
        <g fill="#0a1220">
          <rect x="0" y="0" width="1920" height="26" opacity="0.16" />
          <rect x="0" y="1054" width="1920" height="26" opacity="0.2" />
          <rect x="0" y="0" width="26" height="1080" opacity="0.14" />
          <rect x="1894" y="0" width="26" height="1080" opacity="0.14" />
        </g>
      </svg>
    </div>
    <script>
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
    <!-- 视口垫片：页面 scrollHeight 超过画布高度，渲染器才不会关掉"超出视口捕获"，
         否则可见视口不足时画面底部 138px 会被页面背景色填掉（蓝条） -->
    <div id="hf-vp-spacer" style="position:absolute;left:0;top:0;width:1px;height:1084px;"></div>
  </body>
</html>
"""
    open(os.path.join(proj, "index.html"), "w", encoding="utf-8").write(index_html)

    print(f"index.html · {total}s · {len(scenes)} 场 · {len(lines)} 句 · 配色取自 handraw-style C-01–C-36")
    for sc in scenes:
        ids = sorted({v for v in sc.get("palette", {}).values()
                      if isinstance(v, str) and v.upper().startswith("C-")})
        print(f"  {sc['id']} 色号 {' '.join(ids) if ids else '（继承 film.palette）'}")
    for sc in scenes:
        ids = [l["id"] for l in lines if sc["start"] <= l["start"] < sc["end"]]
        print(f"  {sc['id']}  {sc['start']:7.2f} + {round(sc['end'] - sc['start'], 2):6.2f}  {ids}")


if __name__ == "__main__":
    main()
