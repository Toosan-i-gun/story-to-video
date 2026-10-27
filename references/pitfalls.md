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

22. 渲染 100% 捕获完却在收尾报 `ENOENT ... copyfile frame_XXXXX.jpg` =
    浏览器强关与最终帧拷贝的**竞态，属偶发**，直接重跑即可（可降到 3 workers）。
    别误判成项目问题去改 film.json。
23. `npx hyperframes ...` 首次运行会卡交互安装确认，**一律加 `-y`**。
24. 后台渲染任务会随会话中断被杀（输出目录为空 + 无进程），重跑前先看
    `renders/` 是否已有完整 mp4，别盲目重来。
25. 新建项目跑 check 前先确认 `hyperframes.json` 存在（build_film.py 已自动生成，
    老版本手工建的仓库要补）。
