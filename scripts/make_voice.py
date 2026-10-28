#!/usr/bin/env python3
"""逐句配音（easyVoice / Edge-TTS），并**逐句配速对齐 film.json 的目标时长**。

这样换声音不用重排画面：时长 ∝ 1/(1+语速%)，先试一轮测出自然语速，
再逐句微调（夹在 CLAMP 内），把偏差压进 TOLERANCE。

用法：
  python3 make_voice.py --project ./projects/firefly
  python3 make_voice.py --project . --voice zh-CN-XiaoyiNeural --fallback-tts
前提：easyVoice 服务已起（--api），或 --fallback-tts 用系统离线 TTS
（macOS say / Windows SAPI / Linux espeak-ng）。
"""
import argparse, json, os, shutil, subprocess, sys, tempfile, urllib.request

ROOT_HINT = "把项目目录传进来：--project ./projects/firefly"


def synth_edge(api, text, voice, rate, pitch, out):
    body = json.dumps({"text": text, "voice": voice, "rate": f"{rate:+.0f}%",
                       "pitch": pitch, "volume": "+0%", "useLLM": False},
                      ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(api, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    if len(data) < 2000:
        raise RuntimeError(f"返回过小（{len(data)}B）：{text[:18]}")
    open(out, "wb").write(data)


def synth_offline(text, out, rate_wpm):
    """离线兜底 TTS（跨平台）：macOS say / Windows SAPI / Linux espeak-ng。

    产出的音频容器可能是 AIFF/WAV，但 process() 用 ffmpeg 按内容识别，
    扩展名不影响后续处理。
    """
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from platform_lib import is_macos, is_windows

    if is_macos():
        subprocess.run(["say", "-v", "Tingting", "-r", str(rate_wpm), "-o", out, text],
                       check=True)
        return

    if is_windows():
        txt = out + ".txt"
        wav = out + ".wav"
        open(txt, "w", encoding="utf-8-sig").write(text)
        rate = max(-10, min(10, int((rate_wpm - 150) / 15)))   # SAPI: -10..10
        ps = (
            "Add-Type -AssemblyName System.Speech;"
            "$s=New-Object System.Speech.Synthesis.SpeechSynthesizer;"
            "$zh=$s.GetInstalledVoices()|Where-Object{$_.VoiceInfo.Culture.Name -like 'zh*'}"
            "|Select-Object -First 1;"
            "if($zh){$s.SelectVoice($zh.VoiceInfo.Name)};"
            f"$s.Rate={rate};"
            f"$s.SetOutputToWaveFile('{wav}');"
            f"$s.Speak([IO.File]::ReadAllText('{txt}',[Text.Encoding]::UTF8));"
            "$s.Dispose()"
        )
        subprocess.run(["powershell", "-NoProfile", "-NonInteractive", "-Command", ps],
                       check=True)
        os.replace(wav, out)
        os.remove(txt)
        return

    for exe, lang in (("espeak-ng", "cmn"), ("espeak", "zh")):
        if shutil.which(exe):
            subprocess.run([exe, "-v", lang, "-s", str(rate_wpm), "-w", out, text], check=True)
            return
    raise RuntimeError("没有可用的离线 TTS：Linux 装 espeak-ng，或改用 easyVoice 服务")


def process(src, dst):
    """去低频 + 轻压缩 + 一点点房间 + 归一到 -18 LUFS。"""
    af = ("highpass=f=80,lowpass=f=11000,"
          "acompressor=threshold=-19dB:ratio=2.2:attack=14:release=240,"
          "aecho=0.5:0.18:34:0.09,"
          "loudnorm=I=-18:TP=-1.5:LRA=9,aresample=48000")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", src, "-ac", "1", "-af", af,
                    "-c:a", "pcm_s16le", dst], check=True)


