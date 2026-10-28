# story-to-video 🎙️➡️🎬

把一个故事文本做成一支**带配音、字幕、程序化配乐和手绘风画面**的动画短片。
整条流水线可复现、可自检、可自动修复。

这是一个 [WorkBuddy AI](https://www.workbuddy.cn) / Claude Code 风格的 **Agent Skill**：
`SKILL.md` 是给 AI 的工作流契约，`scripts/` 是可独立运行的流水线工具，
`templates/` 是参数化的画面生成器。

## 一分钟上手

```bash
# 1. 环境（幂等，自动装 Node/ffmpeg/字体/依赖，并自检）
bash scripts/setup.sh
source env.sh

# 2. 配色库（必须：颜色只能取自 handraw-style 的 C-01–C-36）
git clone https://github.com/yang0/handraw-style ~/.workbuddy-ai/skills/handraw-style
python3 scripts/color_lib.py --list          # 能列出 36 色就通了

# 3. 配音服务（Edge-TTS，走微软云端，无 GPU / 无 API Key）
bash scripts/fetch_easyvoice.sh
cd vendor/easyVoice/packages/backend && PORT=3000 npx tsx src/server.ts &

# 4. 建项目（故事文本进来）
python3 scripts/new_project.py --name 小萤火虫 --dir ./projects/firefly --story 故事.md

# 5. 按 SKILL.md 的规则填 film.json（分镜/色号/镜头），然后：
python3 scripts/build_film.py    --project ./projects/firefly --strict-palette  # film.json → 合成
python3 scripts/make_voice.py    --project ./projects/firefly   # 逐句配音
python3 scripts/make_audio.py    --project ./projects/firefly   # 程序化配乐
python3 scripts/check_framing.py --project ./projects/firefly   # 构图：人物有没有被字幕压住
npx hyperframes check --json                                    # lint
HF_SEGMENTED_CAPTURE=true npx -y hyperframes render --resume -q delivery --workers 3
python3 scripts/qa_check.py --project . --video "renders/片名.mp4"   # QA + 自修提示
```

## 配色：只能用 handraw-style 的 C-01–C-36

**`film.json` 里不许出现 `#rrggbb`。** 所有颜色写色号（`"C-34"`），由 `build_film.py`
在构建时解析成 hex；`--strict-palette` 发现自定义色直接退出。

理由：手写 hex 会不自觉地滑回"深蓝 + 粉笔白"那套默认值，片子越做越像模板。
色号是**受限选择**，逼你在 36 色里做取舍。全片只留一个"最亮/最饱和"的色给光。

| 工具 | 用途 |
| --- | --- |
| `scripts/color_lib.py --list` | 列 36 色色号 + hex |
| `scripts/color_lib.py --resolve C-34,C-25` | 查色号对应的 hex |
| `scripts/color_lib.py --refresh` | 从 handraw-style 色卡图重新采样，刷新 `references/colors.json` |

细节见 [references/palette-library.md](references/palette-library.md)（槽位对照、逐场换色板、字幕深浅）。

## 构图：人物不许被字幕压住

**铁律：角色脚底在屏幕上的 y ≤ 784**（字幕带顶 843 再留 60 余量）。
镜头 `focus.y` 要用 `at(scale, ground, screen_y)` 反算，别手填——手填就会有人物掉进字幕带。

```bash
python3 scripts/check_framing.py --project ./projects/firefly   # 检查：0 处压字才能渲染
python3 scripts/solve_framing.py --project ./projects/firefly   # 求解：自动迭代修正 focus.y
```

`check_framing.py` 把每场的镜头关键帧和角色位移插值出来，算出"任意时刻人物在画面上的
位置"，和字幕带求交；`solve_framing.py` 用同一套几何反向求解，几轮迭代即可归零。

## 它能自动做什么

| 环节 | 做法 |
| --- | --- |
| 配色 | 色号受限选择（handraw-style C-01–C-36），`--strict-palette` 拦截自定义色 |
| 逐句配音 | easyVoice(Edge-TTS)，暖声女声，**逐句配速对齐画面时间表**（偏差 ≤0.25s，换声音不用重剪） |
| 声音底 | 程序化合成：溪水/虫鸣/风 + 八音盒摇篮曲（D 大调五声音阶，60 BPM），按情绪三档预设 |
| 字幕 | 圆体（资源圆体，OFL），暖米白 + 预模糊光晕托底，断行避开「」，按场次切深/浅字 |
| 画面 | 参数化生成器：夜色自然场景（河/草/树/星空）+ 萤火虫/蜗牛等角色，**全片唯一暖色只给"光"** |
| 蜡笔质感 | SVG feTurbulence 抖动 + 双笔触填充，线条自带手绘毛边 |
| 构图 | 渲染前算出人物包围盒与字幕带的交叠，可自动求解修正 |
| QA | 成片与浏览器渲染**逐行比对**抓视口裁切、响度/时长/字幕检查，给出修复动作 |

## 已知边界

- 画面元素库覆盖夜色自然场景；其他环境按 `templates/world.js` 的模式扩展（有清晰的扩展点）。
- 配音走微软云端，需要联网；离线退回 macOS `say`。
- 上游 [easyVoice](https://github.com/cosin2077/easyVoice) 无 LICENSE：自用没问题，别二次分发。

## 在新设备安装

Skill 本体就是一个含 `SKILL.md` 的目录，**不同 agent 工具从各自约定的目录扫描**，
不绑定任何一家。用 `install.sh` 装到你用的工具（符号链接，skill 改动即生效）：

| 工具 | 安装位置 |
| --- | --- |
| WorkBuddy AI | `~/.workbuddy-ai/skills/story-to-video` |
| Claude Code | `~/.claude/skills/story-to-video` |
| 其他遵循 Agent Skills 规范（SKILL.md）的工具 | 其各自的 skills 路径（作为参数传入） |

```bash
# 1. 装 skill 本体（clone 到任意位置，然后链接过去）
git clone https://github.com/Toosan-i-gun/story-to-video.git
cd story-to-video
bash scripts/install.sh              # 自动探测本机已装的 agent 工具
bash scripts/install.sh claude       # 或明确指定目标工具
bash scripts/install.sh ~/.x/skills  # 或任意自定义目录

# 2. 装环境依赖（Node/ffmpeg/字体/GSAP/easyVoice），幂等
bash scripts/setup.sh
```

- 不支持 SKILL.md 的工具，也可以把 `SKILL.md` 的内容贴进其规则文件当工作流参考。
- 目录里已有本 skill 的设备跳过第 1 步；`setup.sh` 可重复执行。

## 案例

[examples/firefly](examples/firefly/film.json) —— 《小萤火虫的一粒光》：
4 分 52 秒，8 场，34 句旁白，一首睡前故事改成的动画短片。

这份 `film.json` 是**合规样板**：配色全为色号（`--strict-palette` 通过）、
镜头 `focus.y` 按构图铁律反算（`check_framing.py` 0 处压字）。

## License

MIT（本仓库自身的代码与文档）。上游 easyVoice 与字体各自遵循其许可：
资源圆体为 SIL OFL 1.1，GSAP 为标准许可。
