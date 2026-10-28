#!/usr/bin/env python3
"""程序化声音底：按"这场戏里有什么"逐层合成，不再用固定预设。

为什么重写：旧版只有 calm/warm/misty 三套预设，每套都带溪水+蟋蟀。
故事里没有河、秋天也没有蟋蟀，但每部片子都在放水声 —— 声音也会套模板。

现在的做法：film.json 里写一份"声音表"（sound.plan），逐场列出这一场听得见什么：

  "sound": {
    "music": {"amp": 0.055, "density": 0.85},          // 八音盒摇篮曲，可关
    "scenes": {
      "s1": [["wind", 0.9], ["leaves", 0.7], ["chestnut", 0.5]],
      "s5": [["roomtone", 0.6], ["rain", 0.8], ["drips", 0.5]]
    }
  }

可用层（名字 → 什么声音 → 什么时候用）：
  wind       秋风：低频噪声 + 慢速阵风          户外，几乎总要有
  leaves     落叶窸窣：高频颗粒                   秋天、树下
  grass      草叶摩擦                             草地
  chestnut   栗子落地的"啪嗒"（木质短促）         有果子掉的故事
  rain       雨：宽频噪声 + 雨点                   下雨
  drips      滴水"嘀嗒"（打在石头/水洼上）        雨后、洞里
  roomtone   洞里/屋里的低频空间感                室内
  straw      干草窸窣（很轻的颗粒）               草垫、窝
  dig        挖土的低闷撞击                       鼹鼠、地洞
  steps      小脚步（很轻的"嗒、嗒"）             角色走动
  stream     溪水（**只在故事里真有水时才用**）
  crickets   蟋蟀（**只在夏夜、故事里真有虫时才用**）
  birds      远处鸟叫（白天户外）

用法：
  python3 make_audio.py --project ./projects/hedgehog
  python3 make_audio.py --project . --mood warm      # 只影响八音盒的写法
  python3 make_audio.py --project . --print-plan     # 打印这一版用了哪些层
"""
import argparse, json, os, zlib

import numpy as np

SR = 48000

# 八音盒的三种写法（只影响旋律，不再决定有没有水声）
MUSIC_MOODS = {
    "calm":  {"bell": 0.055, "pad": 0.030, "bass": 0.055, "walking": False, "sparse": 1.0},
    "warm":  {"bell": 0.062, "pad": 0.036, "bass": 0.060, "walking": True,  "sparse": 0.9},
    "misty": {"bell": 0.040, "pad": 0.024, "bass": 0.045, "walking": False, "sparse": 1.25},
}

# 没写声音表时的兜底：只有风 + 落叶，绝不擅自加水声和虫鸣
DEFAULT_PLAN = {"wind": 0.9, "leaves": 0.5}


def bandpass(x, lo, hi, soft=0.15):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    lo_w = np.clip((f - lo * (1 - soft)) / (lo * soft + 1e-9), 0, 1)
    hi_w = np.clip((hi * (1 + soft) - f) / (hi * soft + 1e-9), 0, 1)
    return np.fft.irfft(X * lo_w * hi_w, len(x))


