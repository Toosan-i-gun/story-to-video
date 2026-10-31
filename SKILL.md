---
name: story-to-video
description: 把一个故事文本做成一支带配音、字幕、声音底和手绘风画面的动画短片。覆盖画风与配色决策（配色只能取自 handraw-style 的 C-01–C-36）、HyperFrames 合成、easyVoice(Edge-TTS) 配音、程序化配乐、字幕、构图与渲染 QA 及自动修复。当用户给出一个故事/绘本文本并要求做成视频、动画、短片、有声绘本时使用。
---

# Story → Video（故事转动画短片）

把一个故事变成一支 3–6 分钟、带旁白、字幕、程序化声音底和手绘画面的动画短片。
全流程可复现：文本 → 画风与配色 → 分镜计划(film.json) → HyperFrames 合成 → 配音 → 渲染 → QA → 自修 → 交付。

## ⛔ 铁律：生成视频时不许改动本仓库

**跑工作流做一支片子，不许改动本技能所在的 git 仓库（`~/.workbuddy-ai/skills/story-to-video` 指向的那个仓库）里的任何文件。**

技能目录是**只读**的。产物一律只写进**项目目录**（`film.json`、`compositions/`、`assets/`、`renders/`、`LOOK.md`、`NOTES.md`）。

- **需要库里没有的东西**（新环境、新角色、新声音层）：照现有层/角色的写法，在**项目内副本**上扩展
  （`projects/<name>/assets/kit.js`、`projects/<name>/assets/world.js`），不改仓库模板。
- **只有仓库本身的逻辑有问题、非改不可时**：**停下来**，把「为什么非改不可 / 改哪几行 / 会影响什么 / 风险」说清楚，
  **等用户明确同意**再动 `scripts/`、`templates/`、`references/`、`SKILL.md`。没拿到同意就只报告，不动手。
- **踩到的坑、想补的文档、想加的例子**：先写进项目的 `NOTES.md`，交付时问用户要不要回写技能库。
  同样不许自作主张写回 `references/` 或本文件。
- **唯一例外**：用户明确说「把这次的东西写回技能库 / 改这个技能」。

**自查**（交付前必须跑，有输出就是违规）：

```bash
git -C ~/.workbuddy-ai/skills/story-to-video status --short   # 有输出 = 先确认是不是用户要求的改动，不是就回滚再交付
```

**项目内副本怎么落地**：`build_film.py` 的拷贝顺序是
`项目 templates/<f>` → `已有 assets/<f>`（保留不覆盖）→ `技能库 templates/<f>`（只在缺失时铺一份）。
所以扩展素材有两条路：

- 想跟仓库模板保持可对比：`cp templates/{kit,world}.js projects/<name>/templates/`，改那边；
- 图省事：直接改 `projects/<name>/assets/{kit,world}.js`，build 不会冲掉。

想让项目跟技能库强制对齐（会冲掉项目内的扩展）：`build_film.py --sync-templates`。

## 0. 环境准备（新设备先跑一次）

**先判断平台**（三平台的差异、排障顺序、镜像配置见 references/platforms.md）：

```bash
# macOS / Linux
bash scripts/setup.sh          # 幂等：装 Node/ffmpeg/字体/easyVoice，全部自检
source env.sh                  # 装完必须 source，至少要有 HYPERFRAMES_BROWSER_PATH
```

```powershell
# Windows（PowerShell）
powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
. .\env.ps1
```

**国内网络**：所有安装脚本都支持镜像开关，一条命令换三处源（pip / npm / GitHub 下载）：

```bash
bash scripts/setup.sh --cn                        # macOS / Linux
bash scripts/fetch_easyvoice.sh --cn
python3 scripts/font_subset.py --download --cn …  # 字体单独跑时
```
```powershell
powershell -File scripts\setup.ps1 -CN            # Windows
```

自检一行：`python3 scripts/platform_lib.py` —— 应打印 `platform / chrome / hf bin`
三个真实值；`chrome` 或 `hf bin` 是 `None` 就先解决那一项，别急着渲染。

**配色库（必须）**：本技能不自己配色，色号全部取自 `handraw-style` 的 C-01–C-36。
没装就先装：

```bash
git clone https://github.com/yang0/handraw-style ~/.workbuddy-ai/skills/handraw-style
python3 scripts/color_lib.py --refresh     # 采样色卡，刷新 references/colors.json
python3 scripts/color_lib.py --list        # 自检：能列出 36 色就通了
```

国内网络下克隆慢，可以走代理前缀（`STV_CN=1` 时脚本会自动加）：

```bash
git clone https://ghfast.top/https://github.com/yang0/handraw-style ~/.workbuddy-ai/skills/handraw-style
```

