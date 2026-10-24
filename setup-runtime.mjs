/**
 * 墨排 Mopai — 重建嵌入式 Python 运行时（runtime/）
 *
 * 与上游 setup-runtime.cmd 的 5 个步骤等价，区别只在「下载器」和「pip 引导」：
 *
 *  1. 下载器换成 Node：上游用系统 `python -c urllib...` 下载，而本机 PATH 上的
 *     python.exe 是 Microsoft Store 的 0 字节占位符，无法执行任何代码；本机
 *     schannel/.NET TLS 也不可用，Node 走自带 OpenSSL 正常。
 *  2. 不用 get-pip.py：镜像上那份捆绑的 pip 过旧，在 Python 3.12 上会
 *     ModuleNotFoundError: No module named 'distutils'（3.12 已移除 distutils）。
 *     改为取镜像上最新的 pip / setuptools / wheel wheel，直接解压进
 *     Lib\site-packages 完成引导（wheel 就是 zip，purelib 布局与 site-packages 一致；
 *     不能跑 "python <wheel>/pip install <wheel>"，pip 会拒绝修改自身）。
 *  3. setuptools 是必需的：pywebview 的依赖 proxy_tools 只发布 sdist（没有 wheel），
 *     需要 setuptools 现场构建，因此安装时带 --no-build-isolation。
 *
 * Node 在这里「只当下载器」：应用真正的引擎是项目内 runtime\ 里的嵌入式
 * Python 3.12.9。全程只写项目目录，不碰系统、不写 %LOCALAPPDATA%。
 *
 * 前置条件：本机要有 .NET 桌面运行时 8.0 或更高（Microsoft.WindowsDesktop.App）。
 * Python 引擎和依赖都在 runtime\ 里，但 pythonnet 的 CLR 宿主由系统的 .NET 提供
 * （和 WebView2 运行时一样是 Windows 平台的既有组件，项目不自带）。脚本开头会先
 * 检查它：缺了就在下载任何东西之前失败，而不是等 app.py 起来才报 ClrError。
 *
 * 子进程的 TEMP/TMP 一律重定向到项目内 .tmp\：pip 默认把临时文件写到用户 Temp，
 * 既违背「项目文件留在项目内」，在受限沙箱下也会直接写失败（tempfile.mkdtemp
 * 用 0o700 建目录，在 Windows 上会绕开工作区目录的权限继承）。
 *
 * 用法：node setup-runtime.mjs   （幂等，可重复执行）
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.join(ROOT, 'runtime');
const SITE_PACKAGES = path.join(RUNTIME, 'Lib', 'site-packages');
const TMP = path.join(ROOT, '.tmp');
const PY_EXE = path.join(RUNTIME, 'python.exe');

const PYVER = '3.12.9';
const ZIP_URL = `https://registry.npmmirror.com/-/binary/python/${PYVER}/python-${PYVER}-embed-amd64.zip`;
const INDEX_URL = 'https://mirrors.aliyun.com/pypi/simple/';
const REQUIREMENTS = path.join(ROOT, 'requirements.txt');
const WINFORMS_PY = path.join(SITE_PACKAGES, 'webview', 'platforms', 'winforms.py');

// 补丁标记：出现过就说明对应的改动已经打过，避免重复改写
const PATCH_MARKER_EVENTS = '# --- 本地补丁：CoreCLR 下 SystemEvents 需要显式引用 ---';
const PATCH_MARKER_FOLDER = '# --- 本地补丁：CoreCLR 兼容的文件夹选择对话框 ---';

// pywebview 6.2.1 自带的 WebView2 SDK 版本（webview/lib/*.dll 的 FileVersion）。
// 必须在同一个 NuGet 包里取「同一版本的 .NET Core 版」程序集，版本不一致会导致
// pywebview 调用的 API 对不上；下面的 winforms 导入自检会兜住这种偏差。
const WEBVIEW2_SDK = '1.0.3856.49';
const WEBVIEW2_NUPKG =
  `https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/${WEBVIEW2_SDK}/` +
  `microsoft.web.webview2.${WEBVIEW2_SDK}.nupkg`;

// 引导用工具：pip 自己，以及构建 sdist 必需 setuptools（wheel 作后备）
const BOOTSTRAP = [
  { pkg: 'pip', importName: 'pip' },
  { pkg: 'setuptools', importName: 'setuptools' },
  { pkg: 'wheel', importName: 'wheel' },
];

function log(msg) {
  console.log(msg);
}

function fail(msg, hint = '请检查网络后重试。') {
  console.error(`\n构建失败：${msg}`);
  console.error(hint);
  process.exit(1);
}

/**
 * 前置检查：.NET 桌面运行时 ≥ 8.0。
 *
 * mopai.runtimeconfig.json 声明最低 8.0.0 且 rollForward=Major，所以 8/9/10 都能跑；
 * 这里只判断「至少有一个满足要求的大版本」，具体选哪个仍由 hostfxr 按 runtimeconfig
 * 决定（不在这里复刻它的排序规则）。
 */