def smooth_noise(n, rate_hz, rng):
    step = max(int(SR / rate_hz), 2)
    pts = rng.normal(0, 1, n // step + 3)
    pts = np.convolve(pts, np.ones(3) / 3, mode="same")
    return np.interp(np.arange(n), np.arange(len(pts)) * step, pts)


def norm(x):
    return x / (np.abs(x).max() + 1e-9)


def place(buf, sig, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    if i >= buf.shape[1] or i < 0:
        return
    sig = sig[: buf.shape[1] - i] * gain
    buf[0, i:i + len(sig)] += sig * np.cos((pan + 1) * np.pi / 4)
    buf[1, i:i + len(sig)] += sig * np.sin((pan + 1) * np.pi / 4)


def stereo(x, pan=0.0):
    out = np.zeros((2, len(x)))
    out[0] = x * np.cos((pan + 1) * np.pi / 4)
    out[1] = x * np.sin((pan + 1) * np.pi / 4)
    return out


# ============================== 声音层 ==============================
LAYERS = {}


def layer(name):
    def deco(fn):
        LAYERS[name] = fn
        return fn
    return deco


@layer("wind")
def _wind(n, rng, g):
    """秋风：低频呼啸 + 慢阵风。阵风是"一阵一阵"的，不是白噪声。"""
    base = bandpass(rng.normal(0, 1, n), 70, 340)
    base *= 1 + 0.75 * smooth_noise(n, 0.10, rng) + 0.25 * smooth_noise(n, 0.6, rng)
    air = bandpass(rng.normal(0, 1, n), 900, 2600) * 0.06 * (1 + smooth_noise(n, 0.2, rng))
    return stereo(norm(base) * 0.8 + norm(air) * 0.5, pan=rng.uniform(-0.15, 0.15)) * g


@layer("leaves")
def _leaves(n, rng, g):
    """落叶：高频颗粒，一堆细碎的"嚓"。干叶子是脆的，所以颗粒短、密度不均。"""
    body = bandpass(rng.normal(0, 1, n), 1800, 7000) * 0.25
    body *= 1 + 0.9 * smooth_noise(n, 0.35, rng)
    grains = np.zeros(n)
    t = 0.0
    while t < n / SR - 0.1:
        L = int(rng.uniform(0.012, 0.05) * SR)
        env = np.exp(-np.linspace(0, 6, L)) * np.hanning(L)
        f = rng.uniform(2200, 6200)
        tt = np.arange(L) / SR
        grains[int(t * SR):int(t * SR) + L] += np.sin(2 * np.pi * f * tt) * env * rng.uniform(0.3, 1.0)
        t += rng.uniform(0.05, 0.35)
    return stereo(norm(body) * 0.7 + norm(grains) * 0.5, pan=rng.uniform(-0.5, 0.5)) * g


@layer("grass")
def _grass(n, rng, g):
    """草叶摩擦：比落叶更闷、更连续。"""
    x = bandpass(rng.normal(0, 1, n), 900, 3400)
    x *= 1 + 0.8 * smooth_noise(n, 0.5, rng)
    return stereo(norm(x), pan=rng.uniform(-0.3, 0.3)) * g


@layer("chestnut")
def _chestnut(n, rng, g):
    """栗子落地"啪嗒"：木质、短促、带一点壳的空腔。故事里最该听见的声音。"""
    buf = np.zeros((2, n))
    t = rng.uniform(0.5, 2.0)
    while t < n / SR - 0.5:
        L = int(0.18 * SR)
        tt = np.arange(L) / SR
        f0 = rng.uniform(260, 420)
        body = np.sin(2 * np.pi * f0 * tt) * np.exp(-tt * 26)
        body += 0.5 * np.sin(2 * np.pi * f0 * 2.7 * tt) * np.exp(-tt * 42)
        click = rng.normal(0, 1, L) * np.exp(-tt * 260) * 0.5
        sig = (body + click) * np.hanning(L) ** 0.3
        place(buf, sig, t, pan=rng.uniform(-0.7, 0.7), gain=rng.uniform(0.4, 0.9))
        t += rng.uniform(1.1, 3.2) * (1.6 if rng.random() < 0.3 else 1.0)
    return buf * g


@layer("rain")
def _rain(n, rng, g):
    """雨：宽频底噪 + 密集小雨点。"""
    body = bandpass(rng.normal(0, 1, n), 350, 8000)
    body *= 1 + 0.25 * smooth_noise(n, 0.4, rng)
    drops = np.zeros(n)
    t = 0.0
    while t < n / SR - 0.05:
        L = int(rng.uniform(0.006, 0.02) * SR)
        tt = np.arange(L) / SR
        drops[int(t * SR):int(t * SR) + L] += (
            rng.normal(0, 1, L) * np.exp(-tt * 300) * rng.uniform(0.2, 1.0))
        t += rng.uniform(0.004, 0.03)
    return stereo(norm(body) * 0.75 + norm(drops) * 0.45) * g


@layer("drips")
def _drips(n, rng, g):
    """滴水"嘀嗒"：打在石头上的那种，音高快速下坠。"""
    buf = np.zeros((2, n))
    t = rng.uniform(0.3, 1.6)
    while t < n / SR - 0.4:
        L = int(rng.uniform(0.06, 0.12) * SR)
        tt = np.arange(L) / SR
        f0 = rng.uniform(900, 1700)
        sig = np.sin(2 * np.pi * (f0 * np.exp(-tt * 11)) * tt) * np.exp(-tt * 48)
        place(buf, sig, t, pan=rng.uniform(-0.6, 0.6), gain=rng.uniform(0.25, 0.6))
        t += rng.uniform(0.7, 2.4)
    return buf * g


@layer("roomtone")
def _roomtone(n, rng, g):
    """洞里/屋里的空间感：很低的隆隆 + 一点点中频，让"室内"这件事听得出来。"""
    low = bandpass(rng.normal(0, 1, n), 28, 110) * 1.0
    mid = bandpass(rng.normal(0, 1, n), 180, 600) * 0.12
    x = norm(low) * 0.9 + norm(mid) * 0.3
    x *= 1 + 0.2 * smooth_noise(n, 0.08, rng)
    return stereo(x) * g


@layer("straw")
def _straw(n, rng, g):
    """干草：极轻的高频碎响，密度低。"""
    x = bandpass(rng.normal(0, 1, n), 2600, 9000) * 0.15
    grains = np.zeros(n)
    t = 0.0
    while t < n / SR - 0.1:
        L = int(rng.uniform(0.008, 0.03) * SR)
        env = np.exp(-np.linspace(0, 7, L))
        grains[int(t * SR):int(t * SR) + L] += rng.normal(0, 1, L) * env * rng.uniform(0.2, 0.8)
        t += rng.uniform(0.15, 0.9)
    return stereo(norm(x) * 0.5 + norm(grains) * 0.6, pan=rng.uniform(-0.4, 0.4)) * g


@layer("dig")
def _dig(n, rng, g):
    """挖土：低闷的撞击，几下就停。"""
    buf = np.zeros((2, n))
    t = rng.uniform(0.2, 1.2)
    while t < n / SR - 0.5:
        for k in range(rng.integers(2, 5)):
            L = int(0.22 * SR)
            tt = np.arange(L) / SR
            f0 = rng.uniform(55, 95)
            sig = np.sin(2 * np.pi * f0 * tt) * np.exp(-tt * 22)
            sig += rng.normal(0, 1, L) * np.exp(-tt * 90) * 0.35
            place(buf, sig, t + k * rng.uniform(0.16, 0.26), pan=rng.uniform(-0.4, 0.4),
                  gain=rng.uniform(0.5, 1.0))
        t += rng.uniform(2.5, 5.0)
    return buf * g


@layer("snow")
def _snow(n, rng, g):
    """落雪：雪是"吸声"的——不是噼里啪啦，而是把世界压下去的一层很细的高频空气声，
    偶尔才有一点点雪落下来的"沙"。故事里有雪才用。"""
    air = bandpass(rng.normal(0, 1, n), 2200, 7200) * 0.5
    air *= 1 + 0.5 * smooth_noise(n, 0.06, rng) + 0.15 * smooth_noise(n, 0.9, rng)
    x = norm(air) * 0.55
    # 雪粒：很稀疏、很轻的沙沙
    grains = np.zeros(n)
    t = rng.uniform(0.3, 2.0)
    while t < n / SR - 0.1:
        L = int(rng.uniform(0.02, 0.07) * SR)
        env = np.exp(-np.linspace(0, 6, L))
        grains[int(t * SR):int(t * SR) + L] += bandpass(rng.normal(0, 1, L), 1500, 5000) * env * rng.uniform(0.15, 0.5)
        t += rng.uniform(0.8, 3.2)
    return stereo(x + norm(grains) * 0.35, pan=rng.uniform(-0.2, 0.2)) * g


@layer("flame")
def _flame(n, rng, g):
    """灯火的"呼"：一段低频的轻微起伏 + 偶尔一声很轻的噼啪（灯芯上的水汽）。"""
    body = bandpass(rng.normal(0, 1, n), 90, 520) * 0.6
    body *= 1 + 0.55 * smooth_noise(n, 0.7, rng) + 0.2 * smooth_noise(n, 4.5, rng)
    x = norm(body) * 0.7
    pops = np.zeros(n)
    t = rng.uniform(0.5, 2.5)
    while t < n / SR - 0.05:
        L = int(rng.uniform(0.004, 0.016) * SR)
        env = np.exp(-np.linspace(0, 9, L))
        pops[int(t * SR):int(t * SR) + L] += rng.normal(0, 1, L) * env * rng.uniform(0.1, 0.45)
        t += rng.uniform(1.2, 4.5)
    return stereo(x + norm(pops) * 0.3, pan=rng.uniform(-0.1, 0.1)) * g


@layer("steps")
def _steps(n, rng, g):
    """小脚步：很轻的"嗒、嗒"，一串一串。"""
    buf = np.zeros((2, n))
    t = rng.uniform(0.4, 1.5)
    while t < n / SR - 1.0:
        for k in range(rng.integers(3, 7)):
            L = int(0.07 * SR)
            tt = np.arange(L) / SR
            sig = (np.sin(2 * np.pi * rng.uniform(150, 230) * tt) * np.exp(-tt * 60)
                   + rng.normal(0, 1, L) * np.exp(-tt * 150) * 0.3)
            place(buf, sig, t + k * rng.uniform(0.28, 0.36), pan=rng.uniform(-0.35, 0.35),
                  gain=rng.uniform(0.25, 0.5))
        t += rng.uniform(4.0, 7.0)
    return buf * g


@layer("stream")
def _stream(n, rng, g):
    """溪水 —— 只有故事里真有水才用。"""
    flow = 1 + 0.35 * smooth_noise(n, 0.7, rng) + 0.12 * smooth_noise(n, 5.0, rng)
    x = bandpass(rng.normal(0, 1, n), 380, 2600) * flow * 0.5
    x += bandpass(rng.normal(0, 1, n), 140, 380) * flow * 0.55
    x += bandpass(rng.normal(0, 1, n), 2600, 7000) * flow * 0.16
    return stereo(norm(x)) * g


@layer("crickets")
def _crickets(n, rng, g):
    """蟋蟀 —— 只有夏夜、故事里真有虫才用。"""
    buf = np.zeros((2, n))
    for c in range(6):
        period, f, pan, t0 = (rng.uniform(0.62, 0.95), rng.uniform(4000, 5200),
                              rng.uniform(-0.85, 0.85), rng.uniform(0, 3))
        while t0 < n / SR - 2:
            for k in range(3):
                tt = np.arange(int(0.028 * SR)) / SR
                place(buf, np.sin(2 * np.pi * f * tt) * np.hanning(len(tt)) ** 1.5,
                      t0 + k * 0.052, pan=pan, gain=1.0)
            t0 += period * rng.uniform(0.94, 1.06)
    return buf * g


@layer("birds")
def _birds(n, rng, g):
    """远处的鸟：白天的户外，偶尔两声。"""
    buf = np.zeros((2, n))
    t = rng.uniform(1.0, 3.0)
    while t < n / SR - 1.0:
        f = rng.uniform(2200, 3600)
        for k in range(rng.integers(2, 4)):
            L = int(0.09 * SR)
            tt = np.arange(L) / SR
            sig = np.sin(2 * np.pi * (f * (1 + 0.12 * np.sin(2 * np.pi * 28 * tt))) * tt)
            sig *= np.hanning(L) ** 1.5
            place(buf, sig, t + k * 0.13, pan=rng.uniform(-0.8, 0.8), gain=rng.uniform(0.15, 0.4))
        t += rng.uniform(3.0, 7.0)
    return buf * g


# ============================== 八音盒 ==============================
def env_adsr(n, a, d, s_level, r):
    a_n, d_n, r_n = int(a * SR), int(d * SR), int(r * SR)
    sus = max(n - a_n - d_n - r_n, 0)
    out = np.concatenate([
        np.linspace(0, 1, a_n, endpoint=False) ** 1.5,
        np.linspace(1, s_level, d_n, endpoint=False),
        np.full(sus, s_level),
        np.linspace(s_level, 0, r_n) ** 1.4,
    ])
    return out[:n] if len(out) >= n else np.pad(out, (0, n - len(out)))


def bell(freq, dur, amp, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 2.6) * (1 - np.exp(-t * 260))
    s = (np.sin(2 * np.pi * freq * t)
         + 0.30 * bright * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t * 4.5)
         + 0.12 * bright * np.sin(2 * np.pi * freq * 3.02 * t) * np.exp(-t * 6.5)
         + 0.05 * bright * np.sin(2 * np.pi * freq * 4.07 * t) * np.exp(-t * 9))
    return s * env * amp


def pad(freqs, dur, amp, rng):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        s += np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28))
        s += 0.5 * np.sin(2 * np.pi * f * 2 * t + rng.uniform(0, 6.28))
    return (s / len(freqs)) * env_adsr(n, 1.6, 0.6, 0.72, 2.4) * amp


