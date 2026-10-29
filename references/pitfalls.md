# 踩坑清单（每一句都是真金白银换的）

## GSAP × SVG

1. **GSAP 的 `x/y` 会吃掉 SVG 元素上的 `transform="translate(...)"`**。
   凡是"既要定位又要动 x/y"的元素：外层 `<g transform="translate(...)">` 定位，
   内层 `<g>` 给 GSAP。反之元素会瞬移到 (0,0)。world.js 的角色、光池都这么包。
2. **SVG 上 `transformOrigin:"960px 540px"` 是相对元素 bbox 左上角**，不是画布坐标。
   镜头用 `svgOrigin:"960 540"`（或 `gsap.set(cam,{svgOrigin})` 一次设好）；
   子部件用 `"50% 100%"` 这类百分比；翅膀用 scaleY 抖动，**不要 rotation**。
3. 眼柱/触角要摆动时 pivot 用 `"50% 100%"`（根部在 bbox 底部中间）。
4. 同一个 target 上多次 `fromTo` 会触发 `gsap_repeated_fromto_without_baseline`，
   第二次起改用 `.to()`。
5. `querySelector(\`[data-x="${i}"]\`)` 会触发 `template_literal_selector`（打包器崩），
   改成字符串拼接。
6. 不要 tween `.clip` 的 display/visibility/autoAlpha；要淡就动它的子元素。
7. `repeat: -1` 禁用；要循环用有限 repeat（yoyo 计算好次数）。

## 渲染器（hyperframes render）

8. **新机器必设 `HYPERFRAMES_BROWSER_PATH`**，否则起浏览器就挂
   （Chrome not found / `.chrome.install.lock` 残留时 `rm -rf ~/.cache/hyperframes/.chrome.install.lock`）。
9. **`--workers 1`**：多 worker 要 ~5.2GB 帧暂存，普通机器放不下直接失败。
   一 worker 是流式喂编码器，不吃磁盘。
10. **蓝条（视口裁切）**：可见视口不足画布高度时，渲染器会关掉 captureBeyondViewport，
    画面底部被页面背景色补上。修复 = index.html 里放 `#hf-vp-spacer`
    （1px×1084px，让 scrollHeight 超过画布）。模板自带。
11. `hyperframes check --json` 的输出前面可能有 bundler 日志，解析前先找第一个 `{`。
12. `npx hyperframes` 在沙箱里会卡在联网检查被 SIGKILL —— 用缓存里的二进制
    （`~/.npm/_npx/*/node_modules/.bin/hyperframes`）。

## 依赖安装

13. `package.json` 里的 `packageManager` 会让 pnpm 触发 corepack 交互提示卡死 →
    `export COREPACK_ENABLE_DOWNLOAD_PROMPT=0`。
14. pnpm 的全局 store（`~/Library/pnpm`）可能被沙箱拒读；本地 store 也慢。
    **直接用 npm 装在包目录里**（npmmirror 镜像快得多）。
15. 中文字体别用 Google Fonts 的分片 woff2（几十个文件）；直接下 TTF 用
    fontTools 子集化，一个 44KB 的 woff2 搞定。

## 配音

16. Edge-TTS 时长 ∝ 1/(1+语速%)。**逐句配速对齐目标时长**，换声音就不用重排画面。
17. 合成完必须过一遍响度（loudnorm -18），否则 34 句忽大忽小。
18. `say -v Tingting` 是离线兜底；音质不如 Edge，但断网能救急。

## 结构

19. `film.json` 是唯一事实来源；场景 HTML 是生成物，**别手改生成文件**。
20. 字幕托底用预模糊 PNG，**别给 34 条字幕各配一个 filter:blur**（heavy overlay + 拖慢渲染）。
21. 光晕/灯芯放进同一个 `<g class="lamp">`，一个 opacity 才能同时关掉两样。

## 渲染与工程

22. 渲染 100% 捕获完却报 `ENOENT ... copyfile frame_XXXXX.jpg` = capture 阶段撞了
    **600s 单阶段硬超时**（浏览器被强关的连锁反应，两次必现于 t=600s，不是随机竞态）。
    长片一律用 `HF_SEGMENTED_CAPTURE=true npx -y hyperframes render --resume`
    分段捕获：每段独立计时绕开上限，且更快（292s 片 11.5min → 7.5min）、可断点续渲。
