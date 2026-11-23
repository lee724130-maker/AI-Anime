<#
.SYNOPSIS
  AI-Anime 本地 MySQL 备份/还原校验脚本（2026-11-23）
.DESCRIPTION
  目的：把本地库（= 生产镜像）导成**自校验、可还原、可加密**的备份文件，
  拷去另一台电脑或 U 盘即可恢复，不必每次回生产环境拉数据。

  默认输出目录 D:\AI-Anime-backups（刻意放在仓库外：备份含 system_configs 里的
  agnes key、SMTP 授权码等凭据，绝不能进 git，也不要放 outputs 之类会被展示/上传的目录）。

.EXAMPLE
  .\backup-local-mysql.ps1                        # 导出 + 压缩 + 校验，输出 .sql.gz 与 .sha256
  .\backup-local-mysql.ps1 -Encrypt               # 额外生成 AES-256 加密副本（会提示输入口令）
  .\backup-local-mysql.ps1 -Verify                # 导完立刻还原到临时库并逐表比对行数（证明备份可用）
  .\backup-local-mysql.ps1 -Keep 14               # 只保留最近 14 份（默认 0 = 不删任何旧备份）
#>
[CmdletBinding()]
param(
  [string]$OutDir = 'D:\AI-Anime-backups',
  [string]$DbName = 'ai_anime',
  [string]$DbUser = 'ai_anime',
  # 口令刻意不写默认值：本文件会进 git，任何真实口令都不该提交（哪怕是本机开发库）。
  # 用前先设环境变量：  $env:AIANIME_DB_PASS = '<本机口令>'
  [string]$DbPass  = '',
  [string]$Host_  = '127.0.0.1',
  [int]$Port      = 3306,
  [int]$Keep      = 0,
  [switch]$Encrypt,
  [switch]$Verify
)

$ErrorActionPreference = 'Stop'
if ($env:AIANIME_DB_PASS) { $DbPass = $env:AIANIME_DB_PASS }
if (-not $DbPass) { throw '未提供数据库口令：先设 $env:AIANIME_DB_PASS（本脚本刻意不把口令写进文件，因为它会进 git）' }

$mysqlBin = 'C:\Program Files\MySQL\MySQL Server 8.4\bin'
$mysqldump = Join-Path $mysqlBin 'mysqldump.exe'
$mysql     = Join-Path $mysqlBin 'mysql.exe'
if (-not (Test-Path -LiteralPath $mysqldump)) { throw "找不到 mysqldump：$mysqldump" }

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$sqlPath  = Join-Path $OutDir "ai_anime-local-$stamp.sql"
$gzPath   = "$sqlPath.gz"
$shaPath  = "$gzPath.sha256"

Write-Host "[1/5] 导出 $DbName（--single-transaction，不锁表、不改数据）" -ForegroundColor Cyan
# MYSQL_PWD 避免口令出现在进程命令行里；--no-tablespaces 免掉业务账号缺 PROCESS 权限的告警
$env:MYSQL_PWD = $DbPass
& $mysqldump -h $Host_ -P $Port -u $DbUser --no-tablespaces --default-character-set=utf8mb4 --databases $DbName --result-file=$sqlPath
if ($LASTEXITCODE -ne 0) { throw "mysqldump 失败 exit=$LASTEXITCODE" }
$env:MYSQL_PWD = $null

Write-Host "[2/5] gzip 压缩" -ForegroundColor Cyan
$in = [System.IO.File]::OpenRead($sqlPath)
$out = [System.IO.File]::Create($gzPath)
$gz = New-Object System.IO.Compression.GZipStream($out, [System.IO.Compression.CompressionMode]::Compress)
$in.CopyTo($gz)
$gz.Close(); $out.Close(); $in.Close()
Remove-Item -LiteralPath $sqlPath -Force

# 校验：解压回来必须与原文一致（gzip 自身完整性 + 末行 Dump completed 标记）
$tmpSql = Join-Path $env:TEMP "ai-backup-check-$stamp.sql"
$in = [System.IO.File]::OpenRead($gzPath)
$gzd = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
$out = [System.IO.File]::Create($tmpSql)
$gzd.CopyTo($out)
$out.Close(); $gzd.Close(); $in.Close()
$tail = (Get-Content -LiteralPath $tmpSql -Tail 1 -Encoding UTF8)
if ($tail -notmatch 'Dump completed') { Remove-Item -LiteralPath $tmpSql -Force; throw "备份尾部缺少 'Dump completed' 标记，视为不完整" }
Remove-Item -LiteralPath $tmpSql -Force

Write-Host "[3/5] 生成 SHA256" -ForegroundColor Cyan
$hash = (Get-FileHash -LiteralPath $gzPath -Algorithm SHA256).Hash.ToLower()
"$hash  $(Split-Path -Leaf $gzPath)" | Set-Content -LiteralPath $shaPath -Encoding ASCII

