#!/usr/bin/env python3
"""film.json → HyperFrames 项目（index.html + compositions/ + 字幕 + 视口垫片）。

film.json 是唯一事实来源：时长、场景、镜头、字幕、配色全在里面。
用法：
  python3 build_film.py --project ./projects/firefly
"""
import argparse, json, os, shutil, sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
      position: absolute; left: 158px; top: 168px;
      font-family: "Rounded", serif; font-size: 138px; line-height: 1.1;
      letter-spacing: 0.05em; color: {lamp}; white-space: nowrap;
    }}
    #{sid}-title-in {{ display: block; clip-path: inset(-20% 100% -20% -4%); }}
    #{sid}-sub {{
      position: absolute; left: 172px; top: 372px;
      font-family: "Rounded", serif; font-size: 38px; letter-spacing: 0.34em;
      color: #f3ead9; opacity: 0; white-space: nowrap;
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
      font-family: "Rounded", serif; color: #f3ead9; }}
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
      text-align: center; color: {colour}; opacity: 0;
      text-shadow: 0 2px 2px rgba(6,12,22,.5), 0 5px 20px rgba(6,12,22,.55);
    }}
    /* 预模糊的光晕贴图：34 条字幕也不带 filter/gradient，渲染不吃力 */
    .cap-smear {{
      position: absolute; inset: -30px -80px;
      background: url("assets/images/cap-halo.png") 50% 50% / 100% 100% no-repeat;
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

CAP_GROUP = """      <div id="cap-{n}" class="cap clip" data-start="{s}" data-duration="{d}" data-track-index="0">
        <div class="cap-in"><i class="cap-smear"></i><span>{t}</span></div>
      </div>"""


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
    a = ap.parse_args()
    proj = os.path.abspath(a.project)
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))

    total = float(film["total"])
    fps = int(film.get("fps", 30))
    pal = film.get("palette", {})
    lines = film["lines"]
    cap_cfg = film.get("captions", {})
    scenes = film["scenes"]

    os.makedirs(os.path.join(proj, "compositions"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "voice"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "fonts"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "images"), exist_ok=True)
    os.makedirs(os.path.join(proj, "assets", "vendor"), exist_ok=True)

    # ---- 共享脚本
    for f in ("kit.js", "world.js"):
        shutil.copy(os.path.join(SKILL, "templates", f), os.path.join(proj, "assets", f))

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

    # ---- 光晕贴图（预模糊，别用 filter:blur）
    halo = os.path.join(proj, "assets", "images", "cap-halo.png")
    if not os.path.exists(halo):
        try:
            from PIL import Image, ImageDraw, ImageFilter
            W, H = 720, 260
            im = Image.new("L", (W, H), 0)
            ImageDraw.Draw(im).rounded_rectangle([70, 40, W - 70, H - 40], radius=70, fill=255)
            im = im.filter(ImageFilter.GaussianBlur(42))
            alpha = im.point(lambda v: int(v * 0.4))
            Image.merge("RGBA", [Image.new("L", (W, H), 7)] * 3 + [alpha]).save(halo, optimize=True)
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

    # ---- 场景
    scene_hosts, scene_files = [], []
    for idx, sc in enumerate(scenes):
        sid = sc["id"]
        spec = dict(sc)
        spec["prefix"] = sid
        spec["palette"] = pal
        spec_json = json.dumps(spec, ensure_ascii=False)

        extra_css, overlays, extra_js = "", "", ""
        if idx == 0 and film.get("title"):
            T = film["title"]
            t0 = T.get("start", 0.85)
            dur = T.get("duration", 8.2)
            fade = round(t0 + dur - 1.1, 2)
            t1 = round(T.get("subStart", t0 + 1.7), 2)
            fade2 = round(t1 + 4.2, 2)
            extra_css += TITLE_CSS.format(sid=sid, lamp=pal.get("lamp", "#f6c445"))
            overlays += TITLE_HTML.format(sid=sid, t0=t0, dur=dur, fade=fade, t1=t1,
                                          d1=round(fade2 - t1, 2), fade2=fade2,
                                          title=T["text"], sub=T.get("sub", ""))
            extra_js += TITLE_JS.format(sid=sid, t0=t0, fade=fade, t1=t1, fade2=fade2)
        if idx == len(scenes) - 1 and film.get("endcard"):
            E = film["endcard"]
            t = round(E["show"] - sc["start"], 2)
            dur = round(sc["end"] - E["show"], 2)
            extra_css += ENDCARD_CSS.format(sid=sid, lamp=pal.get("lamp", "#f6c445"))
            overlays += ENDCARD_HTML.format(sid=sid, t=t, dur=dur,
                                            title=film["title"]["text"], word=E["word"])
            extra_js += ENDCARD_JS.format(sid=sid, t1=round(t + 0.2, 2), t2=round(t + 1.1, 2))

        html = SCENE_TMPL.format(sid=sid, night=pal.get("night", "#16233a"),
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

    # ---- 字幕
    cc = cap_cfg
    cap_bottom = cc.get("bottom", 88)
    cap_size = cc.get("size", 45)
    cap_colour = cc.get("colour", "#f1e6d0")
    lead = cc.get("lead", 0.12)
    tail = cc.get("tail", 0.45)
    groups = []
    for i, l in enumerate(lines):
        nxt = lines[i + 1]["start"] if i + 1 < len(lines) else total
        s = round(max(0.0, l["start"] - lead), 3)
        e = min(l["end"] + tail, nxt - 0.02)
        groups.append(CAP_GROUP.format(n=i + 1, s=s, d=round(e - s, 3),
                                       t="<br />".join(split_caption(l["text"]))))
    open(os.path.join(proj, "compositions", "captions.html"), "w", encoding="utf-8").write(
        CAPTIONS_TMPL.format(bottom=cap_bottom, size=cap_size, colour=cap_colour,
                             groups="\n".join(groups)))

    # ---- 主合成（含视口垫片：没有它，渲染器会把画面底部用页面背景色填掉）
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
        --night: {pal.get("night", "#16233a")};
        --ink: {pal.get("ink", "#0a1220")};
        --chalk: {pal.get("chalk", "#f3ead9")};
        --lamp: {pal.get("lamp", "#f6c445")};
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

    print(f"index.html · {total}s · {len(scenes)} 场 · {len(lines)} 句")
    for sc in scenes:
        ids = [l["id"] for l in lines if sc["start"] <= l["start"] < sc["end"]]
        print(f"  {sc['id']}  {sc['start']:7.2f} + {round(sc['end'] - sc['start'], 2):6.2f}  {ids}")


if __name__ == "__main__":
    main()