23. `npx hyperframes ...` 首次运行会卡交互安装确认，**一律加 `-y`**。
24. 后台渲染任务会随会话中断被杀（输出目录为空 + 无进程），重跑前先看
    `renders/` 是否已有完整 mp4，别盲目重来。
25. 新建项目跑 check 前先确认 `hyperframes.json` 存在（build_film.py 已自动生成，
    老版本手工建的仓库要补）。
26. QA 脚本三连坑的教训：ffprobe 的 `-show_entries` 过滤后字段会缺失（按
    `codec_type` 匹配要在 show_entries 里显式列出）；loudnorm 的 JSON 用
    `json.loads` 解析，别手写切片（引号会混进数字里）；glob 通配符必须用
    `glob.glob`（`os.path.expanduser` 不展开 `*`）。

## 配色与构图（2026-10-28 补，都是真踩过的）

27. **`mk()` 里传 `innerHTML` 必须走属性**：`setAttribute("innerHTML", ...)` 只会加一个同名 attribute，
    `<filter>` 里永远没有 `feTurbulence` → 空滤镜 → **所有带 `filter: f.wob` 的图层整块不渲染**。
    症状：天空、地面、树全没了，只剩草和角色。修：`if (k === "innerHTML") el.innerHTML = attrs[k]`。
28. **每场第一个 `cam` 必须带 `from`（= 自己的 scale/focus）**。不钉住，第一帧会退回 `1.0 / 540`，
    地面线掉到 y≈1010，人物整只埋进字幕带。这一条一次就能造成十几处压字。
29. **地面线 ≤ 784**：`focus.y = ground - (screen_y - 540) / scale`。手填 focus.y 必翻车。
30. `npx hyperframes` 偶尔会卡在缓存重装（`ENOTEMPTY: rename .../hyperframes`，npm 还会报
    `CODEBUDDY_BROKER_DENY`）。别重试 npx：直接调缓存里的可执行文件
    `$(ls -t ~/.npm/_npx/*/node_modules/.bin/hyperframes | head -1) snapshot|render ...`。
31. **bash 里变量名后面紧跟中文全角字符会解析错**：`"$HF）"` 在部分 locale 下会把
    多字节字符当成变量名的一部分 → `HF…: unbound variable`。一律写 `"${HF}）"`。
32. **Windows 删目录联接不能用 `Remove-Item -Recurse`**：会连带删掉被链接目录里的文件。
    用 `[System.IO.Directory]::Delete($path, $false)` 或 `cmd /c rmdir`。
33. `check_framing` / `solve_framing` 都要做**纵向出画裁剪**：角色整体在画布下方
    （脚底 >1080）时不算压字，否则会误报几百 px；求解时对"正在出场/入场"的角色
    （可见部分 < 一半）也别追——强压镜头会把 focus 推到画布外，构图反而坏掉。
34. **浅色纸上，写死的深色阴影/斑块会变成黑水坑**：角色影、果子堆影、地面 patches、石头、
    栗子壳、草色，全部要进色板（`p.shadow` / `p.shadowOp` / `p.patchA` / `p.patchOp` / `p.chest` / `p.bladeA`）。
    影子颜色要比地面**深**（浅底上用米驼会变成一块白盘子）。
35. **一部片子一份 palette = 全片一个时刻 = 长得像模板**。按场次给 `scene.palette`，白天/夜/晨分开。
36. **一条字幕色不可能同时适配奶油白和普鲁士蓝**。用 `scene.captions.style`（dark-text / light-text），
    `build_film.py` 会逐条注入颜色和深/浅两张托底贴图。
37. **色号是受限选择**：`film.json` 写 `"C-34"`，`build_film.py` 解析成 hex，`--strict-palette` 拦自定义色。
    别凭记忆写 hex —— 36 色的真实色值要从 handraw-style 的色卡图采样（`scripts/color_lib.py`）。

## 声音（2026-10-28 补）

