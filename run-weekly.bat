@echo off
cd /d "%~dp0"
call npm run scan
call npm run briefing