def dur_of(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "csv=p=0", path], capture_output=True, text=True, check=True)
    return float(out.stdout.strip())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True)
    ap.add_argument("--api", default="http://localhost:3000/api/v1/tts/createStream")
    ap.add_argument("--voice", default="zh-CN-XiaoxiaoNeural",
                    help="暖声女声；XiaoyiNeural 偏活泼，XiaoshuangNeural 是童声")
    ap.add_argument("--pitch", default="+0Hz")
    ap.add_argument("--base-rate", type=float, default=-10.0)
    ap.add_argument("--clamp", default="-26,6")
    ap.add_argument("--tolerance", type=float, default=0.22)
    ap.add_argument("--fallback-tts", "--fallback-say", dest="fallback_tts",
                    action="store_true",
                    help="easyVoice 不可用时退回系统离线 TTS（macOS say / Windows SAPI / espeak-ng）")
    a = ap.parse_args()

    proj = os.path.abspath(a.project)
    vdir = os.path.join(proj, "assets", "voice")
    os.makedirs(vdir, exist_ok=True)
    film = json.load(open(os.path.join(proj, "film.json"), encoding="utf-8"))
    lines = film["lines"]
    lo, hi = [float(x) for x in a.clamp.split(",")]

    def targets():
        t = {}
        tp = os.path.join(proj, "voice_timing.json")
        if os.path.exists(tp):
            for x in json.load(open(tp, encoding="utf-8")):
                t[x["id"]] = x["duration"]
        for l in lines:
            t.setdefault(l["id"], l.get("duration") or round(len(l["text"]) / 3.9, 2))
        return t

    old = targets()
    tmp = os.path.join(tempfile.gettempdir(), "story-to-video-voice")
    os.makedirs(tmp, exist_ok=True)

    use_edge = True
    try:
        probe = os.path.join(tempfile.gettempdir(), f"{os.path.basename(proj)}_probe.mp3")
        synth_edge(a.api, "测试一下声音是否可用。", a.voice, a.base_rate, a.pitch, probe)
        if os.path.getsize(probe) < 1500:
            raise RuntimeError("探测音频过小")
    except Exception as e:
        use_edge = False
        if not a.fallback_tts:
            sys.exit(f"easyVoice 不可用（{e}）。先起服务：vendor/easyVoice/packages/backend "
                     f"`PORT=3000 npx tsx src/server.ts`，或加 --fallback-tts 用系统离线 TTS")

    print(f"pass 1 @{a.base_rate:+.0f}%  探测自然语速")
    probe = {}
    for l in lines:
        raw = os.path.join(tmp, f"{l['id']}.mp3")
        if use_edge:
            synth_edge(a.api, l["text"], a.voice, a.base_rate, a.pitch, raw)
        else:
            synth_offline(l["text"], raw, 152)
        probe[l["id"]] = dur_of(raw)
    tot_new, tot_old = sum(probe.values()), sum(old.values())
    print(f"  自然语速合计 {tot_new:.1f}s / 目标 {tot_old:.1f}s（{tot_new / tot_old:.3f}x）")

    results = []
    for l in lines:
        lid = l["id"]
        target = old[lid]
        need = 100.0 * (probe[lid] * (1 + a.base_rate / 100.0) / target - 1)
        rate = max(lo, min(hi, need))
        raw = os.path.join(tmp, f"{lid}.mp3")
        wav = os.path.join(vdir, f"{lid}.wav")
        best = None
        for _ in range(3):
            if use_edge:
                synth_edge(a.api, l["text"], a.voice, rate, a.pitch, raw)
            else:
                synth_offline(l["text"], raw, 152)
            process(raw, wav)
            d = dur_of(wav)
            err = d - target
            if best is None or abs(err) < abs(best[2]):
                best = (rate, d, err)
            if abs(err) <= a.tolerance:
                break
            rate = max(lo, min(hi, rate - 100.0 * err / max(d, 0.5)))
        rate, d, err = best
        if abs(err) > a.tolerance:
            if use_edge:
                synth_edge(a.api, l["text"], a.voice, rate, a.pitch, raw)
            else:
                synth_offline(l["text"], raw, 152)
            process(raw, wav)
            d, err = dur_of(wav), dur_of(wav) - target
        results.append({"id": lid, "text": l["text"], "duration": round(d, 3),
                        "target": round(target, 3), "rate": round(rate, 1), "err": round(err, 2)})
        mark = "  " if abs(err) <= a.tolerance else " !"
        print(f"{mark}{lid} {d:6.2f}s (目标 {target:6.2f}s, {err:+5.2f}) 语速 {rate:+5.1f}%  {l['text'][:20]}")

    json.dump(results, open(os.path.join(proj, "voice_timing.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=2)
    worst = max(abs(r["err"]) for r in results)
    print(f"\n合计 {sum(r['duration'] for r in results):.2f}s · 最大偏差 {worst:.2f}s · "
          f"{'可继续 build（偏差已夹住）' if worst <= a.tolerance else '偏差偏大，建议放慢目标或加宽 CLAMP'}")


if __name__ == "__main__":
    main()
