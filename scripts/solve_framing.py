#!/usr/bin/env python3
"""迭代求解 film.json 里 cam 关键帧的 focus.y，使角色脚底屏幕位置 ≤ 目标线。

复用 check_framing.py 的插值函数，保证"求解"和"检查"是同一套几何。
用法：python3 solve_framing.py <project_dir> [--target 780] [--iters 8]
"""
import argparse, importlib.util, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("cf", os.path.join(HERE, "check_framing.py"))
cf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cf)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("project")
    ap.add_argument("--target", type=float, default=780.0)
    ap.add_argument("--iters", type=int, default=8)
    ap.add_argument("--step", type=float, default=0.25)
    a = ap.parse_args()

    path = os.path.join(os.path.abspath(a.project), "film.json")
    film = json.load(open(path, encoding="utf-8"))

    for it in range(a.iters):
        worst = 0.0
        fixes = {}   # (scene_id, cam_index) -> 需要的 focus.y 增量（世界坐标）
        for sc in film["scenes"]:
            cams = [o for o in sc["ops"] if o.get("op") == "cam"]
            if not cams or not sc.get("characters"):
                continue
            t = float(sc["start"])
            while t < float(sc["end"]):
                lt = t - float(sc["start"])
                cam_s, fx, fy = cf.cam_at(sc["ops"], lt)
                # 找到此刻生效的 cam 关键帧
                active = max((i for i, o in enumerate(cams) if lt >= float(o["t"])),
                             default=0)
                for c in sc["characters"]:
                    box = cf.CHAR_BOX.get(c["kind"])
                    if not box:
                        continue
                    x, y, sx, sy, amp = cf.char_state_at(sc["ops"], c["id"], lt, c)
                    sz = float(c.get("size", 1))
                    X0 = c["x"] + x + box[0] * sz * sx
                    X1 = c["x"] + x + box[2] * sz * sx
                    Y0 = c["y"] + y + (box[1] * sz) * sy - amp
                    Y1 = c["y"] + y + (box[3] * sz) * sy
                    sY1 = 540 + (Y1 - fy) * cam_s
                    sY0 = 540 + (Y0 - fy) * cam_s
                    sX0 = 960 + (X0 - fx) * cam_s
                    sX1 = 960 + (X1 - fx) * cam_s
                    if sX1 < 240 or sX0 > 1680 or sY0 >= 1080 or sY1 <= 0:
                        continue
                    # 角色正在出场/入场（可见部分不足一半）时不追：那是设计，
                    # 强行把镜头压下去会把焦点推到画布外
                    visible = min(sY1, 1080.0) - max(sY0, 0.0)
                    if visible < 0.5 * (sY1 - sY0):
                        continue
                    over = sY1 - a.target
                    if over > worst:
                        worst = over
                    if over > 0:
                        key = (sc["id"], active)
                        need = over / cam_s
                        fixes[key] = max(fixes.get(key, 0.0), need)
                t += a.step
        print(f"iter {it}: 最大越线 {worst:.1f}px，待调 {len(fixes)} 个关键帧")
        if not fixes:
            break
        for (sid, idx), need in fixes.items():
            sc = next(s for s in film["scenes"] if s["id"] == sid)
            cams = [o for o in sc["ops"] if o.get("op") == "cam"]
            o = cams[idx]
            o["focus"][1] = round(o["focus"][1] + need, 1)
            if idx == 0:
                o["from"] = {"scale": float(o["scale"]), "focus": list(o["focus"])}

    json.dump(film, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("已写回", path)
    return 0 if worst <= 0 else 1


if __name__ == "__main__":
    sys.exit(main())
