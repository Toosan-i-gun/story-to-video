#!/usr/bin/env python3
"""从 handraw-style 的 36 套主题色库里取色 —— 不要自己编颜色。

用法：
  python3 color_lib.py --list            # 打印 36 个色号 + hex
  python3 color_lib.py --resolve C-34,C-25
  python3 color_lib.py --refresh         # 重新从 handraw-style 的色卡图采样

约定：
- film.json 的 palette 值写**色号**（"C-34"），由 build_film.py 解析成 hex。
  写死 #rrggbb 也能跑，但会被标成"自定义色"，--strict 下直接报错。
- hex 的唯一事实来源是 handraw-style 的色卡图 images/colors/C-xx.webp。
  本目录的 references/colors.json 是它的快照（含版本与出处），换版本时 --refresh。
"""
import argparse, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
LOCAL = os.path.join(os.path.dirname(HERE), "references", "colors.json")
SKILL_ENV = "HANDRAW_STYLE_DIR"
CANDIDATES = [
    os.path.expanduser("~/.workbuddy-ai/skills/handraw-style"),
    os.path.expanduser("~/.workbuddy-ai/skills/handraw_style"),
]
INSTALL_HINT = (
    "配色必须取自 handraw-style 的 C-01–C-36 色库，但这个技能没装。\n"
    "  git clone https://github.com/yang0/handraw-style ~/.workbuddy-ai/skills/handraw-style\n"
    "或者对助手说：帮我安装这个 Skill：https://github.com/yang0/handraw-style"
)


def find_skill():
    p = os.environ.get(SKILL_ENV)
    if p and os.path.isdir(p):
        return p
    for c in CANDIDATES:
        if os.path.isdir(os.path.join(c, "images", "colors")):
            return c
    return None


def load():
    """返回 {C-xx: {name_zh, name_en, category, hex}}。"""
    if not os.path.exists(LOCAL):
        sys.exit(INSTALL_HINT)
    return json.load(open(LOCAL, encoding="utf-8"))["colors"]


def resolve(value, lib=None):
    """'C-34' -> (hex, True)；'#rrggbb' -> (原样, False)。"""
    lib = lib if lib is not None else load()
    v = str(value).strip()
    if v.upper().startswith("C-"):
        key = v.upper()
        if key not in lib:
            sys.exit(f"色号 {key} 不在 handraw-style 的 C-01–C-36 里")
        return lib[key]["hex"], True
    return v, v.startswith("#")


def resolve_palette(pal, lib=None, strict=False, where=""):
    """把整份 palette 里的色号解析成 hex；返回 (hex 色板, 自定义色清单)。"""
    lib = lib if lib is not None else load()
    out, custom = {}, []
    for k, v in pal.items():
        if isinstance(v, str) and v.startswith("#"):
            out[k] = v
            custom.append((k, v))
        elif isinstance(v, str) and v.upper().startswith("C-"):
            out[k] = resolve(v, lib)[0]
        else:
            out[k] = v
    if custom and strict:
        sys.exit(f"{where} 有 {len(custom)} 个自定义色（{'、'.join(f'{k}={v}' for k, v in custom)}）；"
                 f"配色只能取自 handraw-style 的 C-01–C-36")
    return out, custom


def deep_resolve(obj, lib=None, strict=False, where="scene", custom=None):
    """把 scene spec 里任意位置的 "C-xx" 都换成 hex（palette / layer.colour / grad 都管）。

    遇到 #rrggbb 记为自定义色；strict 下直接退出。
    """
    lib = lib if lib is not None else load()
    custom = custom if custom is not None else []
    if isinstance(obj, dict):
        return {k: deep_resolve(v, lib, strict, f"{where}.{k}", custom) for k, v in obj.items()}
    if isinstance(obj, list):
        return [deep_resolve(v, lib, strict, f"{where}[{i}]", custom) for i, v in enumerate(obj)]
    if isinstance(obj, str):
        if len(obj) == 4 and obj.upper().startswith("C-"):
            return resolve(obj, lib)[0]
        if obj.startswith("#") and len(obj) in (4, 7):
            custom.append((where, obj))
            if strict:
                sys.exit(f"{where} = {obj} 是自定义色；配色只能取自 handraw-style 的 C-01–C-36")
    return obj


def refresh():
    """从 handraw-style 的色卡图重新采样（用子进程切到技能目录，绕开读路径限制）。"""
    skill = find_skill()
    if not skill:
        sys.exit(INSTALL_HINT)
    code = r'''
import json, os
from PIL import Image
items = json.load(open("skills/handdraw-style-prompter/references/colors.json", encoding="utf-8"))
out = {}
for c in items:
    im = Image.open(os.path.join("images/colors", c["id"] + ".webp")).convert("RGB")
    w, h = im.size
    px = [im.getpixel((x, y)) for x in range(int(w*0.35), int(w*0.65), 7)
                            for y in range(int(h*0.30), int(h*0.70), 7)]
    px.sort(key=lambda t: t[0]+t[1]+t[2])
    r, g, b = px[len(px)//2]
    out[c["id"]] = {"name_zh": c["name_zh"], "name_en": c["name_en"],
                    "category": c["category_zh"], "quote": c["quote_zh"],
                    "hex": "#%02x%02x%02x" % (r, g, b)}
ver = json.load(open("version.json", encoding="utf-8"))["version"]
print(json.dumps({"version": ver, "colors": out}, ensure_ascii=False))
'''
    r = subprocess.run([sys.executable, "-c", code], cwd=skill, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("采样失败：" + (r.stderr or r.stdout)[-500:])
    data = json.loads(r.stdout)
    meta = {
        "source": "handraw-style · C-01–C-36 经典单色主题色库",
        "repo": "https://github.com/yang0/handraw-style",
        "author": "yang0",
        "version": data["version"],
        "note": "hex 由色卡图 images/colors/C-xx.webp 中心区域中位色采样得到；色号是唯一事实来源，改色请换色号。",
        "colors": data["colors"],
    }
    json.dump(meta, open(LOCAL, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"references/colors.json 已更新 · {len(meta['colors'])} 色 · handraw-style v{data['version']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--resolve")
    ap.add_argument("--refresh", action="store_true")
    a = ap.parse_args()
    if a.refresh:
        refresh()
        return
    lib = load()
    if a.list or not a.resolve:
        for k, v in lib.items():
            print(f"{k}  {v['hex']}  {v['name_zh']:<8} {v['name_en']:<22} {v['category']}")
        print("\n共 36 色 · 来源 handraw-style（github.com/yang0/handraw-style）")
        return
    for v in a.resolve.split(","):
        hx, ok = resolve(v, lib)
        print(f"{v} -> {hx}{'' if ok else '  (自定义色，不在色库里)'}")


if __name__ == "__main__":
    main()
