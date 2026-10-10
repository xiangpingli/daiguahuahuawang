@echo off
chcp 65001 >nul
title 呆瓜画画网保活服务
cd /d %~dp0
echo [%date% %time%] 呆瓜画画网保活服务已启动 >> service.log

:loop
netstat -ano | findstr "LISTENING" | findstr ":9999" >nul
if not errorlevel 1 (
    timeout /t 5 /nobreak >nul
    goto loop
)
echo [%date% %time%] 服务未运行，正在启动... >> service.log
cd /d %~dp0backend
python main.py >> ..\service.log 2>&1
echo [%date% %time%] 服务已退出，5 秒后自动重启... >> service.log
cd /d %~dp0
timeout /t 5 /nobreak >nul
goto loop
