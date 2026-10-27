#!/usr/bin/env python3
"""程序化声音底：溪水/虫鸣/风 + 八音盒摇篮曲，全部合成，响度可量化。

情绪预设（--mood）：
  calm   溪水+蟋蟀+风，D 大调五声音阶，60 BPM，稀疏   （夜/河/睡前，默认）
  warm   同上，旋律厚一点，加 walking pulse            （温暖/陪伴段）
  misty  水声更近，旋律更稀，整体再低 2 dB             （迷路/寻找段）

用法：
  python3 make_audio.py --project ./projects/firefly --mood calm
"""
import argparse, json, os

import numpy as np
import soundfile as sf

SR = 48000

PRESETS = {
    "calm": {"stream": 0.30, "crickets": 0.011, "wind": 0.10, "bell": 0.055,
             "pad": 0.030, "bass": 0.055, "walking": False, "gain": 0.72},
    "warm": {"stream": 0.26, "crickets": 0.008, "wind": 0.08, "bell": 0.062,
             "pad": 0.036, "bass": 0.060, "walking": True, "gain": 0.72},
    "misty": {"stream": 0.36, "crickets": 0.006, "wind": 0.13, "bell": 0.040,
              "pad": 0.024, "bass": 0.045, "walking": False, "gain": 0.60},
}


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


def place(buf, sig, at, pan=0.0, gain=1.0):
    i = int(at * SR)
    if i >= len(buf[0]):
        return
    sig = sig[: len(buf[0]) - i] * gain
    buf[0, i:i + len(sig)] += sig * np.cos((pan + 1) * np.pi / 4)
    buf[1, i:i + len(sig)] += sig * np.sin((pan + 1) * np.pi / 4)


