# 画风与画面：从故事里长出来

原则（先读）：**画面好不好，八成取决于"哪里最亮"和"人物站在画面的哪一格"，不取决于细节多不多。**

三条不能违反的：

1. **配色只能取自 handraw-style 的 C-01–C-36**（见 [palette-library.md](palette-library.md)）。
   `film.json` 里写色号，不写 hex；`build_film.py --strict-palette` 会拦。
2. **地面线（角色脚底）必须在字幕带之上**。字幕带顶约 y=843，地面线一律压到 ≤784。
   用 `at(scale, ground, screen_y)` 反算镜头 focus.y，别手填。
3. **全片只有一个"最亮/最饱和"的色，只给光**（烛火、栗子壳上那道缝、月光、片名）。

---

## 1. 先读故事，再定画风（不许套模板）

拿到故事先回答四件事，写在项目目录的 `LOOK.md` 里（一句话就够）：

| 问 | 例（小刺猬的最后一颗栗子） |
| --- | --- |
| 季节/时间跨度？ | 秋天；白天 → 黄昏下雨 → 夜里 → 天刚亮 → 又入夜 |
| 主场景是什么材质？ | 土、干草、树皮、落叶、石头；室内是"洞里"不是"房间" |
| 光从哪来？ | 白天是漫射天光；雨夜只有门口一线天光；夜里是月光；天亮是地平线 |
| 情绪基调？ | 温柔、舍不得、最后被填满。不要紧张，不要明亮活泼 |

**时间跨度决定色板数量**：故事走过一天，就至少三套色板（白天/夜/晨）。全片一份色板 = 全片一个时刻 = 一看就是模板。

## 2. 从 handraw-style 挑画风（写一句"为什么是它"）

从 `FB · 经典绘本叙事`（66 种）里挑，理由必须扣住故事，不能是"这个好看"。

| 故事质感 | 候选风格（色号在 palette-library 里选） |
| --- | --- |
| 低幼、蜡笔、暖 | FB-029 #251 儿童蜡笔绘本、FB-021 #219 复古暖调 |
| 动物、森林、安静 | FB-051 #307 岩村和朗 温暖森林水彩、FB-059 #315 Marianne Dubuc |
| 水彩、留白、诗意 | FB-031 #254 几米、FB-022 #222 中叶墨水水彩 |
| 厚涂、光影、电影感 | FB-024 #226 水粉动画、FB-058 #314 Rebecca Green |
| 冷幽默、极简动物 | FB-012 #047 Jon Klassen、FB-036 #292 Liz Climo |

定完风格，把它翻译成**这套代码能画的东西**：大剪影 + 少量清晰形状 + 一层蜡笔肌理。
`world.js` 的层函数只认色板，不认"风格名"——风格体现在你选哪几个色号、层怎么摆、镜头怎么走。

## 3. 逐场排一张"光线表"

例：

| 场 | 时间 | 底纸 | 唯一亮色 | 字幕 |
| --- | --- | --- | --- | --- |
| s1–s4 | 秋日午后 | C-34 奶油白 | C-25（栗子缝） | dark-text |
| s5 | 黄昏雨（洞内） | C-32 炭黑 | C-25（门口天光） | light-text |
| s6 | 秋夜 | C-03 普鲁士蓝 | C-25（月光暖处） | light-text |
| s7 | 天刚亮 | C-30 象牙白 | C-25 | dark-text |
| s8 | 入夜 | C-03 | C-25 | light-text |

同一场里如果要"变暗/变亮"，用 `dusk` 层抬起来，或换场的色板，别去调单个元素的 opacity。

## 4. 构图：人物站哪一格

- **地面线 ≤ 784**。镜头用 `at(scale, ground, screen_y, x)` 反算：
  `focus.y = ground - (screen_y - 540) / scale`。手填 focus 一定会翻车。
- 一场的**第一个镜头必须钉住开场构图**（`from` = 自己的 scale/focus），
  否则第一帧会退回 `1.0 / 540`，人物全部掉进字幕带。
- 角色"从地里/门外升起来"的动作幅度 ≤ 40px，否则升起的中途会被字幕压住。
- 一次推近 ≤ 1.35 倍；宽景里镜头停住不超过 2s。
- 主体在画面里的高度：中景约 1/3 画面高，特写 1/2。小于 1/5 就没人看得见。

改完跑 `python3 scripts/check_framing.py --project .`，**必须全绿**才能渲染。

## 5. 字幕

- 位置全片统一（`bottom: 88`），**颜色按场次换**（`scene.captions.style`）。
- 浅底用 `dark-text`（深字 + 浅托底），深底用 `light-text`（浅字 + 深托底）。
- 字幕带高度 = `1080 - bottom - 行数 × size × 1.56`，两行时约 843。
- 宁可把镜头推近一点让主体上移，也不要让字幕压在人脸上。

## 6. 环境层（world.js 支持的 type）

`sky`（可带 `grad` 三段渐变）`stars` `farbank` `water` `ground`（`patchOp` 控斑块）`reeds` `grassmass`（`h`/`hVar`）`blades` `blurmass` `leaf` `stones` `dandelions` `twig` `rock` `tree` `pool` `farflies` `dusk`
秋日/洞穴系：`autumnTree` `chestFall` `leafFall` `burrowOut`（`hw` 控制土丘宽度）`burrowIn`（`wall` 可单独给墙色）`straw` `fruitPile` `gifts` `moon` `moonPool` `rain`（`clip` 裁进拱门）`dawn` `dirtHole`
冬日/灯系：`snowGround`（`colour`/`lit`/`shade`/`drifts`）`snowFall` `pine`（`colour`/`snow`/`snowOp`）`pineRow`（远景林线，别用 farbank 顶，那条会变成绿篱）`bareTree`（落叶树，压雪）`snowBurrow`（雪丘 + 拱门 + 冰凌 + 门口石头）`oakLanterns`（挂满灯的老橡树，`lights` 给 `[x,y,kind]`，kind = root/paper/bottle/ice/copper）`darkness`（盖满画面的黑，配 `darken`）`lampPool`（灯照在雪上的一圈，径向渐变）`tracks`（雪地脚印链）

新环境照 `LAYERS.leaf` 的样子加一个函数：先大剪影，后细节，颜色一律从 `p.*` 取，**不要在层里写死 hex**（浅色纸上会变成黑水坑）。

> **加在哪里**：加在**项目副本**（`projects/<name>/assets/world.js`），不是仓库里的 `templates/world.js`。
> 跑片子不许改仓库，见 SKILL.md 开头的「⛔ 铁律」。

## 7. 角色

`firefly` `snail` `hedgehog` `squirrel`（`droop`）`mole` `chestnut`；
冬日：`badger`（小獾）`fox`（`flip` 朝左）`rabbit`（`flip`）`copperLamp`（铜灯）`hurricaneLamp`（马灯）。
角色都可以给 `flip` / `opacity` / `rim`（受光的那道暖边，灯在旁边时给）；
灯可以给 `lampOp`（一开始就是灭的）和 `shadowOp: 0`（提在手上时别留地上的影）。
新角色照 `KIT.snail` 写：身体一块、特征两处、颜色进色板（含 `shadow`）。同样写在**项目副本**（`projects/<name>/assets/kit.js`）。
动作只有位移/scale/scaleX/scaleY，**不用 rotation**（SVG 的 pivot 会跑，见 pitfalls）。
