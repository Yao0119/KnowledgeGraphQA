param(
    [string]$Neo4jHome = "D:\E\neo4j-community-2025.03.0",
    [string]$DumpDir = (Join-Path $env:TEMP "kgqa-neo4j-dump")
)

$ErrorActionPreference = "Stop"
$admin = Join-Path $Neo4jHome "bin\neo4j-admin.bat"
$log = Join-Path $env:TEMP "kgqa-neo4j-dump.log"
$wasRunning = $false

if (-not (Test-Path -LiteralPath $admin)) {
    throw "neo4j-admin not found: $admin"
}

Start-Transcript -Path $log -Force | Out-Null
try {
    $service = Get-Service -Name "neo4j"
    $wasRunning = $service.Status -eq "Running"
    if ($wasRunning) {
        Stop-Service -Name "neo4j" -Force
        $service.WaitForStatus("Stopped", [TimeSpan]::FromMinutes(3))
    }

    New-Item -ItemType Directory -Force -Path $DumpDir | Out-Null
    & $admin database dump neo4j "--to-path=$DumpDir" "--overwrite-destination=true" "--verbose"
    if ($LASTEXITCODE -ne 0) {
        throw "neo4j-admin dump failed with exit code $LASTEXITCODE"
    }

    Get-ChildItem -LiteralPath $DumpDir -Filter "*.dump" |
        Select-Object FullName, Length, LastWriteTime |
        Format-List
}
finally {
    if ($wasRunning) {
        $service = Get-Service -Name "neo4j"
        if ($service.Status -ne "Running") {
            Start-Service -Name "neo4j"
            $service.WaitForStatus("Running", [TimeSpan]::FromMinutes(5))
        }
    }
    Stop-Transcript | Out-Null
}