function requireDotnetDesktop() {
  const r = spawnSync('dotnet', ['--list-runtimes'], { encoding: 'utf8', windowsHide: true });
  const hint =
    '墨排的 pywebview 后端由 pythonnet 宿主在 .NET 上，缺它窗口根本起不来。\n' +
    '请安装 .NET Desktop Runtime 8.0 或更高版本后重跑本脚本：\n' +
    '  https://dotnet.microsoft.com/download/dotnet';
  if (r.error || r.status !== 0) {
    fail('找不到 dotnet 命令，无法确认 .NET 桌面运行时是否已安装。', hint);
  }
  const found = [...r.stdout.matchAll(/^Microsoft\.WindowsDesktop\.App (\d+)\.(\d+)\.(\d+)/gm)]
    .map((m) => ({ major: Number(m[1]), text: `${m[1]}.${m[2]}.${m[3]}` }))
    .sort((a, b) => b.major - a.major);
  if (!found.length || found[0].major < 8) {
    const have = found.length ? found.map((v) => v.text).join(', ') : '无';
    fail(`未找到 .NET 桌面运行时（Microsoft.WindowsDesktop.App）8.0+；已安装：${have}。`, hint);
  }
  log(`[0/5] .NET 桌面运行时 ${found[0].text} 已就位（mopai.runtimeconfig.json 要求 ≥ 8.0.0）\n`);
}

// 子进程统一环境：临时目录落在项目内；PYTHONNET_RUNTIME 与 app.py 顶部保持一致
// （pythonnet 3.x 的 Python.Runtime.dll 在本机只能由 CoreCLR 加载，.NET Framework
// 后端会 Failed to resolve Python.Runtime.Loader.Initialize）。
const childEnv = () => ({
  ...process.env,
  TEMP: TMP, TMP: TMP, TMPDIR: TMP,
  PYTHONNET_RUNTIME: 'coreclr',
  PYTHONNET_CORECLR_RUNTIME_CONFIG: path.join(ROOT, 'mopai.runtimeconfig.json'),
});

/** 以项目内临时目录作为 TEMP/TMP 运行子进程，stdout/stderr 直通。 */
function run(cmd, args) {
  fs.mkdirSync(TMP, { recursive: true });
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    windowsHide: true,
    env: childEnv(),
  });
  return r.status === 0;
}

/** 只取子进程退出码，不打印输出（用于能力探测）。 */
function probe(cmd, args) {
  fs.mkdirSync(TMP, { recursive: true });
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: true,
    env: childEnv(),
  });
  return r.status === 0;
}

/** 带重试的下载：返回字节数。网络在本机偶发 ECONNRESET，必须重试。 */
async function download(url, dest, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0) throw new Error('收到 0 字节');
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buf);
      return buf.length;
    } catch (e) {
      lastErr = e;
      if (i < tries - 1) {
        log(`    重试 ${i + 1}/${tries - 1}（${e.message}）...`);
        await new Promise((s) => setTimeout(s, 1500 * (i + 1)));
      }
    }
  }
  throw lastErr;
}

