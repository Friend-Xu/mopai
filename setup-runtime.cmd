@echo off
rem ============================================================
rem 墨排 Mopai — 重建嵌入式 Python 运行时（runtime/）
rem 在缺失 runtime 的新机器上运行一次即可。全程在项目目录内完成。
rem 需要系统装有 Python 3（仅用于下载，不装入系统）。
rem ============================================================
cd /d "%~dp0"

if exist runtime\python.exe (
  echo runtime 已存在，无需重建。
  exit /b 0
)

set PYVER=3.12.9
set ZIPURL=https://registry.npmmirror.com/-/binary/python/%PYVER%/python-%PYVER%-embed-amd64.zip

echo [1/5] 下载嵌入式 Python %PYVER% ...
mkdir runtime 2>nul
python -c "import urllib.request,shutil;urllib.request.urlretrieve('%ZIPURL%','runtime/python-embed.zip')" || goto :err

echo [2/5] 解压 ...
python -c "import zipfile;zipfile.ZipFile('runtime/python-embed.zip').extractall('runtime')" || goto :err
del runtime\python-embed.zip

echo [3/5] 启用 site-packages ...
(
echo python312.zip
echo .
echo Lib\site-packages
echo import site
) > runtime\python312._pth

echo [4/5] 引导 pip ...
python -c "import urllib.request;urllib.request.urlretrieve('https://mirrors.aliyun.com/pypi/get-pip.py','runtime/get-pip.py')" || goto :err
runtime\python.exe runtime/get-pip.py --no-warn-script-location || goto :err
del runtime\get-pip.py

echo [5/5] 安装依赖（pywebview 等）...
runtime\python.exe -m pip install pywebview pythonnet websocket-client -i https://mirrors.aliyun.com/pypi/simple/ --no-warn-script-location || goto :err

echo.
echo 完成！双击 mopai.cmd 启动墨排。
exit /b 0

:err
echo.
echo 构建失败，请检查网络后重试。
exit /b 1
