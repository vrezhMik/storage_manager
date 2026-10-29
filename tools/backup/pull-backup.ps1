# Downloads the server's latest backup (made nightly by backup.sh) to this
# computer and keeps the last 30. Run by a Windows scheduled task.
#
# The SSH key used here can only download that file: on the server its line
# in ~/.ssh/authorized_keys starts with
#   command="cat ~/backups/latest.tar.gz",restrict
param(
    [string]$Dest = "C:\Flexit-backup",
    [string]$Server = "deploy@78.47.218.84",
    [string]$Key = "$env:USERPROFILE\.ssh\flexit_backup",
    [int]$Keep = 30
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
$log = Join-Path $Dest "backup.log"
$file = Join-Path $Dest ("flexit-{0}.tar.gz" -f (Get-Date -Format "yyyy-MM-dd"))
$tmp = "$file.part"

function Write-Log([string]$text) {
    Add-Content -Path $log -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $text) -Encoding UTF8
}

try {
    # cmd keeps the bytes as they are (PowerShell 5 redirection would re-encode them).
    cmd /c "ssh -i `"$Key`" -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 $Server > `"$tmp`""
    if ($LASTEXITCODE -ne 0) { throw "ssh exit code $LASTEXITCODE" }

    $bytes = [System.IO.File]::ReadAllBytes($tmp)
    if ($bytes.Length -lt 1024 -or $bytes[0] -ne 0x1F -or $bytes[1] -ne 0x8B) {
        throw "downloaded file is not a backup ($($bytes.Length) bytes)"
    }
    Move-Item -Force $tmp $file

    Get-ChildItem $Dest -Filter "flexit-*.tar.gz" | Sort-Object Name -Descending | Select-Object -Skip $Keep | Remove-Item
    Write-Log ("OK {0} ({1:N1} MB)" -f (Split-Path $file -Leaf), ($bytes.Length / 1MB))
}
catch {
    if (Test-Path $tmp) { Remove-Item $tmp }
    Write-Log "FAILED $($_.Exception.Message)"
    exit 1
}
