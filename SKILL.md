---
name: story-to-video
description: 把一个故事文本做成一支带配音、字幕、声音底和手绘风画面的动画短片。覆盖 HyperFrames 合成、easyVoice(Edge-TTS) 配音、程序化配乐、字幕、渲染 QA 与自动修复。当用户给出一个故事/绘本文本并要求做成视频、动画、短片、有声绘本时使用。
---

# Story → Video（故事转动画短片）

把一个故事变成一支 3–6 分钟、带旁白、字幕、程序化声音底和手绘画面的动画短片。
全流程可复现：文本 → 分镜计划(film.json) → HyperFrames 合成 → 配音 → 渲染 → QA → 自修 → 交付。

## 0. 环境准备（新设备先跑一次）

```bash
bash scripts/setup.sh          # 幂等：装 Node/ffmpeg/字体/easyVoice，全部自检
```

装完必须 `source` 它打印的环境行（至少 `HYPERFRAMES_BROWSER_PATH`），否则起浏览器就挂。

## 1. 流程总览（每一步的产物）

| 步 | 产物 | 谁做 |
| --- | --- | --- |
| 1 读故事 | `narration.json`（逐句文本） | 你按 §3 拆句 |
| 2 分镜 | `film.json`（场景/镜头/画面元素/配色） | 你按 §4 规划 |
| 3 配色 | film.json 的 `palette` | 按 references/style-guide.md |
| 4 生成 | 项目目录（index.html + compositions/） | `build_film.py` |
| 5 配音 | `assets/voice/vXX.wav` | `make_voice.py` |
| 6 声音底 | `assets/audio/bed.wav` | `make_audio.py` |
| 7 检查 | lint + 快照 | `hyperframes check` + `snapshot` |
| 8 渲染 | `renders/<片名>.mp4` | `hyperframes render --workers 1` |
| 9 QA | 帧级体检报告 | `qa_check.py` |
| 10 自修 | 改 film.json / 重渲 | 按 §6 处置表 |

## 2. 新建一个项目

```bash
python3 scripts/new_project.py --name 小萤火虫 --dir ./projects/firefly
```

得到项目骨架，其中 `film.json` 是**唯一事实来源**：时长、场景、镜头、字幕、配色全在里面，
`build_film.py` 从它生成全部 HTML。改任何时间/画面都改 film.json 再重跑 build。

## 3. 拆句（narration）

- 用故事**原文**拆句，不改写；一句 12–45 字，按语气停顿切。
- 每句一个 id（v01…），`build_film.py` 会按它生成配音与字幕。
- 目标总时长 = 字数 ÷ 3.9（字/秒）+ 每句间 1.1–1.6s 的呼吸 + 片头 6s + 片尾 6s。
  儿童睡前故事宁慢勿快。

## 4. 分镜与配色（film.json）

- 每句旁白配一个"视觉动作"，镜头几乎不切：**一条长镜头跟着主角走**优于来回切。
- 配色按 references/style-guide.md：先定情绪，再取色板；**全片只留一个暖色，只给"光"**。
- 场景字段见 templates/world.js 头部注释（环境、层、角色、镜头关键帧、动作表）。
- 镜头规则：一次推近 ≤1.35 倍；角色动作都要有因；宽景里镜头停住不超过 2s。

## 5. 生成与配音

```bash
python3 scripts/build_film.py --project ./projects/firefly
python3 scripts/make_voice.py --project ./projects/firefly    # easyVoice / Edge-TTS
python3 scripts/make_audio.py --project ./projects/firefly    # 程序化声音底
```

- 配音默认 `zh-CN-XiaoxiaoNeural`（暖声女声）。**逐句配速对齐 film.json 的目标时长**
  （时长 ∝ 1/(1+语速%)），最大偏差夹在 0.25s 内 —— 这样改配音不用重排画面。
- 换声音只改 `--voice`；句子重音不理想时改 `--rate/--pitch` 重跑。
- 声音底按情绪预设（`--mood calm|warm|misty`）：溪水/虫鸣/风 + 八音盒摇篮曲，
  全部合成出来，可量化响度；旁白在 −18 LUFS，底轨压低 12 dB。

## 6. 检查与自修（必须跑完才能交付）

```bash
npx hyperframes check --json                     # lint：0 error 才能继续
npx hyperframes snapshot --at 4,60,120 --no-end -o /tmp/chk
python3 scripts/qa_check.py --project . --video renders/片名.mp4
```

`qa_check.py` 会自动查：底部平色带（视口裁切 bug）、字幕缺字/被裁、整体响度、
时长、与浏览器快照的逐行差。**发现即给修复动作**，处置表：

| 症状 | 修复 |
| --- | --- |
| 底部平色带 | 确认 index.html 有 `#hf-vp-spacer`（模板自带）；重渲 |
| 快照与成片逐行差 >18 | 同上，九成是同一个视口裁切 |
| 响度不在 −16～−14 LUFS | 调 bed 的 `data-volume`（每 ±0.04 ≈ ±1 dB） |
| 字幕被裁/出安全区 | 调 captions 的 `bottom`/`font-size` |
| lint error | 按 check 的 Fix 行改，多为 transform 冲突（见 references/pitfalls.md） |
| 配音时长漂移 >0.25s | 重跑 make_voice.py（自动逐句配速） |

## 7. 渲染与交付

```bash
npx hyperframes render -o "renders/片名.mp4" -q delivery --workers 1 --skill story-to-video
```

- **必须 `--workers 1`**：多 worker 需 ~5GB 帧暂存，普通机器放不下（详见 pitfalls）。
- 交付前最后跑一次 `qa_check.py --video`，全绿才算完成。
- 交付说明里写清：实测响度、时长、文件大小，以及"哪些是实测、哪些是没听过的"。

## 8. 已知边界

- 画面元素库覆盖：夜色自然场景（河/草丛/树/星空）+ 萤火虫/蜗牛/爷爷 等小生物。
  故事需要别的环境（室内、雪、海）时，按 world.js 的既有函数扩展一个生成器，
  保持"大面积剪影 + 少量清晰形状 + 唯一暖色"的规则不变。
- 配音是云端 TTS（微软 Edge），需要联网；离线时回退 `say`（macOS）。
- easyVoice 仓库无 LICENSE：自用没问题，别拿去二次分发。
