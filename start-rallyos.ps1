# RallyOS — Pickleball Game & Tournament Management Platform Launcher
$lanIps = @(
  [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object {
      $_.OperationalStatus -eq 'Up' -and
      $_.NetworkInterfaceType -ne 'Loopback'
    } |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    Where-Object {
      $_.Address.AddressFamily -eq 'InterNetwork' -and
      $_.Address.IPAddressToString -notmatch '^(127\.|169\.254\.)'
    } |
    ForEach-Object { $_.Address.IPAddressToString } |
    Select-Object -Unique
)

Write-Host "Starting RallyOS Backend (FastAPI on http://0.0.0.0:8000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location 'd:\rallyos\backend'; .\.venv\Scripts\uvicorn.exe app.main:app --reload --host 0.0.0.0 --port 8000"

Write-Host "Starting RallyOS Frontend (React + Vite on http://0.0.0.0:5173)..." -ForegroundColor Green
Write-Host "  Local:   http://127.0.0.1:5173" -ForegroundColor Gray
foreach ($ip in $lanIps) {
  Write-Host "  Network: http://$($ip):5173" -ForegroundColor Yellow
}

Set-Location "d:\rallyos\frontend"
npm run dev -- --host 0.0.0.0

