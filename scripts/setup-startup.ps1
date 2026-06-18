# Create Windows scheduled task for WeCom Bot auto-start
$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c cd /d D:\projects\wechat-ai-bot && pm2 resurrect'
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest
Register-ScheduledTask -TaskName 'WeComBotPM2' -Action $action -Trigger $trigger -Principal $principal -Force
Write-Host "Scheduled task 'WeComBotPM2' created successfully"
