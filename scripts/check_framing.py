#!/usr/bin/env python3
"""构图检查：人物有没有被字幕压住。

原理：film.json 里每场都有镜头关键帧（cam）和角色位移（move/roll/rise/lie/curl），
把它们按时间插值出来，就能算出"任意时刻每个角色在画面上的包围盒"，
再和字幕带（底部 bottom + 行高）求交。不用渲染，0.5 秒跑完全片。

用法：
  python3 check_framing.py --project ./projects/firefly
  python3 check_framing.py --project . --json
退出码：有遮挡为 1，全绿为 0。
"""
import argparse, json, math, os, sys

# 角色在本地坐标（size=1）里的包围盒 [x0, y0, x1, y1]，y 向上为负，锚点在脚底中心。
# 数值对应 templates/kit.js 里各角色的绘制范围，改了角色记得同步这里。
CHAR_BOX = {
    "hedgehog": (-58, -104, 68, 8),
    "squirrel": (-115, -158, 42, 8),
    "mole": (-64, -82, 92, 8),
    "chestnut": (-27, -35, 27, 25),
    "snail": (-56, -62, 56, 6),
    "firefly": (-42, -46, 42, 30),
    # 冬日角色 / 灯
    "badger": (-56, -94, 80, 8),
    "fox": (-70, -138, 68, 8),
    "rabbit": (-32, -122, 34, 8),
    "copperLamp": (-18, -56, 18, 4),
    "hurricaneLamp": (-26, -110, 26, 4),
}

EASE = {
    "none": lambda t: t,
    "linear": lambda t: t,
    "power1.in": lambda t: t * t,
    "power1.out": lambda t: 1 - (1 - t) ** 2,
    "power1.inOut": lambda t: t * t * (3 - 2 * t),
    "power2.in": lambda t: t ** 3,
    "power2.out": lambda t: 1 - (1 - t) ** 3,
    "power2.inOut": lambda t: t ** 3 * (t * (6 * t - 15) + 10),
    "sine.inOut": lambda t: 0.5 - 0.5 * math.cos(math.pi * t),
}


def ease(name, t):
    return EASE.get(name or "power1.inOut", EASE["power1.inOut"])(max(0.0, min(1.0, t)))


def lerp(a, b, k):
    return a + (b - a) * k


def caption_lines(text, limit=21):
    """与 build_film.split_caption 的断行数保持一致。"""
    if len(text) <= limit:
        return 1
    PAUSE = "，。！？；：、…—"
    cands = [i + 1 for i, c in enumerate(text) if c in PAUSE and 5 <= i + 1 <= len(text) - 5]
    return 1 if not cands and len(text) <= limit else 2


def cam_at(ops, t):
    """按顺序播放 cam 关键帧，返回 (scale, fx, fy)。"""
    scale, fx, fy = 1.0, 960.0, 540.0
    started = False
    for o in ops:
        if o.get("op") not in ("cam", "camFrom"):
            continue
        frm = o.get("from")
        if not started:
            if frm:
                scale, fx, fy = frm.get("scale", 1.0), frm["focus"][0], frm["focus"][1]
            started = True
        dur = float(o.get("dur", 5))
        k = ease(o.get("ease"), (t - float(o["t"])) / dur) if dur > 0 else 1.0
        if t < float(o["t"]):
            continue
        scale = lerp(scale, float(o["scale"]), k)
        fx = lerp(fx, float(o["focus"][0]), k)
        fy = lerp(fy, float(o["focus"][1]), k)
    return scale, fx, fy