def bell(freq, dur, amp, bright=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    env = np.exp(-t * 2.6) * (1 - np.exp(-t * 260))
    s = (np.sin(2 * np.pi * freq * t)
         + 0.30 * bright * np.sin(2 * np.pi * freq * 2.01 * t) * np.exp(-t * 4.5)
         + 0.12 * bright * np.sin(2 * np.pi * freq * 3.02 * t) * np.exp(-t * 6.5)
         + 0.05 * bright * np.sin(2 * np.pi * freq * 4.07 * t) * np.exp(-t * 9))
    return s * env * amp


def pad(freqs, dur, amp):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = np.zeros(n)
    for f in freqs:
        s += np.sin(2 * np.pi * f * t + np.random.uniform(0, 6.28))
        s += 0.5 * np.sin(2 * np.pi * f * 2 * t + np.random.uniform(0, 6.28))
    return (s / len(freqs)) * env_adsr(n, 1.6, 0.6, 0.72, 2.4) * amp


PC = {"C": 0, "C#": 1, "D": 2, "E": 4, "F#": 6, "G": 7, "A": 9, "B": 11}


def nf(name):
    pc, octv = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((PC[pc] + (octv - 4) * 12 - 9) / 12)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--mood", default="calm", choices=list(PRESETS))
    ap.add_argument("--seed", type=int, default=20261026)
    a = ap.parse_args()

    proj = os.path.abspath(a.project)
    total = float(json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))["total"])
    cfg = PRESETS[a.mood]
    os.makedirs(os.path.join(proj, "assets", "audio"), exist_ok=True)
    np.random.seed(a.seed % (2 ** 32))
    rng = np.random.default_rng(a.seed % (2 ** 32))

    N = int(total * SR)
    bed = np.zeros((2, N))

    # ---- 溪水 + 滴水
    stream = np.zeros(N)
    flow = 1 + 0.35 * smooth_noise(N, 0.7, rng) + 0.12 * smooth_noise(N, 5.0, rng)
    stream += bandpass(rng.normal(0, 1, N), 380, 2600) * flow * 0.5
    stream += bandpass(rng.normal(0, 1, N), 140, 380) * flow * 0.55
    stream += bandpass(rng.normal(0, 1, N), 2600, 7000) * flow * 0.16
    stream *= 0.82 + 0.18 * np.sin(np.linspace(0, 6.1 * np.pi, N))
    stream /= np.abs(stream).max() + 1e-9
    bed[0] += stream * cfg["stream"] * 0.62
    bed[1] += stream * cfg["stream"] * 0.58

    sfx = np.zeros((2, N))
    for _ in range(int(total / 6)):
        at = rng.uniform(0.5, total - 2)
        t = np.arange(int(rng.uniform(0.05, 0.11) * SR)) / SR
        f0 = rng.uniform(760, 1500)
        place(sfx, np.sin(2 * np.pi * (f0 * np.exp(-t * 9)) * t) * np.exp(-t * 55),
              at, pan=rng.uniform(-0.7, 0.7), gain=rng.uniform(0.006, 0.016))
    bed += sfx

    # ---- 蟋蟀
    cric = np.zeros((2, N))
    for c in range(7):
        period, f, pan, t0 = rng.uniform(0.62, 0.95), rng.uniform(4000, 5200), rng.uniform(-0.85, 0.85), rng.uniform(0, 3)
        while t0 < total - 2:
            for k in range(3):
                tt = np.arange(int(0.028 * SR)) / SR
                place(cric, np.sin(2 * np.pi * f * tt) * np.hanning(len(tt)) ** 1.5,
                      t0 + k * 0.052, pan=pan, gain=cfg["crickets"])
            t0 += period * rng.uniform(0.94, 1.06)
    bed += cric

    # ---- 风
    wind = bandpass(rng.normal(0, 1, N), 70, 320)
    wind *= 1 + 0.6 * smooth_noise(N, 0.12, rng)
    wind /= np.abs(wind).max() + 1e-9
    bed[0] += wind * cfg["wind"] * 0.7
    bed[1] += wind * cfg["wind"] * 0.66

    # ---- 八音盒摇篮曲：D 大调五声音阶，八小节循环，60 BPM，一和弦一小节
    music = np.zeros((2, N))
    PROG = [("D2", ["D3", "F#3", "A3"]), ("A2", ["C#3", "E3", "A3"]),
            ("B2", ["D3", "F#3", "B3"]), ("G2", ["D3", "G3", "B3"]),
            ("D2", ["D3", "A3", "F#3"]), ("A2", ["C#3", "E3", "A3"]),
            ("G2", ["B2", "D3", "G3"]), ("A2", ["C#3", "E3", "A3"])]
    BAR = 4.0
    LINE_A = [(2, 0.0, "A4", 0.55), (2, 2.5, "F#4", 0.42), (3, 1.0, "E4", 0.40),
              (4, 0.0, "D4", 0.58), (4, 2.0, "F#4", 0.38), (4, 3.0, "A4", 0.34),
              (5, 1.5, "B4", 0.42), (6, 0.0, "A4", 0.50), (6, 2.5, "F#4", 0.36),
              (7, 1.0, "E4", 0.36), (7, 3.0, "D4", 0.40), (8, 0.0, "D4", 0.52)]
    LINE_B = [(2, 0.0, "A4", 0.55), (3, 1.0, "B4", 0.40), (4, 0.0, "A4", 0.50),
              (4, 2.5, "F#4", 0.34), (5, 1.5, "E4", 0.36), (6, 0.0, "D4", 0.52)]
    LINE_C = [(1, 1.0, "F#4", 0.40), (2, 0.0, "A4", 0.52), (2, 2.5, "B4", 0.34),
              (3, 1.0, "A4", 0.40), (4, 0.0, "F#4", 0.36), (5, 2.0, "E4", 0.34),
              (6, 0.0, "D4", 0.50)]
    melody = list(LINE_A)
    for off, line, k in [(8, LINE_B, 0.62), (16, LINE_C, 0.66), (24, LINE_B, 0.60), (30, LINE_A, 0.56)]:
        melody += [(b + off, t, n, g * k) for b, t, n, g in line]

    bars = int(np.ceil(total / BAR))
    for bar in range(bars):
        t0 = bar * BAR
        root, chord = PROG[bar % 8]
        # 每循环的后半段退到 30%，让故事有呼吸（第 7、8 小节）
        level = 0.30 if (bar % 16) >= 14 else 1.0
        place(music, pad([nf(root)], BAR * 1.15, cfg["pad"] * level), t0)
        place(music, pad([nf(c) for c in chord], BAR * 1.1, cfg["pad"] * 0.55 * level), t0, pan=-0.15)
        if bar >= 2:
            place(music, bell(nf(root) * 2, 2.6, cfg["bass"] * level), t0, pan=0.1)
        if cfg["walking"] and 4 <= (bar % 16) <= 11:
            for b in range(4):
                place(music, bell(nf(root) * 4, 0.7, 0.020), t0 + b, pan=-0.3)

    for bar, beat, name, gain in melody:
        t0 = bar * BAR + beat
        if t0 >= total - 3:
            continue
        place(music, bell(nf(name), 3.4, gain * cfg["bell"] * 0.9), t0, pan=0.25)
        place(music, bell(nf(name) * 2, 2.0, gain * cfg["bell"] * 0.25), t0 + 0.01, pan=-0.35)

    bed += music

    # ---- 出入淡 + 归一
    fi, fo = int(3.0 * SR), int(7.0 * SR)
    bed[:, :fi] *= np.linspace(0, 1, fi) ** 1.2
    bed[:, -fo:] *= np.linspace(1, 0, fo) ** 1.6
    peak = np.abs(bed).max()
    bed = bed / peak * cfg["gain"]

    out = os.path.join(proj, "assets", "audio", "bed.wav")
    sf.write(out, bed, SR, subtype="PCM_16")
    print(f"bed.wav · {total}s · 预设 {a.mood} · 峰值 {cfg['gain']:.2f}（{20 * np.log10(cfg['gain']):.1f} dBFS）")
    print("提示：底轨压在旁白下约 12dB；混完实测整体响度应落在 -16～-14 LUFS，"
          "不在就调 index.html 里 bed 的 data-volume（每 ±0.04 ≈ ±1dB）。")


if __name__ == "__main__":
    main()
