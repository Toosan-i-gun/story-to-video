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

# 2. 配音服务（Edge-TTS，走微软云端，无 GPU / 无 API Key）
bash scripts/fetch_easyvoice.sh
cd vendor/easyVoice/packages/backend && PORT=3000 npx tsx src/server.ts &

# 3. 建项目（故事文本进来）
python3 scripts/new_project.py --name 小萤火虫 --dir ./projects/firefly --story 故事.md

# 4. 按 SKILL.md 的规则填 film.json（分镜/配色/镜头），然后：
python3 scripts/build_film.py   --project ./projects/firefly   # film.json → 合成
python3 scripts/make_voice.py   --project ./projects/firefly   # 逐句配音
python3 scripts/make_audio.py   --project ./projects/firefly   # 程序化配乐
npx hyperframes check --json                                   # lint
npx hyperframes render -o "renders/片名.mp4" -q delivery --workers 1
python3 scripts/qa_check.py --project . --video "renders/片名.mp4"   # QA + 自修提示
```

## 它能自动做什么

| 环节 | 做法 |
| --- | --- |
| 逐句配音 | easyVoice(Edge-TTS)，暖声女声，**逐句配速对齐画面时间表**（偏差 ≤0.25s，换声音不用重剪） |
| 声音底 | 程序化合成：溪水/虫鸣/风 + 八音盒摇篮曲（D 大调五声音阶，60 BPM），按情绪三档预设 |
| 字幕 | 圆体（资源圆体，OFL），暖米白 + 预模糊光晕托底，断行避开「」 |
| 画面 | 参数化生成器：夜色自然场景（河/草/树/星空）+ 萤火虫/蜗牛等角色，**全片唯一暖色只给"光"** |
| 蜡笔质感 | SVG feTurbulence 抖动 + 双笔触填充，线条自带手绘毛边 |
| QA | 成片与浏览器渲染**逐行比对**抓视口裁切、响度/时长/字幕检查，给出修复动作 |

## 已知边界

- 画面元素库覆盖夜色自然场景；其他环境按 `templates/world.js` 的模式扩展（有清晰的扩展点）。
- 配音走微软云端，需要联网；离线退回 macOS `say`。
- 上游 [easyVoice](https://github.com/cosin2077/easyVoice) 无 LICENSE：自用没问题，别二次分发。

## 在新设备安装

```bash
git clone https://github.com/<你>/story-to-video.git ~/.workbuddy-ai/skills/story-to-video
bash ~/.workbuddy-ai/skills/story-to-video/scripts/setup.sh
```

## 案例

[examples/firefly](examples/firefly/film.json) —— 《小萤火虫的一粒光》：
4 分 52 秒，8 场，34 句旁白，一首睡前故事改成的动画短片。

## License

MIT（本仓库自身的代码与文档）。上游 easyVoice 与字体各自遵循其许可：
资源圆体为 SIL OFL 1.1，GSAP 为标准许可。
