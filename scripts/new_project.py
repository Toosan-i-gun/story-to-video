#!/usr/bin/env python3
"""新建一个故事短片项目：目录骨架 + film.json 骨架 + 字体。

用法：
  python3 new_project.py --name 小萤火虫 --dir ./projects/firefly \
      --story "/path/故事.md"        # 可选：把故事文本存进项目里
"""
import argparse, json, os, shutil, subprocess

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--name", required=True, help="片名")
    ap.add_argument("--dir", required=True, help="项目目录")
    ap.add_argument("--story", help="故事文本（.md/.txt），会拷进项目")
    ap.add_argument("--mood", default="calm", choices=["calm", "warm", "misty"])
    a = ap.parse_args()

    proj = os.path.abspath(a.dir)
    if os.path.exists(proj):
        sys.exit(f"目录已存在：{proj}")
    for d in ("compositions", "assets/voice", "assets/audio", "assets/fonts",
              "assets/images", "assets/vendor"):
        os.makedirs(os.path.join(proj, d), exist_ok=True)

    if a.story and os.path.exists(a.story):
        shutil.copy(a.story, os.path.join(proj, "story.md"))

    # GSAP 本地化（渲染时不联网）
    gsap = None
    for d in os.path.expanduser("~/.npm/_npx/*/node_modules/gsap/dist"):
        if os.path.exists(os.path.join(d, "gsap.min.js")):
            gsap = os.path.join(d, "gsap.min.js")
            break
    if gsap:
        shutil.copy(gsap, os.path.join(proj, "assets", "vendor", "gsap.min.js"))
    else:
        print("warn: 本地没有 gsap，build 后从 CDN 下载一次放进 assets/vendor/")

    film = {
        "title": {"text": a.name, "sub": ""},
        "total": 0,
        "fps": 30,
        "mood": a.mood,
        "bedVolume": 0.26,
        "palette": {
            "night": "#16233a", "nightSoft": "#1d2d49", "ink": "#0a1220",
            "chalk": "#f3ead9", "lamp": "#f6c445", "bank": "#121e2b",
            "waterDeep": "#0f1c34", "waterBand": "#22385c",
            "stem": "#243840", "leaf": "#1a2b32", "plume": "#2b3f42",
            "crown": "#0c2018",
        },
        "lines": [
            {"id": "v01", "text": "在这里填第一句旁白。", "start": 1.2},
        ],
        "captions": {"bottom": 88, "size": 45, "colour": "#f1e6d0"},
        "title": {"text": a.name, "sub": "", "start": 0.85, "duration": 8.2},
        "scenes": [],
        "endcard": {"word": "晚安", "show": 0},
    }
    json.dump(film, open(os.path.join(proj, "film.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)

    print(f"项目建好：{proj}")
    print("下一步：")
    print("  1. 按故事拆句，填 film.json 的 lines（id/text/start）")
    print("  2. 规划 scenes（环境层/角色/镜头/动作表），字段见 templates/world.js 头注释")
    print("  3. total 与 endcard.show 对齐：total = 最后一句 end + 6s")
    print("  4. python3 scripts/build_film.py --project", proj)
    print("  5. python3 scripts/make_voice.py --project", proj)
    print("  6. python3 scripts/make_audio.py --project", proj, "--mood", a.mood)
    print("  7. npx hyperframes render --workers 1 && python3 scripts/qa_check.py")


if __name__ == "__main__":
    main()