PC = {"C": 0, "C#": 1, "D": 2, "E": 4, "F#": 6, "G": 7, "A": 9, "B": 11}


def nf(name):
    pc, octv = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((PC[pc] + (octv - 4) * 12 - 9) / 12)


PROG = [("D2", ["D3", "F#3", "A3"]), ("A2", ["C#3", "E3", "A3"]),
        ("B2", ["D3", "F#3", "B3"]), ("G2", ["D3", "G3", "B3"]),
        ("D2", ["D3", "A3", "F#3"]), ("A2", ["C#3", "E3", "A3"]),
        ("G2", ["B2", "D3", "G3"]), ("A2", ["C#3", "E3", "A3"])]
LINE_A = [(2, 0.0, "A4", 0.55), (2, 2.5, "F#4", 0.42), (3, 1.0, "E4", 0.40),
          (4, 0.0, "D4", 0.58), (4, 2.0, "F#4", 0.38), (4, 3.0, "A4", 0.34),
          (5, 1.5, "B4", 0.42), (6, 0.0, "A4", 0.50), (6, 2.5, "F#4", 0.36),
          (7, 1.0, "E4", 0.36), (7, 3.0, "D4", 0.40), (8, 0.0, "D4", 0.52)]
LINE_B = [(2, 0.0, "A4", 0.55), (3, 1.0, "B4", 0.40), (4, 0.0, "A4", 0.50),
          (4, 2.5, "F#4", 0.34), (5, 1.5, "E4", 0.36), (6, 0.0, "D4", 0.52)]
