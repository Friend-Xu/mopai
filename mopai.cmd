@echo off
rem 墨排 Mopai 一键启动（嵌入式 Python，无需安装任何环境）
cd /d "%~dp0"
start "" "runtime\pythonw.exe" app.py
