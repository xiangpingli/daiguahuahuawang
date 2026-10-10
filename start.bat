@echo off
chcp 65001 >nul
title 呆瓜画画网
echo ================================================
echo   呆瓜画画网 启动脚本
echo   服务地址: http://localhost:9999
echo ================================================

cd /d %~dp0

if not exist "frontend\dist\index.html" (
    echo [1/2] 首次启动，正在构建前端...
    cd frontend
    call npm install
    call npm run build
    cd ..
)
echo [2/2] 启动后端服务（9999端口）...
cd backend
python main.py

pause