LINE_C = [(1, 1.0, "F#4", 0.40), (2, 0.0, "A4", 0.52), (2, 2.5, "B4", 0.34),
          (3, 1.0, "A4", 0.40), (4, 0.0, "F#4", 0.36), (5, 2.0, "E4", 0.34),
          (6, 0.0, "D4", 0.50)]


def music_box(total, rng, mood="warm", amp=1.0, density=1.0):
    cfg = MUSIC_MOODS[mood]
    n = int(total * SR)
    out = np.zeros((2, n), dtype=np.float32)
    BAR = 4.0
    melody = list(LINE_A)
    for off, line, k in [(8, LINE_B, 0.62), (16, LINE_C, 0.66), (24, LINE_B, 0.60), (30, LINE_A, 0.56)]:
        melody += [(b + off, t, nm, g * k) for b, t, nm, g in line]
    if density < 1.0:
        melody = [m for i, m in enumerate(melody) if i % 2 == 0 or rng.random() < density]
    for bar in range(int(np.ceil(total / BAR))):
        t0 = bar * BAR
        root, chord = PROG[bar % 8]
        level = 0.30 if (bar % 16) >= 14 else 1.0
        place(out, pad([nf(root)], BAR * 1.15, cfg["pad"] * level * amp, rng), t0)
        place(out, pad([nf(c) for c in chord], BAR * 1.1, cfg["pad"] * 0.55 * level * amp, rng), t0, pan=-0.15)
        if bar >= 2:
            place(out, bell(nf(root) * 2, 2.6, cfg["bass"] * level * amp), t0, pan=0.1)
        if cfg["walking"] and 4 <= (bar % 16) <= 11:
            for b in range(4):
                place(out, bell(nf(root) * 4, 0.7, 0.020 * amp), t0 + b, pan=-0.3)
    for bar, beat, name, gain in melody:
        t0 = bar * BAR + beat
        if t0 >= total - 3:
            continue
        place(out, bell(nf(name), 3.4, gain * cfg["bell"] * 0.9 * amp), t0, pan=0.25)
        place(out, bell(nf(name) * 2, 2.0, gain * cfg["bell"] * 0.25 * amp), t0 + 0.01, pan=-0.35)
    return out


