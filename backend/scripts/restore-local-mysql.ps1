<#
.SYNOPSIS
  从 backup-local-mysql.ps1 产出的备份恢复本地 MySQL（2026-11-23）
.DESCRIPTION
  换电脑 / U 盘拿回来时用这个脚本，不需要再连生产。
  恢复前会自动把现有库备份成 *_pre_restore 文件，避免误覆盖。
.EXAMPLE
  .\restore-local-mysql.ps1 -From 'D:\AI-Anime-backups\ai_anime-local-20261123_170000.sql.gz'
  .\restore-local-mysql.ps1 -From 'E:\usb\ai_anime-local-20261123_170000.sql.gz.enc' -Decrypt
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$From,
  [switch]$Decrypt,
  [string]$DbName = 'ai_anime',
  [string]$RootUser = 'root',
  [string]$RootPass = '',          # 本机 root 是 --initialize-insecure 建的空口令；有口令用环境变量 AIANIME_ROOT_PASS
  [string]$Host_ = '127.0.0.1',
  [int]$Port = 3306
)
$ErrorActionPreference = 'Stop'
if ($env:AIANIME_ROOT_PASS) { $RootPass = $env:AIANIME_ROOT_PASS }

$mysqlBin = 'C:\Program Files\MySQL\MySQL Server 8.4\bin'
$mysql = Join-Path $mysqlBin 'mysql.exe'
if (-not (Test-Path -LiteralPath $mysql)) { throw "找不到 mysql.exe：$mysql" }
if (-not (Test-Path -LiteralPath $From)) { throw "备份文件不存在：$From" }

$work = Join-Path $env:TEMP ("restore-" + (Get-Date -Format 'yyyyMMddHHmmss') + '.sql')

if ($Decrypt) {
  Write-Host "[1/4] AES 解密 $From" -ForegroundColor Cyan
  $cred = Read-Host -Prompt '备份口令' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred))
  $bytes = [System.IO.File]::ReadAllBytes($From)
  $salt = $bytes[0..15]; $iv = $bytes[16..31]; $body = $bytes[32..($bytes.Length - 1)]
  $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($plain, [byte[]]$salt, 200000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $key = $derive.GetBytes(32); $derive.Dispose()
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.Key = $key; $aes.IV = [byte[]]$iv
  $dec = $aes.CreateDecryptor()
  $gzBytes = $dec.TransformFinalBlock($body, 0, $body.Length)
  $aes.Dispose()
  $tmpGz = "$work.gz"
  [System.IO.File]::WriteAllBytes($tmpGz, $gzBytes)
  $src = $tmpGz
} else { $src = $From }

if ($src -like '*.gz') {
  Write-Host "[2/4] 解压" -ForegroundColor Cyan
  $in = [System.IO.File]::OpenRead($src)
  $gz = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
  $out = [System.IO.File]::Create($work)
  $gz.CopyTo($out); $out.Close(); $gz.Close(); $in.Close()
} else { Copy-Item -LiteralPath $src -Destination $work -Force }

$tail = Get-Content -LiteralPath $work -Tail 1 -Encoding UTF8
if ($tail -notmatch 'Dump completed') { throw "备份不完整（末行不是 'Dump completed'），拒绝恢复" }
Write-Host "[3/4] 完整性 OK，准备导入 $DbName" -ForegroundColor Cyan

if ($RootPass) { $env:MYSQL_PWD = $RootPass } else { $env:MYSQL_PWD = '' }
# 现有库先留一份回滚点（注意：--databases/--result-file 是 mysqldump 的选项，不是 mysql 客户端的）
$mysqldump = Join-Path $mysqlBin 'mysqldump.exe'
$pre = Join-Path $env:TEMP ("pre_restore_" + (Get-Date -Format 'yyyyMMddHHmmss') + ".sql")
$exists = & $mysql -h $Host_ -P $Port -u $RootUser -N -B -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='$DbName'"
if ([int]$exists -gt 0) {
  & $mysqldump -h $Host_ -P $Port -u $RootUser --no-tablespaces --single-transaction --databases $DbName --result-file=$pre
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pre) -or (Get-Item -LiteralPath $pre).Length -lt 1024) {
    throw "覆盖前快照失败（exit=$LASTEXITCODE），为安全起见中止恢复，未改动现有库"
  }
  Write-Host "       已保存覆盖前快照：$pre（$([math]::Round((Get-Item -LiteralPath $pre).Length/1KB,1)) KB）" -ForegroundColor DarkGray
}

$cmdLine = '"' + $mysql + '" -h ' + $Host_ + ' -P ' + $Port + ' -u ' + $RootUser + ' --default-character-set=utf8mb4 < "' + $work + '"'; cmd /c $cmdLine
$code = $LASTEXITCODE
$env:MYSQL_PWD = $null
Remove-Item -LiteralPath $work -Force -ErrorAction SilentlyContinue
if ($code -ne 0) { throw "导入失败 exit=$code（覆盖前快照：$pre）" }

$tbl = & $mysql -h $Host_ -P $Port -u $RootUser -N -B -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DbName'"
Write-Host "[4/4] 恢复完成：$DbName 现有 $tbl 张表" -ForegroundColor Green
Write-Host "       记得确认 backend\.env 与 .env.local 的 DB_USER/DB_PASSWORD 与本机一致"
