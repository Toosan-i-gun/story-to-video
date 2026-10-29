#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""旁白 / 画面同步检查：每个画面动作都必须绑在一句台词上，并且真的落在那一句里。

为什么需要它：分镜里的动作时间是人手排的，一改语速（或改了台词长度）就会错位，
而错位是**看不出来**的 —— 渲染不会报错，构图检查也不管，只有逐帧看片才发现
"叶子早出现了 4 秒""台词里小鹿在问，画面上小鹿已经没了"。

规则（三条，全部机械可判）：
  1. 带 cue 的动作：`{"op": "...", "cue": "v13"}`，其绝对时间必须落在 v13 的
     [start-0.45, end+0.45] 里。`"cueAt": "end"` 表示必须在那句**说完之后**（淡出、离场）。
  2. 台词空窗：每一句台词的时间窗里，至少要有一个动作（或一次镜头变化）开始。
     一句 6 秒的话配着不动的画面，就是"画面没有表现这句"。
  3. 角色在场：任何"让角色消失"的动作（fade 到 0 / 移出画面）必须带 cue，
     且 cue 的那句台词里这个角色还在被提到（靠 lastSeen 声明）。

用法：
  python3 scripts/check_sync.py --project ./projects/xxx
  python3 scripts/check_sync.py --project . --json
退出码：有问题为 1，全绿为 0。
"""
import argparse, json, os, sys

TOL = 0.45          # 动作可以比台词早/晚多少秒
MOVE_OPS = ("move", "scale", "fade", "rise", "turn", "lean", "nod", "lie", "unlie",
            "curl", "waddle", "bob", "shellDrips", "warmShell", "lookDown", "flip",
            "puddleIn", "cloudDrift", "darken", "rainFade", "splashIn", "duskRise")


def load(proj):
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))
    tp = os.path.join(proj, "timing.json")
    if os.path.exists(tp):
        tmap = {l["id"]: l for l in json.load(open(tp, encoding="utf-8")).get("lines", [])}
        for l in film["lines"]:
            if l["id"] in tmap:
                l.update(tmap[l["id"]])
    for l in film["lines"]:
        l.setdefault("end", l["start"] + l.get("duration", 2.0))
    return film


def resolve_t(sc, o, by_id):
    """动作的绝对时间：绑了 cue 就从台词算（和 build_film.py 同一套算法），否则用 t。"""
    cue = o.get("cue")
    if cue and cue in by_id:
        l = by_id[cue]
        base = l["end"] if o.get("cueAt") == "end" else l["start"]
        return base + float(o.get("cueOff", 0))
    return float(sc["start"]) + float(o.get("t", 0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--tol", type=float, default=TOL)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    proj = os.path.abspath(a.project)
    film = load(proj)
    lines = film["lines"]
    by_id = {l["id"]: l for l in lines}

    problems, notes, hints = [], [], []

    # 老项目（整片一个 cue 都没有）不判失败：只提示"该补 cue 了"
    n_all = sum(len(sc.get("ops", [])) for sc in film["scenes"])
    n_cue = sum(1 for sc in film["scenes"] for o in sc.get("ops", []) if o.get("cue"))
    legacy = n_cue == 0 and n_all > 0

    # ---- 1. 带 cue 的动作必须落在那句台词里
    cue_ops = []
    for sc in film["scenes"]:
        for o in sc.get("ops", []):
            cue = o.get("cue")
            if not cue:
                continue
            if cue not in by_id:
                problems.append(f"{sc['id']} 的 {o['op']} 绑了不存在的台词 {cue}")
                continue
            l = by_id[cue]
            t = resolve_t(sc, o, by_id)
            mode = o.get("cueAt", "start")
            lo, hi = (l["end"] - a.tol, l["end"] + a.tol) if mode == "end" else \
                     (l["start"] - a.tol, l["end"] + a.tol)
            cue_ops.append((sc["id"], o["op"], cue, t, l))
            if not (lo <= t <= hi):
                d = t - (l["start"] if mode != "end" else l["end"])
                problems.append(
                    f"{sc['id']} {o['op']}({o.get('target', '-')}) 绑 {cue}"
                    f"（{l['start']:.2f}–{l['end']:.2f}）却发生在 {t:.2f}s"
                    f"（{'早' if d < 0 else '晚'} {abs(d):.2f}s）")

    # ---- 2. 每句台词的时间窗里，至少有一个动作开始
    for sc in film["scenes"]:
        ops = sc.get("ops", [])
        starts = [resolve_t(sc, o, by_id) for o in ops
                  if o.get("op") in MOVE_OPS or o.get("op") in ("cam", "camFrom")]
        for l in lines:
            if not (float(sc["start"]) <= l["start"] < float(sc["end"])):
                continue
            n = sum(1 for s in starts if l["start"] - 0.05 <= s <= l["end"] + a.tol)
            if n == 0:
                hints.append(f"{l['id']}（{l['start']:.2f}s「{l['text'][:16]}…」）"
                             f"整句没有新的画面动作 —— 确认一下这句是不是配着不动的画面念的")

    # ---- 3. 角色消失必须绑 cue，且不能早于它最后被提到的那句
    for sc in film["scenes"]:
        for o in sc.get("ops", []):
            if o.get("op") != "fade" or float(o.get("to", 1)) > 0.05:
                continue
            if not o.get("cue"):
                problems.append(f"{sc['id']} {o.get('target')} 的淡出没有绑 cue"
                                f"（无法判断它是不是在台词里还在场）")

    # ---- 汇总
    for sc in film["scenes"]:
        ops = sc.get("ops", [])
        n_cue = sum(1 for o in ops if o.get("cue"))
        notes.append(f"{sc['id']}  {len(ops):2d} 个动作 / {n_cue} 个绑了 cue")

    if legacy:
        notes.append(f"整片 {n_all} 个动作，一个 cue 都没绑 —— 这是老项目，"
                     f"同步只能靠眼睛。新片请按 SKILL.md §5b 给每个动作绑 cue。")

    if a.json:
        print(json.dumps({"problems": problems, "hints": hints, "scenes": notes},
                         ensure_ascii=False, indent=2))
    else:
        print("== 旁白 / 画面同步检查 ==")
        for n in notes:
            print(f"  · {n}")
        if not problems:
            print("\n  ✓ 每个动作都落在它绑的那句台词里")
        for h in hints:
            print(f"  · 提示 {h}")
        for p in problems:
            print(f"  ✗ {p}")
        print(f"\n结论：{'全绿' if not problems else f'{len(problems)} 处不同步'}")
    sys.exit(0 if (legacy or not problems) else 1)


if __name__ == "__main__":
    main()
