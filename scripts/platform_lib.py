#!/usr/bin/env python3
"""跨平台公共小工具：浏览器探测、国内镜像开关、GitHub 下载代理。

被 qa_check.py / make_voice.py / font_subset.py 等共用。
所有开关都走环境变量，不改变默认（海外/直连）行为：

  STV_CN=1              开启国内镜像（npm/pip/GitHub 下载）
  STV_GH_MIRROR=<前缀>  自定义 GitHub 代理，默认 https://ghfast.top/
  STV_PIP_INDEX=<url>   自定义 pip 源，默认清华 TUNA
  STV_NPM_REGISTRY=<url> 自定义 npm 源，默认 npmmirror
  HYPERFRAMES_BROWSER_PATH=<path> 直接指定浏览器，优先级最高
"""
import os
import shutil
import sys

TRUTHY = {"1", "true", "yes", "on", "y"}


# ---------- 平台 ----------

def is_windows():
    return os.name == "nt"


def is_macos():
    return sys.platform == "darwin"


def is_linux():
    return sys.platform.startswith("linux")


def platform_name():
    if is_windows():
        return "windows"
    if is_macos():
        return "macos"
    return "linux"


# ---------- 国内镜像 ----------

def cn_mode():
    """是否开启国内镜像。STV_CN=1 或 --cn 参数（调用方自行转成环境变量）。"""
    return os.environ.get("STV_CN", "").strip().lower() in TRUTHY


def gh_url(url):
    """国内模式下把 GitHub 直链改写成镜像前缀；非 GitHub 或未开启时原样返回。"""
    if not cn_mode() or "github.com" not in url:
        return url
    prefix = os.environ.get("STV_GH_MIRROR", "https://ghfast.top/").strip()
    if not prefix:
        return url
    if not prefix.endswith("/"):
        prefix += "/"
    return prefix + url


def npm_registry():
    """需要显式传 --registry 时用；未开镜像返回 None。"""
    if not cn_mode():
        return None
    return os.environ.get("STV_NPM_REGISTRY", "https://registry.npmmirror.com").strip()


def pip_index_args():
    """pip 命令行参数列表；未开镜像返回空列表。"""
    if not cn_mode():
        return []
    idx = os.environ.get("STV_PIP_INDEX", "https://pypi.tuna.tsinghua.edu.cn/simple").strip()
    return ["-i", idx, "--trusted-host", idx.split("/")[2]]


# ---------- 浏览器 ----------

def chrome_candidates():
    """按平台列出浏览器可执行文件的候选路径（Chrome 优先，其次 Chromium/Edge）。"""
    out = []
    if is_macos():
        out += [
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Chromium.app/Contents/MacOS/Chromium",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        ]
    elif is_windows():
        pf = os.environ.get("ProgramFiles", r"C:\Program Files")
        pf86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
        local = os.environ.get("LOCALAPPDATA", "")
        out += [
            os.path.join(pf, r"Google\Chrome\Application\chrome.exe"),
            os.path.join(pf86, r"Google\Chrome\Application\chrome.exe"),
            os.path.join(local, r"Google\Chrome\Application\chrome.exe") if local else "",
            os.path.join(pf86, r"Microsoft\Edge\Application\msedge.exe"),
            os.path.join(pf, r"Microsoft\Edge\Application\msedge.exe"),
        ]
    else:
        for name in ("google-chrome", "google-chrome-stable", "chromium",
                     "chromium-browser", "microsoft-edge"):
            p = shutil.which(name)
            if p:
                out.append(p)
        out += ["/usr/bin/google-chrome", "/usr/bin/chromium", "/snap/bin/chromium"]
    return [p for p in out if p]


def chrome_path():
    """返回可用的浏览器路径；找不到返回 None。"""
    p = os.environ.get("HYPERFRAMES_BROWSER_PATH")
    if p and os.path.exists(p):
        return p
    for c in chrome_candidates():
        if os.path.exists(c):
            return c
    return None


def npx_bin_dirs():
    """npx 缓存里 node_modules/.bin 的候选目录（各平台缓存位置不同）。"""
    home = os.path.expanduser("~")
    dirs = [os.path.join(home, ".npm", "_npx")]
    if is_windows():
        local = os.environ.get("LOCALAPPDATA")
        if local:
            dirs.append(os.path.join(local, "npm-cache", "_npx"))
    else:
        dirs.append(os.path.join(home, ".cache", "npm", "_npx"))
    return [d for d in dirs if os.path.isdir(d)]


def hyperframes_bin():
    """找 npx 缓存里的 hyperframes 可执行文件，返回绝对路径或 None。"""
    import glob as _glob
    env = os.environ.get("HYPERFRAMES_BIN")
    if env and os.path.exists(env):
        return env
    exe = "hyperframes.cmd" if is_windows() else "hyperframes"
    for base in npx_bin_dirs():
        hits = sorted(_glob.glob(os.path.join(base, "*", "node_modules", ".bin", exe)),
                      reverse=True)
        if hits:
            return hits[0]
    return None


if __name__ == "__main__":
    print("platform:", platform_name())
    print("cn_mode :", cn_mode())
    print("chrome  :", chrome_path())
    print("hf bin  :", hyperframes_bin())
    if cn_mode():
        print("npm reg :", npm_registry())
        print("pip args:", " ".join(pip_index_args()))
