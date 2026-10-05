$ErrorActionPreference = "Stop"

$TaskName = "MonitorIA Meeting RTMP Bridge"
$InstallDir = Join-Path $env:ProgramData "MonitorIA\MeetingRTMP"
$Log = Join-Path $InstallDir "mediamtx.log"
$Rtsp = "rtsp://127.0.0.1:8554/meeting"

Write-Host "MonitorIA / Meeting RTMP Bridge - diagnóstico" -ForegroundColor Cyan

try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
    $info = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Tarefa: $($task.State), último resultado: $($info.LastTaskResult)"
}
catch {
    Write-Host "Tarefa agendada não encontrada." -ForegroundColor Red
}

$tcp = Test-NetConnection 127.0.0.1 -Port 8554 -WarningAction SilentlyContinue
if ($tcp.TcpTestSucceeded) {
    Write-Host "RTSP local 127.0.0.1:8554: OK" -ForegroundColor Green
}
else {
    Write-Host "RTSP local 127.0.0.1:8554: INDISPONÍVEL" -ForegroundColor Red
}

$ffprobe = Get-Command ffprobe -ErrorAction SilentlyContinue
if ($ffprobe) {
    Write-Host "Testando mídia com ffprobe..."
    & $ffprobe.Source `
        -v error `
        -rtsp_transport tcp `
        -select_streams v:0 `
        -show_entries stream=codec_name,width,height,avg_frame_rate `
        -of default=noprint_wrappers=1 `
        $Rtsp

    if ($LASTEXITCODE -eq 0) {
        Write-Host "Vídeo RTSP local decodificável: OK" -ForegroundColor Green
    }
    else {
        Write-Host "ffprobe não conseguiu ler o vídeo." -ForegroundColor Yellow
    }
}
else {
    Write-Host "ffprobe não está no PATH; o Agent fará a validação final." -ForegroundColor DarkGray
}

if (Test-Path $Log) {
    Write-Host ""
    Write-Host "Últimas linhas do MediaMTX:"
    Get-Content $Log -Tail 20
}

Write-Host ""
Write-Host "URL para o Agent: $Rtsp" -ForegroundColor Cyan
