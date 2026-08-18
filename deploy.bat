@echo off
chcp 65001 > nul
color 0A
echo ================================================
echo    WALLET APP -- Deploy das Edge Functions
echo ================================================
echo.

set PROJECT_DIR=C:\Users\Heitor\OneDrive\Documentos\New project\wallet-comparativos
set PROJECT_REF=hdeguzxkdvebdrrutbnx

echo [1/5] Acessando a pasta do projeto...
cd /d "%PROJECT_DIR%"

echo [2/5] Branch atual:
git branch

echo.
echo [3/5] Fazendo login no Supabase...
echo    (O navegador vai abrir para autenticacao)
supabase login

echo.
echo [4/5] Deployando Edge Functions...
echo.

echo Deployando openai-proxy...
supabase functions deploy openai-proxy --project-ref %PROJECT_REF%

echo.
echo Deployando telegram-webhook...
supabase functions deploy telegram-webhook --project-ref %PROJECT_REF%

echo.
echo Deployando eyemobile-sync...
supabase functions deploy eyemobile-sync --project-ref %PROJECT_REF%

echo.
echo [5/5] Concluido!
echo.
echo PROXIMOS PASSOS:
echo 1. Envie "Quanto vendeu hoje?" no Telegram
echo 2. Acesse: https://supabase.com/dashboard/project/%PROJECT_REF%/functions
echo 3. Va em Logs, selecione openai-proxy e analise
echo.
pause