/** 在镜像索引里找某个包最新的 py3 纯 Python wheel。 */
async function latestWheel(pkg) {
  const base = `${INDEX_URL}${pkg}/`;
  const res = await fetch(base);
  if (!res.ok) throw new Error(`${pkg} 索引 HTTP ${res.status}`);
  const html = await res.text();
  const re = new RegExp(`^${pkg}-(\\d+(\\.\\d+)*)-(py3|py2\\.py3)-none-any\\.whl$`, 'i');
  const cands = [...html.matchAll(/href="([^"]+)"[^>]*>([^<]+)<\/a>/g)]
    .map((m) => ({ url: m[1], name: m[2] }))
    .filter((f) => re.test(f.name));
  if (!cands.length) throw new Error(`${pkg} 没有 py3 纯 Python wheel`);
  const ver = (n) => n.slice(pkg.length + 1, n.indexOf('-py')).split('.').map(Number);
  cands.sort((a, b) => {
    const A = ver(a.name), B = ver(b.name);
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      if ((A[i] || 0) !== (B[i] || 0)) return (A[i] || 0) - (B[i] || 0);
    }
    return 0;
  });
  const best = cands[cands.length - 1];
  return { name: best.name, url: new URL(best.url, base).href.split('#')[0] };
}

/** 把纯 Python wheel 直接解压进 site-packages（用于引导 pip/setuptools/wheel）。 */
async function bootstrap(pkg, importName) {
  if (probe(PY_EXE, ['-c', `import ${importName}`])) {
    log(`      ${pkg} 已就绪，跳过。`);
    return;
  }
  const wheel = await latestWheel(pkg);
  const dest = path.join(TMP, wheel.name);
  await download(wheel.url, dest);
  fs.mkdirSync(SITE_PACKAGES, { recursive: true });
  if (!run('tar', ['-xf', dest, '-C', SITE_PACKAGES])) {
    throw new Error(`解压 ${wheel.name} 失败`);
  }
  // wheel 里的 .data 目录需要按 purelib/platlib/scripts 分流，这里按「不该出现」处理
  const stray = fs.readdirSync(SITE_PACKAGES).filter((n) => n.endsWith('.data'));
  if (stray.length) throw new Error(`${wheel.name} 含需特殊处理的 ${stray.join(', ')}`);
  fs.rmSync(dest, { force: true });
  if (!probe(PY_EXE, ['-c', `import ${importName}`])) {
    throw new Error(`${pkg} 引导后仍无法 import ${importName}`);
  }
  log(`      ${pkg} → ${wheel.name}`);
}

/**
 * pywebview 6.x 的 winforms 后端只在 .NET Framework 上成立：它的 OpenFolderDialog
 * 用反射去拿 System.Windows.Forms 内部的 FileDialogNative+IFileDialog / +FOS，
 * 而这两个类型在 .NET 8 的 System.Windows.Forms 里根本不存在（连名字都搜不到），
 * 于是 CoreCLR 下 import webview.platforms.winforms 就会在类体求值时
 * AttributeError: 'NoneType' object has no attribute 'GetMethod'。
 * 本机 .NET Framework 又加载不了 pythonnet 的 Python.Runtime.dll
 * （FileLoadException 0x80131515），只能用 CoreCLR，所以必须打这个补丁。
 *
 * 做法：把 OpenFolderDialog 换成 .NET Core 原生支持的 FolderBrowserDialog
 * （仅单选；墨排只用单选文件夹）。返回契约与原实现一致：选中返回路径元组，
 * 取消返回 None。
 */