# ============================== 组装 ==============================
def parse_item(it):
    if isinstance(it, dict):
        return it["layer"], float(it.get("gain", 1.0))
    if isinstance(it, (list, tuple)):
        return str(it[0]), float(it[1]) if len(it) > 1 else 1.0
    return str(it), 1.0


def fade_edges(seg, fin=0.9, fout=1.2):
    n = seg.shape[1]
    a, b = min(int(fin * SR), n // 3), min(int(fout * SR), n // 3)
    if a > 0:
        seg[:, :a] *= np.linspace(0, 1, a) ** 1.5
    if b > 0:
        seg[:, -b:] *= np.linspace(1, 0, b) ** 1.5
    return seg


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--mood", default=None, choices=list(MUSIC_MOODS), help="只影响八音盒写法")
    ap.add_argument("--seed", type=int, default=20261028)
    ap.add_argument("--peak", type=float, default=0.70, help="归一化峰值")
    ap.add_argument("--no-music", action="store_true")
    ap.add_argument("--print-plan", action="store_true")
    a = ap.parse_args()

    proj = os.path.abspath(a.project)
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))
    total = float(film["total"])
    sound = film.get("sound", {})
    plan = sound.get("scenes") or {}
    mood = a.mood or sound.get("music", {}).get("mood") or film.get("mood", "warm")
    N = int(total * SR)
    rng = np.random.default_rng(a.seed % (2 ** 32))

    bed = np.zeros((2, N), dtype=np.float32)
    used = {}

    # 1) 逐场铺环境声：每场只出这一场该有的声音
    for sc in film["scenes"]:
        items = plan.get(sc["id"])
        if items is None:
            items = [[k, v] for k, v in DEFAULT_PLAN.items()]
        i0, i1 = int(round(sc["start"] * SR)), min(int(round(sc["end"] * SR)), N)
        n = i1 - i0
        if n <= 0:
            continue
        for it in items:
            name, gain = parse_item(it)
            fn = LAYERS.get(name)
            if not fn:
                print(f"  ! 未知声音层 {name}（{sc['id']}），跳过")
                continue
            seed_i = (a.seed + zlib.crc32((sc["id"] + name).encode())) % (2 ** 32)
            seg = fn(n, np.random.default_rng(seed_i), gain).astype(np.float32)
            bed[:, i0:i1] += fade_edges(seg).astype(np.float32)
            used.setdefault(name, []).append(sc["id"])

    # 2) 八音盒（可逐场调音量：雨声大的那场把音乐退下去）
    if not a.no_music:
        m = sound.get("music", {})
        if m.get("amp", 0.055) > 0:
            mus = music_box(total, rng, mood, m.get("amp", 0.055) / 0.055, m.get("density", 1.0))
            per = m.get("scenes") or {}
            if per:
                env = np.ones(N, dtype=np.float32)
                for sc in film["scenes"]:
                    g = float(per.get(sc["id"], 1.0))
                    i0, i1 = int(round(sc["start"] * SR)), min(int(round(sc["end"] * SR)), N)
                    seg = np.full(max(i1 - i0, 0), g)
                    f = min(int(1.5 * SR), (i1 - i0) // 3)
                    if f > 0:
                        seg[:f] *= np.linspace(0, 1, f)
                        seg[-f:] *= np.linspace(1, 0, f)
                    env[i0:i1] = seg
                mus *= env
            bed += mus
            used.setdefault("music_box", []).append("全片" + ("（逐场调过）" if per else ""))

    # 3) 出入淡 + 归一
    fi, fo = int(2.5 * SR), int(7.0 * SR)
    bed[:, :fi] *= np.linspace(0, 1, fi) ** 1.2
    bed[:, -fo:] *= np.linspace(1, 0, fo) ** 1.6
    bed = bed / (np.abs(bed).max() + 1e-9) * a.peak

    out = os.path.join(proj, "assets", "audio", "bed.wav")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    write_wav(out, bed, SR)

    print(f"bed.wav · {total:.1f}s · 八音盒 {mood} · 峰值 {a.peak:.2f}（{20 * np.log10(a.peak):.1f} dBFS）")
    for k, v in used.items():
        print(f"  {k:<10} {'、'.join(v)}")
    if a.print_plan:
        print(json.dumps(plan, ensure_ascii=False, indent=1))
    print("提示：底轨压在旁白下约 12dB；混完实测整体响度应落在 -16～-14 LUFS，"
          "不在就调 index.html 里 bed 的 data-volume（每 ±0.04 ≈ ±1dB）。")


def write_wav(path, data, sr):
    """写 16bit wav。有些 libsndfile 构建连 WAV 编码器都没带，直接用标准库写。"""
    import wave
    x = np.clip(np.asarray(data).T, -1.0, 1.0)
    pcm = (x * 32767.0).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(pcm.shape[1])
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    main()
