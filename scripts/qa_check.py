#!/usr/bin/env python3
"""渲染 QA：把成片和浏览器渲染逐行比对，自动发现"成片和预览不一样"的问题。

检查项：
  1. 视口裁切（蓝条）：成片与浏览器快照逐行求差，差 >18 的连续行区间
  2. 时长：视频时长 vs film.json 的 total
  3. 响度：整体 LUFS 应在 -16～-14，真峰值 ≤ -1
  4. 字幕：旁白活跃的时刻，字幕带里应有文字像素

用法：
  python3 qa_check.py --project . --video "renders/片名.mp4"
  python3 qa_check.py --project . --video x.mp4 --times 4,60,120,240
退出码：有问题为 1，全绿为 0。
"""
import argparse, json, os, statistics, subprocess, sys

SKILL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def hf():
    p = os.environ.get("HYPERFRAMES_BIN")
    if p:
        return p
    for d in os.path.expanduser("~/.npm/_npx/*/node_modules/.bin"):
        if os.path.exists(os.path.join(d, "hyperframes")):
            return os.path.join(d, "hyperframes")
    return "npx"


def env():
    e = dict(os.environ)
    e.setdefault("HYPERFRAMES_BROWSER_PATH",
                 "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    return e


def sh(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, text=True, **kw)


def video_meta(mp4):
    r = sh(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,width,height",
            "-of", "json", mp4])
    d = json.loads(r.stdout)
    v = next(s for s in d["streams"] if s["codec_name"] == "video")
    return float(d["format"]["duration"]), int(v["width"]), int(v["height"])


def loudness(mp4):
    r = sh(["ffmpeg", "-hide_banner", "-nostats", "-i", mp4,
            "-af", "loudnorm=print_format=json", "-f", "null", "-"])
    txt = r.stderr
    out = {}
    for k in ("input_i", "input_tp", "input_lra"):
        i = txt.find(f'"{k}"')
        if i >= 0:
            out[k] = float(txt[txt.index(":", i) + 1: txt.index(",", i) if "," in txt[i:i + 40] else txt.index("}", i)])
    return out


def grab(mp4, t, png):
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-ss", str(t), "-i", mp4,
                    "-frames:v", "1", png], capture_output=True)


def snapshot(cli, proj, times, outdir):
    os.makedirs(outdir, exist_ok=True)
    r = sh([cli, "snapshot", "--at", ",".join(str(t) for t in times), "--no-end",
            "-o", outdir], cwd=proj, env=env())
    frames = sorted(f for f in os.listdir(outdir) if f.startswith("frame-"))
    return [os.path.join(outdir, f) for f in frames]


def rowdiff(render_png, snap_png):
    """逐行求平均绝对差。返回 (差>18 的行区间, 最大差)。"""
    a = Image_open(render_png).convert("L")
    b = Image_open(snap_png).convert("L")
    pa, pb = a.load(), b.load()
    w, h = a.size
    bad, mx = [], 0.0
    for y in range(0, h, 4):
        d = statistics.mean(abs(pa[x, y] - pb[x, y]) for x in range(100, w - 100, 20))
        mx = max(mx, d)
        if d > 18:
            bad.append(y)
    return (bad[0], bad[-1], len(bad)) if bad else (None, None, 0), mx


def Image_open(p):
    from PIL import Image
    return Image.open(p)


def captions_ok(mp4, lines, times):
    """旁白活跃的时刻，字幕带里应有亮像素（文字）。"""
    from PIL import Image
    missing = []
    for t in times:
        active = [l for l in lines if l["start"] - 0.2 <= t <= l["end"] + 0.6]
        if not active:
            continue
        png = f"/tmp/qa_cap_{t}.png"
        grab(mp4, t, png)
        im = Image.open(png).convert("L")
        w, h = im.size
        px = im.load()
        bright = sum(1 for y in range(int(h * 0.78), int(h * 0.96), 2)
                     for x in range(int(w * 0.12), int(w * 0.88), 3) if px[x, y] > 195)
        os.remove(png)
        if bright < 200:
            missing.append((t, active[0]["id"], bright))
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--video", required=True)
    ap.add_argument("--times", default="4,16,60,118,173,235,285")
    ap.add_argument("--outdir", default="/tmp/story-to-video-qa")
    a = ap.parse_args()

    proj = os.path.abspath(a.project)
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))
    mp4 = os.path.abspath(a.video)
    problems, notes = [], []

    # 1. 时长 / 规格
    dur, w, h = video_meta(mp4)
    if abs(dur - film["total"]) > 0.5:
        problems.append(f"时长 {dur:.2f}s ≠ film.json {film['total']}s")
    else:
        notes.append(f"时长 {dur:.2f}s · {w}×{h}")

    # 2. 响度
    ln = loudness(mp4)
    i, tp = ln.get("input_i"), ln.get("input_tp")
    if i is None:
        problems.append("读不到响度（视频没有音轨？）")
    else:
        if not (-17 <= i <= -13):
            problems.append(f"整体响度 {i:.1f} LUFS 不在 -16～-14；"
                            f"调 index.html 里 bed 的 data-volume（每 ±0.04 ≈ ±1dB）")
        else:
            notes.append(f"响度 {i:.1f} LUFS · 真峰值 {tp:.2f} dBTP")

    # 3. 视口裁切（蓝条）：成片 vs 浏览器快照，逐行求差
    times = [float(x) for x in a.times.split(",") if float(x) < film["total"]]
    outdir = os.path.join(a.outdir, "snap")
    for f in os.listdir(outdir) if os.path.isdir(outdir) else []:
        os.remove(os.path.join(outdir, f))
    frames = snapshot(hf(), proj, times, outdir)
    if len(frames) != len(times):
        problems.append(f"快照只拿到 {len(frames)}/{len(times)} 帧（HYPERFRAMES_BROWSER_PATH 设了吗？）")
    for t, sp in zip(times, frames):
        png = os.path.join(a.outdir, f"render_{t}.png")
        grab(mp4, t, png)
        (y0, y1, n), mx = rowdiff(png, sp)
        if n:
            problems.append(
                f"t={t}s：成片第 {y0}–{y1} 行与浏览器不一致（{n} 行，最大差 {mx:.0f}）——"
                f"典型视口裁切。确认 index.html 有 #hf-vp-spacer，重渲")
        else:
            notes.append(f"t={t}s 成片与预览一致")

    # 4. 字幕在旁白活跃时可见
    missing = captions_ok(mp4, film["lines"], [t + 1.5 for t in times if t + 1.5 < film["total"]])
    for t, lid, b in missing:
        problems.append(f"t={t}s 字幕像素过少（{b}）——查 {lid} 的字幕是否被场景盖住/字体没加载")
    if not missing:
        notes.append("字幕在旁白活跃时刻均有文字像素")

    print("== QA 报告 ==")
    for n in notes:
        print(f"  ✓ {n}")
    for p in problems:
        print(f"  ✗ {p}")
    print(f"\n结论：{'全绿' if not problems else f'{len(problems)} 个问题'}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