function patchPywebviewWinforms() {
  if (!fs.existsSync(WINFORMS_PY)) {
    throw new Error(`找不到 ${WINFORMS_PY}，pywebview 未正确安装？`);
  }
  let src = fs.readFileSync(WINFORMS_PY, 'utf8');
  let changed = false;

  // --- 补丁 1：显式引用 Microsoft.Win32.SystemEvents ---
  // .NET Framework 里它位于 System.dll，随框架自动可用；CoreCLR 下它是独立程序集
  // （由 Microsoft.WindowsDesktop.App 提供），不 AddReference 就会
  // ImportError: cannot import name 'SystemEvents' from 'Microsoft.Win32'。
  if (!src.includes(PATCH_MARKER_EVENTS)) {
    const anchorRe = /clr\.AddReference\('System\.Reflection'\)\r?\n/;
    const m = src.match(anchorRe);
    if (!m) throw new Error('winforms.py 结构不符：找不到 System.Reflection 引用行');
    src = src.replace(
      anchorRe,
      `${m[0]}${PATCH_MARKER_EVENTS}\nclr.AddReference('Microsoft.Win32.SystemEvents')\n`
    );
    changed = true;
  }

  // --- 补丁 2：OpenFolderDialog 改用 FolderBrowserDialog ---
  if (!src.includes(PATCH_MARKER_FOLDER)) {
    const start = src.indexOf('class OpenFolderDialog:');
    const end = src.indexOf('_main_window_created = Event()');
    if (start < 0 || end < 0 || end <= start) {
      throw new Error('winforms.py 结构不符：无法安全定位 OpenFolderDialog');
    }

    const replacement = `${PATCH_MARKER_FOLDER}

class OpenFolderDialog:
    """CoreCLR 兼容版文件夹选择对话框。

    上游实现依赖 System.Windows.Forms 内部的 FileDialogNative+IFileDialog / +FOS，
    该类型只存在于 .NET Framework；.NET 8 里没有，故改用 .NET Core 原生支持的
    FolderBrowserDialog。仅支持单选（allow_multiple 被忽略），墨排只用到单选。
    """

    @classmethod
    def show(cls, parent=None, initialDirectory=None, allow_multiple=False, title=None):
        dialog = WinForms.FolderBrowserDialog()
        dialog.Description = title or '选择文件夹'
        dialog.ShowNewFolderButton = True

        if initialDirectory:
            initial = str(initialDirectory)
            # pywebview 会把 HOMEPATH 这类不带盘符的路径传进来（如 \\Users\\0），补上盘符
            if initial.startswith(os.sep) and not initial.startswith(os.sep * 2):
                initial = os.environ.get('HOMEDRIVE', '') + initial
            if os.path.isdir(initial):
                dialog.SelectedPath = initial

        try:
            result = (
                dialog.ShowDialog(parent) if parent is not None else dialog.ShowDialog()
            )
        except Exception:
            result = dialog.ShowDialog()

        if result == WinForms.DialogResult.OK and dialog.SelectedPath:
            return (str(dialog.SelectedPath),)
        return None


`;
    src = src.slice(0, start) + replacement + src.slice(end);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(WINFORMS_PY, src, 'utf8');
    log('      winforms.py: SystemEvents 引用 + OpenFolderDialog → FolderBrowserDialog');
  } else {
    log('      补丁已存在，跳过。');
  }
}

/**
 * pywebview 自带的 Microsoft.Web.WebView2.{Core,WinForms}.dll 是 .NET Framework
 * （lib/net462）那一份：它的 Microsoft.Web.WebView2.WinForms.WebView2 继承了
 * System.Windows.Forms.ContextMenu，而该类型在 .NET Core 里已被移除，于是在
 * CoreCLR 下会 TypeLoadException: Could not load type
 * 'System.Windows.Forms.ContextMenu'。同一个 NuGet 包里另有 .NET Core 版
 * （lib_manual/netcoreapp3.0），换成它即可。用程序集里记录的
 * TargetFrameworkAttribute 判断当前是哪一版，天然幂等，也不怕 pip 重装覆盖。
 */
async function patchWebView2Assemblies() {
  const libDir = path.join(SITE_PACKAGES, 'webview', 'lib');
  const files = ['Microsoft.Web.WebView2.Core.dll', 'Microsoft.Web.WebView2.WinForms.dll'];
  for (const f of files) {
    if (!fs.existsSync(path.join(libDir, f))) {
      throw new Error(`找不到 pywebview 自带的 ${f}`);
    }
  }
  // 注意用 WinForms.dll 判定：只有它带 TargetFrameworkAttribute
  // （net462 版是 .NETFramework,Version=v4.6.2，.NET Core 版是 .NETCoreApp,Version=v3.0）；
  // 同包的 Core.dll 两种版本都不带该标记。
  const isCoreClr = () =>
    fs
      .readFileSync(path.join(libDir, 'Microsoft.Web.WebView2.WinForms.dll'))
      .includes(Buffer.from('.NETCoreApp', 'utf8'));

  if (isCoreClr()) {
    log('      WebView2 程序集已是 .NET Core 版，跳过。');
    return;
  }

  const nupkg = path.join(TMP, `microsoft.web.webview2.${WEBVIEW2_SDK}.nupkg`);
  if (!fs.existsSync(nupkg)) {
    await download(WEBVIEW2_NUPKG, nupkg);
  }
  const staging = path.join(TMP, 'wv2');
  fs.mkdirSync(staging, { recursive: true });
  const entries = files.map((f) => `lib_manual/netcoreapp3.0/${f}`);
  if (!run('tar', ['-xf', nupkg, '-C', staging, ...entries])) {
    throw new Error('解压 WebView2 NuGet 包失败');
  }
  for (const f of files) {
    fs.copyFileSync(path.join(staging, 'lib_manual', 'netcoreapp3.0', f), path.join(libDir, f));
  }
  if (!isCoreClr()) throw new Error('替换后仍不是 .NET Core 版程序集');
  log(`      WebView2 程序集 → .NET Core 版（SDK ${WEBVIEW2_SDK}）`);
}