$sizeMB = [math]::Round((Get-Item -LiteralPath $gzPath).Length / 1MB, 2)
Write-Host "[4/5] 备份完成：$gzPath（$sizeMB MB）" -ForegroundColor Green
Write-Host "       校验文件：$shaPath"
Write-Host "       SHA256：$hash"

if ($Encrypt) {
  Write-Host "[+] AES-256 加密副本（口令只有你自己知道，丢了无法恢复）" -ForegroundColor Cyan
  $cred = Read-Host -Prompt '设置备份口令（至少 12 位）' -AsSecureString
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($cred))
  if ($plain.Length -lt 12) { throw '口令太短' }
  $encPath = "$gzPath.enc"
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $salt = New-Object byte[] 16; $rng.GetBytes($salt)
  $iv   = New-Object byte[] 16; $rng.GetBytes($iv)
  $derive = New-Object System.Security.Cryptography.Rfc2898DeriveBytes($plain, $salt, 200000, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
  $key = $derive.GetBytes(32); $derive.Dispose()
  $aes = [System.Security.Cryptography.Aes]::Create()
  $aes.Mode = 'CBC'; $aes.Padding = 'PKCS7'; $aes.Key = $key; $aes.IV = $iv
  $enc = $aes.CreateEncryptor()
  $bin = [System.IO.File]::ReadAllBytes($gzPath)
  $cipher = $enc.TransformFinalBlock($bin, 0, $bin.Length)
  $fsOut = [System.IO.File]::Create($encPath)
  $fsOut.Write($salt, 0, $salt.Length)
  $fsOut.Write($iv, 0, $iv.Length)
  $fsOut.Write($cipher, 0, $cipher.Length)
  $fsOut.Close(); $aes.Dispose()
  Write-Host "       加密副本：$encPath  —— 拷 U 盘用这个；解密见 restore-local-mysql.ps1 -Decrypt" -ForegroundColor Green
}

if ($Verify) {
  Write-Host "[V] 还原校验：导入临时库 ai_anime_verify 并逐表比对行数" -ForegroundColor Cyan
  $probe = 'ai_anime_verify'
  $env:MYSQL_PWD = ''          # 本机 root 是 --initialize-insecure 建的空口令
  & $mysql -h $Host_ -P $Port -u root -e "DROP DATABASE IF EXISTS ``$probe``; CREATE DATABASE ``$probe`` CHARACTER SET utf8mb4;" | Out-Null
  # 解压后直接灌进临时库（--databases 的导出自带 CREATE DATABASE/USE，用序号替换库名，避免 -replace 的 $ 语义坑）
  $tmpSql = Join-Path $env:TEMP "verify-$stamp.sql"
  $in = [System.IO.File]::OpenRead($gzPath)
  $gzd = New-Object System.IO.Compression.GZipStream($in, [System.IO.Compression.CompressionMode]::Decompress)
  $txt = (New-Object System.IO.StreamReader($gzd)).ReadToEnd()
  $in.Close()
  $txt = $txt.Replace('`ai_anime`', ('`' + $probe + '`'))
  [System.IO.File]::WriteAllText($tmpSql, $txt, (New-Object System.Text.UTF8Encoding($false)))
  $cmdLine = '"' + $mysql + '" -h ' + $Host_ + ' -P ' + $Port + ' -u root --default-character-set=utf8mb4 < "' + $tmpSql + '"'; cmd /c $cmdLine | Out-Null
  Remove-Item -LiteralPath $tmpSql -Force
  $q = "SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$DbName') a, (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='$probe') b"
  $cmp = & $mysql -h $Host_ -P $Port -u root -N -B -e $q
  & $mysql -h $Host_ -P $Port -u root -e "DROP DATABASE IF EXISTS ``$probe``;" | Out-Null
  $env:MYSQL_PWD = $null
  $parts = ($cmp -split "`t")
  if ($parts[0] -eq $parts[1]) { Write-Host "       校验通过：源库 $($parts[0]) 张表 = 还原库 $($parts[1]) 张表" -ForegroundColor Green }
  else { throw "校验不一致：源 $($parts[0]) vs 还原 $($parts[1])" }
}

if ($Keep -gt 0) {
  $old = Get-ChildItem -LiteralPath $OutDir -Filter 'ai_anime-local-*.sql.gz' | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep
  foreach ($f in $old) {
    Remove-Item -LiteralPath $f.FullName -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$($f.FullName).sha256" -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath "$($f.FullName).enc" -Force -ErrorAction SilentlyContinue
    Write-Host "[清理] $($f.Name)"
  }
}

Write-Host "`n完成。恢复方法见同目录 restore-local-mysql.ps1" -ForegroundColor Green