## 1. 流程总览（每一步的产物）

| 步 | 产物 | 谁做 |
| --- | --- | --- |
| 1 读故事 | `LOOK.md`（季节/材质/光/情绪 四问） | 你按 §3 |
| 2 拆句 | `narration.json`（逐句文本） | 你按 §4 |
| 3 定画风与配色 | 风格编号 + 逐场色号表 | 你按 §3，色号见 references/palette-library.md |
| 3b 定声音 | `film.json` 的 `sound` 表（逐场听得见什么） | 你按 §3，层表见 references/sound-guide.md |
| 4 分镜 | `film.json`（场景/镜头/画面元素/逐场 palette） | 你按 §5 |
| 5 生成 | 项目目录（index.html + compositions/） | `build_film.py --strict-palette` |
| 6 配音 | `assets/voice/vXX.wav` | `make_voice.py` |
| 7 声音底 | `assets/audio/bed.wav` | `make_audio.py` |
| 8 检查 | lint + 快照 + **构图** + **同步** | `hyperframes check` / `snapshot` / `check_framing.py` / `check_sync.py` |
| 9 渲染 | `renders/<片名>.mp4` | `HF_SEGMENTED_CAPTURE=true hyperframes render --resume` |
| 10 QA | 帧级体检报告 | `qa_check.py` |
| 11 自修 | 改 film.json / 重渲 | 按 §7 处置表 |

## 2. 新建一个项目

```bash
python3 scripts/new_project.py --name 小萤火虫 --dir ./projects/firefly
```

得到项目骨架，其中 `film.json` 是**唯一事实来源**：时长、场景、镜头、字幕、配色全在里面，
`build_film.py` 从它生成全部 HTML。改任何时间/画面都改 film.json 再重跑 build。

## 3. 先定画风与配色（不许套模板）

**这一步不做，片子就会长成上一部的样子。** 按 [references/style-guide.md](references/style-guide.md) 走：

1. 读故事，写 `LOOK.md`：**季节 / 时间跨度 / 主场景材质 / 光从哪来 / 情绪**。
   时间跨度决定色板数量——故事走过一天，就至少三套（白天/夜/晨），全片一份色板等于全片一个时刻。
2. 从 handraw-style 的 `FB · 经典绘本叙事` 里挑一个风格，写一句"为什么是它"（扣住故事，不是"好看"）。
3. 定逐场光线表：每场的**底纸 / 唯一亮色 / 字幕深淡**。
4. **配色只能写色号**：`"night": "C-34"`。写 hex 会被 `--strict-palette` 拦下来。
   全片只有一个"最亮/最饱和"的色，只给光（烛火、栗子壳上那道缝、月光、片名）。

详见 [references/palette-library.md](references/palette-library.md)（36 色全表 + 槽位对照 + 字幕配色）。

5. **声音也要从故事里来**，不许用固定预设。逐场写 `sound.scenes`：这一场在哪里（户外 `wind` /
   室内 `roomtone`）、有什么在响（`rain` `drips` `leaves` `chestnut` `dig` `steps` `straw` `birds`）。
   故事里没有河就别放 `stream`，秋天没有蟋蟀就别放 `crickets`。
   详见 [references/sound-guide.md](references/sound-guide.md)。

## 4. 拆句（narration）

- 用故事**原文**拆句，不改写；一句 12–45 字，按语气停顿切。
- 每句一个 id（v01…），`build_film.py` 会按它生成配音与字幕。
- 目标总时长 = 字数 ÷ 3.9（字/秒）+ 每句间 1.1–1.6s 的呼吸 + 片头 6s + 片尾 6s。
  儿童睡前故事宁慢勿快。
- **少于 6 个字的句子并进上一句**：edge-tts 对短文本返回 400（"晚安。"单独一句必挂）。

## 5. 分镜与配色（film.json）

- 每句旁白配一个"视觉动作"，镜头几乎不切：**一条长镜头跟着主角走**优于来回切。
- `scene.palette` 盖在 `film.palette` 上，逐场解析；图层参数里的 `colour`/`grad`/`outside` 也能直接写色号。
- `scene.captions.style` 选 `dark-text` / `light-text`（浅底深字 / 深底浅字），字幕颜色按场次自动切。
- 场景字段见 templates/world.js 头部注释（环境、层、角色、镜头关键帧、动作表）。
- **构图铁律**：地面线（角色脚底）在屏幕上的位置必须 ≤ 784（字幕带顶 843 再留 60 余量）。
  用 `at(scale, ground, screen_y)` 反算 `focus.y`，别手填：

  ```python
  def at(scale, ground, screen_y=780, x=960):
      screen_y = min(screen_y, 784)
      return [x, round(ground - (screen_y - 540) / scale, 1)]
  ```