def char_state_at(ops, cid, t, base):
    """角色的位移/形变状态：x/y 偏移、纵向缩放、上下浮动幅度。"""
    x = y = 0.0
    sx = sy = 1.0
    amp = 0.0
    for o in ops:
        op = o.get("op")
        if o.get("target") != cid:
            continue
        ot = float(o["t"])
        if t < ot:
            continue
        dur = float(o.get("dur", 1))
        k = ease(o.get("ease"), (t - ot) / dur) if dur > 0 else 1.0
        if op in ("move", "roll"):
            x = lerp(x, float(o.get("x", 0)), k)
            y = lerp(y, float(o.get("y", 0)), k)
        elif op == "rise":
            y = lerp(float(o.get("fromY", 52)), 0.0, k)
            sc = lerp(float(o.get("fromScale", 0.9)), 1.0, k)
            sx = sy = sc
        elif op == "lie":
            sy = lerp(sy, float(o.get("scaleY", 0.84)), k)
            y = lerp(y, float(o.get("y", 12)), k)
        elif op == "unlie":
            sy = lerp(sy, 1.0, k)
        elif op == "curl":
            sx = lerp(sx, float(o.get("scaleX", o.get("scale", 0.82))), k)
            sy = lerp(sy, float(o.get("scaleY", o.get("scale", 0.82))), k)
        elif op == "bob":
            amp = max(amp, abs(float(o.get("amp", 6))))
    return x, y, sx, sy, amp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--margin", type=float, default=26, help="角色和字幕带之间至少留多少 px")
    ap.add_argument("--step", type=float, default=0.25)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    proj = os.path.abspath(a.project)
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))
    timing_path = os.path.join(proj, "timing.json")
    lines = [dict(l) for l in film["lines"]]
    if os.path.exists(timing_path):
        tmap = {l["id"]: l for l in json.load(open(timing_path, encoding="utf-8"))["lines"]}
        for l in lines:
            if l["id"] in tmap:
                l.update(tmap[l["id"]])

    cap = film.get("captions", {})
    bottom = float(cap.get("bottom", 88))
    size = float(cap.get("size", 45))
    band_top_max = 1080.0  # 最深的一句（两行）决定字幕带顶

    for l in lines:
        n = caption_lines(l["text"])
        l["band_top"] = 1080 - bottom - n * size * 1.56 - 8

    hits = []
    for sc in film["scenes"]:
        ops = sc.get("ops", [])
        chars = sc.get("characters", [])
        if not chars:
            continue
        t = float(sc["start"])
        while t < float(sc["end"]):
            cam_s, fx, fy = cam_at(ops, t - sc["start"])
            for c in chars:
                cid = c["id"]
                box = CHAR_BOX.get(c["kind"])
                if not box:
                    continue
                if float(c.get("opacity", 1)) < 0.2:
                    continue  # 还没登场 / 已经隐掉的角色不算遮挡
                x, y, sx, sy, amp = char_state_at(ops, cid, t - sc["start"], c)
                sz = float(c.get("size", 1))
                bx0, by0, bx1, by1 = box
                # 场景坐标
                X0 = c["x"] + x + bx0 * sz * sx
                X1 = c["x"] + x + bx1 * sz * sx
                Y0 = c["y"] + y + (by0 * sz) * sy - amp
                Y1 = c["y"] + y + (by1 * sz) * sy
                # 屏幕坐标
                sY1 = 540 + (Y1 - fy) * cam_s
                sY0 = 540 + (Y0 - fy) * cam_s
                sX0 = 960 + (X0 - fx) * cam_s
                sX1 = 960 + (X1 - fx) * cam_s
                if sX1 < 240 or sX0 > 1680:
                    continue  # 完全在画面外，不算遮挡
                if sY0 >= 1080 or sY1 <= 0:
                    continue  # 纵向也在画外（角色整体在画面下方/上方）
                line = next((l for l in lines if l["start"] - 0.2 <= t <= l["end"] + 0.5), None)
                limit = (line["band_top"] if line else 1080 - bottom - size * 1.56)
                if sY1 > limit - a.margin:
                    hits.append({"t": round(t, 2), "scene": sc["id"], "char": cid,
                                 "kind": c["kind"], "line": line["id"] if line else None,
                                 "feet": round(sY1, 1), "band_top": round(limit, 1),
                                 "over": round(sY1 - limit, 1),
                                 "into_margin": round(sY1 - (limit - a.margin), 1)})
            t += a.step

    # 同一句只报最严重的一次
    worst = {}
    for h in hits:
        key = h["line"] or h["scene"]
        if key not in worst or h["over"] > worst[key]["over"]:
            worst[key] = h
    problems = sorted(worst.values(), key=lambda h: -h["over"])
    severe = [h for h in problems if h["over"] > 0]
    mild = [h for h in problems if h["over"] <= 0]

    if a.json:
        print(json.dumps({"problems": problems, "samples": len(hits)}, ensure_ascii=False, indent=2))
    else:
        print("== 构图检查（人物 / 字幕带）==")
        if not problems:
            print("  ✓ 全片没有人物压进字幕带")
        for p in severe:
            print(f"  ✗ {p['line'] or p['scene']} t={p['t']}s {p['char']}({p['kind']}) "
                  f"脚底 y={p['feet']} 已进字幕带 {p['over']}px（带顶 {p['band_top']}）")
        for p in mild:
            print(f"  ⚠ {p['line'] or p['scene']} t={p['t']}s {p['char']}({p['kind']}) "
                  f"脚底 y={p['feet']} 贴到安全线（离字幕带还有 {abs(p['over'])}px）")
        print(f"\n结论：{'全绿' if not severe else f'{len(severe)} 处压字'}"
              + (f"，{len(mild)} 处贴边" if mild else ""))
    sys.exit(1 if severe else 0)


if __name__ == "__main__":
    main()
