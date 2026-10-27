#!/usr/bin/env python3
"""中文字体子集化：把整字重的 TTF 裁成项目里实际用到的字形（woff2）。

用法：
  python3 font_subset.py --ttf /path/Font.ttf --out project/assets/fonts/rounded.woff2 --text-file narration.json

没有本地字体时，用 --download 自动取「资源圆体 Medium」（Resource Han Rounded，SIL OFL 1.1，
圆润柔和、适合儿童向字幕）：
  python3 font_subset.py --download --out project/assets/fonts/rounded.woff2 --text-file narration.json
"""
import argparse, os, subprocess, sys, tempfile, urllib.request

RHR_URL = "https://github.com/CyanoHao/Resource-Han-Rounded/releases/download/v0.990/RHR-CN-0.990.7z"
EXTRA = "小萤火虫的一粒光晚安一个关于点点故事给三到七岁的你「」？！，。·—…0123456789"


def collect_text(text_file):
    import json
    raw = open(text_file, encoding="utf-8").read()
    try:
        d = json.loads(raw)
        parts = []
        if isinstance(d, dict) and "lines" in d:
            for l in d["lines"]:
                parts.append(l["text"] if isinstance(l, dict) else str(l))
        elif isinstance(d, list):
            for l in d:
                parts.append(l.get("text", "") if isinstance(l, dict) else str(l))
        else:
            parts.append(raw)
        chars = set("".join(parts))
    except Exception:
        chars = set(raw)
    chars |= set(EXTRA)
    return ",".join(f"U+{ord(c):04X}" for c in sorted(c for c in chars if c.strip() and ord(c) > 31))


def fetch_rhr():
    tmp = tempfile.gettempdir()
    z = os.path.join(tmp, "RHR-CN.7z")
    if not os.path.exists(z):
        print("下载资源圆体（37MB）…")
        urllib.request.urlretrieve(RHR_URL, z)
    out = os.path.join(tmp, "rhr")
    os.makedirs(out, exist_ok=True)
    ttf = os.path.join(out, "ResourceHanRoundedCN-Medium.ttf")
    if not os.path.exists(ttf):
        import py7zr
        with py7zr.SevenZipFile(z) as archive:
            archive.extract(path=out, targets=["ResourceHanRoundedCN-Medium.ttf"])
    return ttf


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ttf", help="本地字体文件")
    ap.add_argument("--download", action="store_true", help="没有 --ttf 时自动下载资源圆体")
    ap.add_argument("--out", required=True)
    ap.add_argument("--text-file", required=True, help="narration.json 或任何含台词的文本")
    a = ap.parse_args()

    ttf = a.ttf
    if not ttf and a.download:
        ttf = fetch_rhr()
    if not ttf or not os.path.exists(ttf):
        sys.exit("需要 --ttf 或 --download")

    uni = collect_text(a.text_file)
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    cmd = [sys.executable, "-m", "fontTools.subset", ttf, f"--unicodes={uni}",
           "--flavor=woff2", f"--output-file={a.out}",
           "--layout-features=*", "--no-hinting", "--desubroutinize"]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit(r.stderr[-600:])
    print(f"ok {os.path.getsize(a.out)} bytes -> {a.out}")


if __name__ == "__main__":
    main()
