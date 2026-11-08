# 新歌工作站：Windows 安裝（第一次，或補裝缺的東西）
# 用 winget 裝 Git、Node.js、FFmpeg、uv，再用 uv 建工作站的 Python 環境（yt-dlp 等）
# 「工作站.bat」發現缺東西時會自動叫這支；也可以自己跑：
#   powershell -NoProfile -ExecutionPolicy Bypass -File tools\studio\setup\setup-windows.ps1
[Console]::OutputEncoding = [Text.Encoding]::UTF8
Set-Location (Join-Path $PSScriptRoot "..\..\..")

function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function RefreshPath { $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User") }

if (-not (Has "winget")) {
  Write-Host "找不到 winget。請到 Microsoft Store 安裝或更新「應用程式安裝程式」（App Installer），再點一次。"
  exit 1
}

$need = @(
  @{ cmd = "git";    id = "Git.Git";           name = "Git" },
  @{ cmd = "node";   id = "OpenJS.NodeJS.LTS"; name = "Node.js" },
  @{ cmd = "ffmpeg"; id = "Gyan.FFmpeg";       name = "FFmpeg" },
  @{ cmd = "uv";     id = "astral-sh.uv";      name = "uv（Python 環境管理）" }
)
foreach ($p in $need) {
  if (Has $p.cmd) { Write-Host "OK  $($p.name)"; continue }
  Write-Host "安裝 $($p.name)…"
  winget install --id $p.id -e --silent --accept-source-agreements --accept-package-agreements
  RefreshPath
  if (-not (Has $p.cmd)) {
    Write-Host "裝好了但這個視窗還找不到 $($p.cmd)。請關掉視窗，再點一次「工作站.bat」。"
    exit 1
  }
}

Write-Host "建立 Python 環境（第一次要下載 PyTorch 顯卡版等，約 3–4 GB，請稍等）…"
uv sync --project tools/studio/py
if ($LASTEXITCODE -ne 0) { Write-Host "Python 環境建立失敗，請把上面的訊息貼給 Claude 看。"; exit 1 }

# 人聲分離、自動對時會用顯卡：確認 PyTorch 真的用得到
$cuda = uv run --project tools/studio/py python -c "import torch; print('yes' if torch.cuda.is_available() else 'no')"
if ($cuda -match "yes") { Write-Host "OK  PyTorch 可以用 NVIDIA 顯卡（人聲分離、自動對時會加速）" }
elseif (Has "nvidia-smi") { Write-Host "--  有 NVIDIA 顯卡，但 PyTorch 用不到：請到 NVIDIA 官網更新顯示卡驅動程式（需要 570 版以上），更新前會用 CPU，比較慢" }
else { Write-Host "--  沒偵測到 NVIDIA 顯卡：人聲分離、自動對時會用 CPU，比較慢" }
Write-Host ""
Write-Host "安裝完成。"
