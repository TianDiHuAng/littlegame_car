@echo off
chcp 65001 >nul
cd /d "%~dp0.."
echo ============================================
echo  亮车计划 - 测试
echo ============================================
echo.

echo [1/3] 构建小游戏包
node tools\bundle.mjs
node tools\build-minigame.mjs
if errorlevel 1 goto fail

echo.
echo [2/3] 严苛环境测试（wx-shim）
node tools\envtest.mjs
if errorlevel 1 goto fail

echo.
echo [3/3] 适配层专项测试（adapter.js + 假 wx）
node tools\adaptertest.mjs
if errorlevel 1 goto fail

echo.
echo 全部完成
pause
exit /b 0

:fail
echo.
echo *** 有测试失败 ***
pause
exit /b 1