- 每场**第一个镜头必须钉住开场构图**（`from` = 自己的 scale/focus），否则第一帧会退回 1.0/540，
  人物全部掉进字幕带。角色"从地里升起来"的幅度 ≤ 40px。
- 镜头规则：一次推近 ≤1.35 倍；角色动作都要有因；宽景里镜头停住不超过 2s。

### 5b. 每个动作都要绑一句台词（cue）—— 这一条比构图更容易翻车

**动作的 `t` 不要手填，绑到台词上。** 写了 `cue`，`build_film.py` 会用那句台词的实际起止算出 `t`：

```json
{ "op": "fade", "target": "leaf0", "cue": "v13", "cueOff": 1.1, "dur": 1.6, "from": 0, "to": 1 }
{ "op": "fade", "target": "deer",  "cue": "v17", "cueAt": "end", "cueOff": 0.6, "dur": 2.2, "from": 1, "to": 0 }
```

- `cue: "v13"` = 这个动作属于 v13 那句，`t` = v13 开口的时刻 + `cueOff`。
- `cueAt: "end"` = 必须等这句**说完**（淡出、离场、转身）。**别用 "start" 让角色在台词中间消失。**
- 没绑 cue 的动作只该是环境循环（`waddle` `rainfall` `bob` `twinkle` `cloudDrift` `splashIn`）和走路位移。

**为什么必须这样**：语速一改（CPS、`--clamp`、配音实测回填），台词位置全变，手填的 `t` 就整体错位，
而错位**不会报错**：渲染正常、构图全绿，只有逐帧看片才发现「叶子提前 4 秒就长在壳上」
「台词里小鹿在问，画面上小鹿已经没了」。这类问题一律用 `check_sync.py` 抓（见 §7）。

配套的两条习惯：

1. **每句台词至少有一个动作或镜头变化从它开始** —— 一句 6 秒的话配着不动的画面，就是没表现这句。
2. **"东西"不能凭空出现**：叶子先躺在地上（`characters` 里就有它），等那句台词再被捡起来；
   角色先在场，等那句"跑起来"再跑走。检查器抓不到"凭空出现"，只能靠这条纪律。

> 老项目（`examples/firefly`、`projects/firefly-e2e`）整片没有 cue，`check_sync.py` 会认出来、
> 只提示不判失败。新片一律绑 cue。

## 6. 生成与配音

```bash
python3 scripts/build_film.py --project ./projects/firefly --strict-palette
python3 scripts/make_voice.py --project ./projects/firefly    # easyVoice / Edge-TTS
python3 scripts/make_audio.py --project ./projects/firefly    # 程序化声音底
```

- `--strict-palette`：palette 里出现 `#rrggbb` 就报错。构建时会打印每场用了哪些色号，扫一眼对不对。
- 配音默认 `zh-CN-XiaoxiaoNeural`（暖声女声）。**逐句配速对齐 film.json 的目标时长**
  （时长 ∝ 1/(1+语速%)），最大偏差夹在 0.25s 内 —— 这样改配音不用重排画面。
- 换声音只改 `--voice`；句子重音不理想时改 `--rate/--pitch` 重跑。
- 声音底按 `sound` 表逐层合成（`make_audio.py`）：环境层逐场铺，八音盒可逐场调音量。
  `--mood` 只影响八音盒的写法，不再决定有没有水声。`--print-plan` 可以看这一版用了哪些层。
  旁白在 −18 LUFS，底轨压低 12 dB。

## 7. 检查与自修（必须跑完才能交付）

```bash
npx hyperframes check --json                     # lint：0 error 才能继续
python3 scripts/check_sync.py --project .        # 同步：每个动作是否落在它绑的那句台词里
python3 scripts/check_framing.py --project .     # 构图：人物有没有被字幕压住
python3 scripts/solve_framing.py --project .     # 构图不绿时：自动迭代修正 focus.y
npx hyperframes snapshot --at 4,60,120 --no-end -o /tmp/chk
python3 scripts/qa_check.py --project . --video renders/片名.mp4
```

`check_framing.py` 会把每场的镜头关键帧和角色位移插值出来，算出"任意时刻人物在画面上的位置"，
和字幕带求交。**必须全绿**（贴边可以，压字不行）才能渲染 —— 这是"字幕挡住主角"唯一能在渲染前发现的办法。
报 ✗ 时先跑 `solve_framing.py`：它用同一套插值几何反解 `focus.y`，几轮迭代把脚底压回 780 以内
（手填 `focus.y` 是这类问题的根源，别硬调数字）。