38. **固定预设 = 声音版的套模板**。旧 `make_audio.py` 的三套预设每套都带溪水+蟋蟀，
    结果"秋天的洞里"也在放河水和夏虫。现在必须写 `sound.scenes` 逐场列层，
    没列的一律不出声；兜底只有 `wind` + `leaves`。
39. **`--mood` 只管八音盒的写法**，不再决定有没有水声。想安静就减层数 + 压 `music.scenes`。
40. **全片级缓冲区一定用 float32**：339s 立体声 float64 要 260MB，再叠一份音乐轨就会被系统
    SIGKILL（exit 137，日志空白）。float32 + 原地 `*=` 就够。
41. **`hash()` 在 Python 里对字符串是随机的**，别拿它做随机种子（每次跑出来的音效都不一样）。
    用 `zlib.crc32(name.encode())`。

## 冬日 / 灯（2026-10-28 做《小獾的一盏小灯》踩的）

42. **GSAP 的 `fromTo` 默认 `immediateRender: true`**：排在时间轴后面的 `fromTo` 会在 t=0 就把"from"值写上去。
    结果 `rise`/`fade` 排在第 40 秒的角色，**从第一帧起就是隐形的**（小獾在 s7 整场消失）。
    入场类动作一律加 `immediateRender: false`，初始透明度靠 `characters[].opacity` 给。
43. **`sky` 层的矩形只画到地平线**：地平线和地面之间会露出 `#root` 的底色，变成一条横贯全屏的深色带。
    已改成画到 H+1000（贴底）；如果自己写天空层，记得画满。
44. **新角色要同步 `check_framing.py` 的 `CHAR_BOX`**，不然检查器直接跳过它 —— 全绿是假的。
45. **`farbank` 在雪景里会变成一条绿篱**（它是一条 6–36px 的锯齿带）。远景林线用 `pineRow`。
46. **光晕/光池别叠同心椭圆**：会有明显色阶，一眼假。用 `radial()` 径向渐变（world.js）/ `glowGrad()`（kit.js）。
47. **雪在夜里也是白的**。把夜里的雪压成 C-31/C-32 会变成"泥地"。夜里用 C-30 打底、C-33 做影，
    亮色仍旧只给灯 —— 灯是橙的，雪是中性白，两者不打架。
48. **字幕深浅看"字幕带后面是什么"**，不看整体情绪：雪地（亮）用 `dark-text`，全黑/暗底用 `light-text`。
    雪景用 `light-text` 会在雪上糊出一团深色。
49. **洞口别做成"一扇白门"**：`burrowIn` 的 `w` 要跟角色一个量级（小獾约 170–210），`springY` 抬高一点。
50. **提在手上的灯要把 `shadowOp` 设 0**，否则灯底下浮着一个黑影。

## 旁白 / 画面同步（2026-10-29 做《小乌龟阿壳的水洼天空》踩的，用户第一眼就看出来了）

51. **动作时间手填 = 一定会错位，而且看不出来。** 分镜里的 `t` 是按"当时那句台词大概在第几秒"
    手排的；只要语速一变（CPS、`--clamp`、配音实测回填），台词整体挪位，动作就全部错开。
    症状：1:00 叶子已经长在乌龟壳上，1:07 才念"顺手带了一片大叶子"；
    1:07 小鹿小兔开始消失，1:10 台词里小鹿还在问话。
    修：**动作绑台词**（`"cue": "v13"` + `cueOff`），`build_film.py` 用台词的实际起止算 `t`；
    `check_sync.py` 校验。别再手填。
52. **"消失"要用 `cueAt: "end"` 绑在它离场的那句上。** 绑 `start` 会让角色在台词中间开始淡出
    （小鹿一边说话一边变透明）。绑在"他们跑起来"那句的 end 之后才对。
53. **东西不能凭空出现。** 叶子、栗子、灯 —— 先把它们放进 `characters`（躺在地上、挂在墙上），
    等那句台词再 `move`/`lean` 到手上。"凭空出现"检查器抓不到，只能靠这条纪律。
54. **一句 6 秒的台词配着完全不动的画面 = 没表现这句。** `check_sync.py` 会提示"整句没有新动作"；
    实在不需要动作的（纯情绪停顿），至少要有一个镜头在动。