log(`墨排 Mopai — 构建嵌入式 Python ${PYVER} 运行时（全程在项目目录内）\n`);

requireDotnetDesktop();

// ---------- [1/5] ~ [3/5] 只在缺少解释器时执行（幂等） ----------

if (!fs.existsSync(PY_EXE)) {
  log(`[1/5] 下载嵌入式 Python ${PYVER} ...`);
  const zipPath = path.join(RUNTIME, 'python-embed.zip');
  let size;
  try {
    size = await download(ZIP_URL, zipPath);
  } catch (e) {
    fail(`下载嵌入式 Python 失败：${e.message}`);
  }
  log(`      已下载 ${(size / 1048576).toFixed(1)} MB`);

  log('[2/5] 解压 ...');
  if (!run('tar', ['-xf', zipPath, '-C', RUNTIME])) {
    log('      tar 解压失败，改用 Expand-Archive ...');
    if (!run('powershell', ['-NoProfile', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${RUNTIME}' -Force`])) {
      fail('解压嵌入式 Python 压缩包失败');
    }
  }
  fs.rmSync(zipPath, { force: true });

  if (!fs.existsSync(PY_EXE)) fail('解压后未找到 runtime\\python.exe');

  log('[3/5] 启用 site-packages ...');
  fs.writeFileSync(
    path.join(RUNTIME, 'python312._pth'),
    ['python312.zip', '.', 'Lib\\site-packages', 'import site'].join('\r\n') + '\r\n'
  );
} else {
  log('[1/5] ~ [3/5] runtime\\python.exe 已存在，跳过下载与解压。');
}

// ---------- [4/5] 引导 pip / setuptools ----------

log('[4/5] 引导 pip 与构建工具 ...');
for (const { pkg, importName } of BOOTSTRAP) {
  try {
    await bootstrap(pkg, importName);
  } catch (e) {
    fail(`引导 ${pkg} 失败：${e.message}`);
  }
}

// ---------- [5/5] 安装依赖 ----------

log('[5/5] 安装依赖（pywebview 等）...');
const pipArgs = [
  '-m', 'pip', 'install',
  '-r', REQUIREMENTS,
  '-i', INDEX_URL,
  '--no-warn-script-location',
  '--disable-pip-version-check',
  // pip 默认把 wheel 缓存写到 %LOCALAPPDATA%\pip\Cache —— 坚持「项目文件留在项目内」
  '--no-cache-dir',
  // proxy_tools 只有 sdist，用已引导进 runtime 的 setuptools 现场构建
  '--no-build-isolation',
];
if (!run(PY_EXE, pipArgs)) fail('pip 安装依赖失败');

// ---------- 本地补丁：pywebview 的 CoreCLR 兼容 ----------

log('[补丁] 应用 pywebview 的 CoreCLR 兼容补丁 ...');
try {
  await patchWebView2Assemblies();
  patchPywebviewWinforms();
} catch (e) {
  fail(`应用补丁失败：${e.message}`);
}

if (!probe(PY_EXE, ['-c', 'import webview, clr, websocket, proxy_tools'])) {
  fail('依赖已安装但 import webview / clr / websocket / proxy_tools 失败');
}
// 真正端到端的自检：winforms 后端能导入，才说明 CLR + WebView2 程序集 + 补丁都对
if (!probe(PY_EXE, ['-c', 'import webview.platforms.winforms'])) {
  fail('pywebview 的 winforms 后端无法导入（CLR 运行时配置或补丁有问题）');
}

log('\n完成！双击 mopai.cmd 启动墨排。');