`qa_check.py` 会自动查：底部平色带（视口裁切 bug）、字幕缺字/被裁、整体响度、
时长、与浏览器快照的逐行差。**发现即给修复动作**，处置表：

| 症状 | 修复 |
| --- | --- |
| 人物压字幕（check_framing 报 ✗） | 跑 `solve_framing.py` 自动修；仍不行再用 `at()` 反算 `screen_y` ≤ 780 |
| 场首第一帧人物在字幕带里 | 给该场第一个 `cam` 补 `from`（= 自己的 scale/focus） |
| 浅色纸上出现黑水坑 | 那是写死的深色阴影/斑块：改用 `p.shadow` / `p.patchA`，或给层传 `patchOp` |
| 底部平色带 | 确认 index.html 有 `#hf-vp-spacer`（模板自带）；重渲 |
| 快照与成片逐行差 >18 | 同上，九成是同一个视口裁切 |
| 响度不在 −16～−14 LUFS | 调 bed 的 `data-volume`（每 ±0.04 ≈ ±1dB） |
| 字幕被裁/出安全区 | 调 captions 的 `bottom`/`font-size` |
| lint error | 按 check 的 Fix 行改，多为 transform 冲突（见 references/pitfalls.md） |
| 某个动作**完全没生效**（画面一帧不动，也不报错） | 先查 `curl` 是不是同时给了 `scale` 和 `scaleX`（pitfalls #6，GSAP 会静默顶掉）；再在合成里插调试 `<div>` 把 `gsap.getProperty` 打到画面上截图读 |
| 配音时长漂移 >0.25s | 重跑 make_voice.py（自动逐句配速） |
| 动作比台词早/晚（叶子先出现、人先消失） | 给这个动作加 `cue`（+ `cueOff`），别手填 `t`；跑 `check_sync.py` |
| 台词里的人物在画面上已经没了 | 把淡出改成 `cueAt: "end"` 绑在**它离场那句**上；别绑在上一句 |
| 画面跟上一部像 | 回 §3：色板是不是又用了同一套？时间跨度有没有拆成多套？ |
| 声音跟上一部像 | 回 §3b：是不是又用了默认兜底（wind+leaves）？故事里根本没有的水声/虫鸣有没有被塞进来？ |

## 8. 渲染与交付

```bash
# 长片一律分段捕获（单段有 600s 上限）：
HF_SEGMENTED_CAPTURE=true npx -y hyperframes render --resume -q delivery --workers 3
```

- **必须 `--workers 1`**：多 worker 需 ~5GB 帧暂存，普通机器放不下（详见 pitfalls）。
- 长片（>4 分钟）用 `HF_SEGMENTED_CAPTURE=true`，分段捕获绕开单阶段超时，且可断点续渲。
- 交付前最后跑一次 `qa_check.py --video` + `check_framing.py`，全绿才算完成。
- **交付前查一次仓库有没有被弄脏**：`git -C ~/.workbuddy-ai/skills/story-to-video status --short`
  必须为空（或只有用户要求改的那几个文件）。有多余输出就说明改了技能库（违规，见开头铁律）——先回滚，再交付。
- 交付说明里写清：实测响度、时长、文件大小、用了哪些风格编号与色号，
  以及"哪些是实测、哪些是没听过的"。

## 9. 已知边界

- 画面元素库覆盖：夜色自然场景（河/草丛/树/星空）+ 秋日与洞穴（秋树/落栗/洞口/洞内/干草/果子堆/礼物堆/月亮/月光地/雨/天亮）+ 冬日与灯（雪地/落雪/雪压松/雪丘洞口/挂灯老橡树/全黑/灯照雪地/脚印）+ 萤火虫/蜗牛/刺猬/松鼠/鼹鼠/栗子/小獾/狐狸/兔子/铜灯/马灯。
  故事需要别的环境（室内房间、雪、海）时，照 world.js 的既有函数在**项目副本**里扩展一个生成器，
  保持"大面积剪影 + 少量清晰形状 + 唯一暖色"的规则不变，颜色一律从 `p.*` 取。
  **不要直接改仓库的 `templates/world.js`**（见开头铁律）。
- 声音全部是程序化合成的（numpy），没有采样素材：听感偏"氛围"不偏"拟音"，
  真要拟音（脚步质感、翻叶子）得上采样库。
- 配音是云端 TTS（微软 Edge），需要联网；离线时 `--fallback-tts` 回退系统 TTS：
  macOS `say` / Windows SAPI / Linux `espeak-ng`（详见 references/platforms.md）。
- easyVoice 仓库无 LICENSE：自用没问题，别拿去二次分发。
- handraw-style 的色号与色卡版权归原作者 yang0（github.com/yang0/handraw-style），本技能只采样不改库。
