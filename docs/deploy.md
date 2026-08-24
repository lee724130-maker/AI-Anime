# 服务器 SSH 连接与部署流程

> 记录本地 Windows 连接生产服务器、推送文件、部署更新的完整方法。
> 最后更新：2026-08-11（轮播更新部署验证通过）

> 📌 本文件为个人参考文档，**不入库**（git 忽略/不提交），仅本地查看。

---

## 一、连接方式总览

| 项目 | 内容 |
|------|------|
| 连接工具 | **plink.exe / pscp.exe**（PuTTY 命令行套件，单文件免安装） |
| 认证方式 | **密码认证**（无私钥文件；hostkey 指纹防中间人） |
| 服务器地址 | `47.121.137.131` |
| 登录账号 | `root` |
| 密码 | `HAPPYlwx000000*`（注意结尾有 `*`） |
| hostkey 指纹 | `SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A` |
| 站点域名 | `https://anime.leesystem.xyz`（vhost 域名，见下方 curl 坑） |
| 部署目录 | `/home/www/ai-anime/` |
| 上传暂存目录 | `/home/www/ai-anime/deploy/` |

### 工具位置（本地）

```
C:\Users\Administrator\AppData\Local\Temp\opencode\plink.exe   （执行远程命令）
C:\Users\Administrator\AppData\Local\Temp\opencode\pscp.exe    （推送/拉取文件）
```

> ⚠️ 工具在用户 Temp 目录（`C:\Users\ADMINI~1\AppData\Local\Temp\opencode` = `C:\Users\Administrator\AppData\Local\Temp\opencode`，短路径写法在 PowerShell 中等价）。
> 若 Defender 对从 Temp 运行 plink/pscp 报启发式拦截，可将两个 exe 移入固定目录并加白名单。

**没有私钥文件**——当前方案是「密码 + hostkey 指纹」。hostkey 相当于服务器公钥指纹，`-batch` 模式下 PuTTY 首次连接会校验，用 `-hostkey` 参数显式提供后免交互，不再有「是否信任此主机」的确认弹窗。

---

## 二、PowerShell 封装

每次命令都带全参数太长，建议在 PowerShell 会话中先定义变量（写入 `$PROFILE` 或每次会话开头执行）：

```powershell
$env:PLINK = "C:\Users\Administrator\AppData\Local\Temp\opencode"
$SSH_ARGS = @('-ssh', '-pw', 'HAPPYlwx000000*', '-batch', '-hostkey', 'SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A', 'root@47.121.137.131')
```

---

## 三、基础命令

### 1. 执行远程命令（plink）

```powershell
# 单条命令
& "$env:PLINK\plink.exe" -ssh -pw "HAPPYlwx000000*" -batch -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" root@47.121.137.131 "pm2 status"

# 多条命令（用 ; 或 && 连接）
& "$env:PLINK\plink.exe" -ssh -pw "HAPPYlwx000000*" -batch -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" root@47.121.137.131 "cd /home/www/ai-anime && ls backend/dist/src/main.js && pm2 restart ai-anime-backend --update-env"
```

### 2. 推送本地文件到服务器（pscp）

```powershell
# 单文件上传到指定目录
& "$env:PLINK\pscp.exe" -pw "HAPPYlwx000000*" -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" "本地路径\file.zip" root@47.121.137.131:/home/www/ai-anime/deploy/

# 多文件一次上传
& "$env:PLINK\pscp.exe" -pw "HAPPYlwx000000*" -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" "a.zip" "b.zip" root@47.121.137.131:/home/www/ai-anime/deploy/
```

### 3. 从服务器拉取文件（pscp）

```powershell
& "$env:PLINK\pscp.exe" -pw "HAPPYlwx000000*" -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" root@47.121.137.131:/home/www/ai-anime/backend/logs/out.log "本地保存路径\"
```

> ⚠️ **pscp.exe 路径注意**：pscp 也在 Temp\opencode 目录，与 plink 相同（上面直接用 `$env:PLINK\pscp.exe`）。

---

## 四、完整部署流程（前端 + 后端）

以 2026-08-11 轮播更新部署为例，五步走：

### 第 1 步：本地编译

```powershell
# 后端（必须裸跑，勿接管道；PowerShell 管道会杀掉 node 进程导致 dist 不更新）
cd C:\Users\Administrator\Desktop\AI-Anime\backend
npx tsc

# 前端
cd C:\Users\Administrator\Desktop\AI-Anime\frontend
npm run build
```

### 第 2 步：本地打包 zip

```powershell
# zip 内容 = dist 目录里的文件（不是 dist 包裹层！服务器解压到 frontend/dist / backend/dist）
Compress-Archive -Path "C:\Users\Administrator\Desktop\AI-Anime\backend\dist\*" -DestinationPath "C:\Users\Administrator\AppData\Local\Temp\opencode\deploy\backend.zip" -Force
Compress-Archive -Path "C:\Users\Administrator\Desktop\AI-Anime\frontend\dist\*" -DestinationPath "C:\Users\Administrator\AppData\Local\Temp\opencode\deploy\frontend.zip" -Force
```

> ⚠️ PowerShell `Compress-Archive` 生成的 zip 用反斜杠分隔路径，服务器 unzip 会 warning 但解压结果正常——**服务器端必须用「双保险」unzip**（见第 4 步）。

### 第 3 步：上传

```powershell
& "$env:PLINK\pscp.exe" -pw "HAPPYlwx000000*" -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" `
  "C:\Users\Administrator\AppData\Local\Temp\opencode\deploy\backend.zip" `
  "C:\Users\Administrator\AppData\Local\Temp\opencode\deploy\frontend.zip" `
  "C:\Users\Administrator\AppData\Local\Temp\opencode\部署脚本.sh" `
  root@47.121.137.131:/home/www/ai-anime/deploy/
```

### 第 4 步：服务器端部署脚本（先写脚本文件再上传执行，勿用 plink 拼长命令）

```bash
#!/bin/bash
cd /home/www/ai-anime
# 前端：备份旧 dist → 新建 → 解压（unzip 双保险，防 PowerShell zip 的 backslash warning 返回非零中断脚本）
rm -rf frontend/dist_bak && mv frontend/dist frontend/dist_bak
mkdir -p frontend/dist
unzip -o -q deploy/frontend.zip -d frontend/dist 2>/dev/null || unzip -o -q deploy/frontend.zip -d frontend/dist
echo "FRONTEND_OK"
# 核对前端 JS hash 与本地构建一致（关键验证！）
ls frontend/dist/assets/ | grep -E "index-|Generate-|History"
# 后端：同上
rm -rf backend/dist_bak && mv backend/dist backend/dist_bak
mkdir -p backend/dist
unzip -o -q deploy/backend.zip -d backend/dist 2>/dev/null || unzip -o -q deploy/backend.zip -d backend/dist
echo "BACKEND_OK"
ls backend/dist/src/main.js
# 重启后端
pm2 restart ai-anime-backend --update-env
sleep 4
pm2 status | grep -E "ai-anime|online|errored"
# 重启后 4 秒内可能 502（node 还在初始化），等 8~10 秒再复测
curl -s -o /dev/null -w "api_health=%{http_code}\n" https://anime.leesystem.xyz/api/user/profile --insecure --resolve anime.leesystem.xyz:443:127.0.0.1
curl -s -o /dev/null -w "front_root=%{http_code}\n" https://anime.leesystem.xyz/ --insecure --resolve anime.leesystem.xyz:443:127.0.0.1
# 清理服务器上的 zip（不留冗余）
rm -rf deploy/backend.zip deploy/frontend.zip
```

执行：
```powershell
& "$env:PLINK\plink.exe" -ssh -pw "HAPPYlwx000000*" -batch -hostkey "SHA256:YMX2Ho7DAFSl8UHClUltF8gOWe/cm3IPAlotP8Ghc5A" root@47.121.137.131 "cd /home/www/ai-anime/deploy && chmod +x 部署脚本.sh && bash 部署脚本.sh"
```

### 第 5 步：验证（三查）

1. **前端 hash 核对**：`deploy` 脚本输出里 `index-XXX.js` 必须与本地 `frontend\dist\assets\` 的 hash 完全一致。
2. **API 冒烟**（注意 curl 必须 `--resolve` 带域名，否则 IP 直连 404）：
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://anime.leesystem.xyz/api/user/profile --insecure --resolve anime.leesystem.xyz:443:127.0.0.1   # 期望 401（无 token）
   curl -s -o /dev/null -w "%{http_code}\n" https://anime.leesystem.xyz/api/generate/tasks --insecure --resolve anime.leesystem.xyz:443:127.0.0.1  # 期望 401
   ```
3. **Playwright 生产功能测试**（可选项，改动大时做）：
   ```powershell
   # 脚本模式：本地跑 Playwright 连生产站点；测试脚本放 Temp\opencode
   $env:NODE_PATH = "C:\Users\Administrator\Desktop\AI-Anime\backend\node_modules"
   node C:\Users\Administrator\AppData\Local\Temp\opencode\test-prod-xxx.js
   ```

---

## 五、数据库连接（服务器内）

```bash
# 应用库用户（root 在生产被拒）
mysql -uai_anime -pAnimeSecure2026! ai_anime -e "SELECT COUNT(*) FROM users;"

# Redis（业务库是 db 5，验证码注入测试用）
redis-cli -n 5 SET "email_code:test@test.com" "778899|$(($(date +%s%3N)+300000))" EX 300
# 清注册限流（测试前）
redis-cli -n 5 --scan --pattern "reg_ip:*" | xargs -r redis-cli -n 5 del
```

---

## 六、注意事项与历史教训（血泪总结）

1. **PowerShell 与 plink 双层转义必炸**：含中文/引号/`$` 的远程命令一律写成脚本文件（或临时 .sh）pscp 上传后执行，不要拼在命令行里。
2. **plink 超时 ≠ 远程命令结束**：本地超时被杀后，远程 node/chromium 可能还活着——立即补一条 `pkill -f 脚本名` 清理。
3. **远程跑耗资源/下载任务必须自带硬退出**：脚本开头 `setTimeout(() => process.exit(1), 60000)`，所有 fetch/axios 带超时；**别在服务器上跑下载大视频的测试**。
4. **生产 curl 必须 `--resolve anime.leesystem.xyz:443:127.0.0.1`**（或 `-H "Host: ..."`），否则 IP 直连落到默认站点全 404。
5. **重启后先等 8~10 秒再测 API**（node 初始化，4 秒时可能 502 假象）。
6. **unzip 双保险**（`unzip -o -q x.zip 2>/dev/null || unzip -o -q x.zip`），脚本别用 `set -e` 包 unzip 步骤。
7. **前端 hash 必须核对**：解压 warning 不代表解压失败，以 grep 出来的 JS 文件名与本地一致为准。
8. **发信测试铁律**：任何 send-code/真实 SMTP 发信必须用户同意 + 真实邮箱；测试注册一律 Redis 注入验证码。
9. **每 IP 每日注册限 2 个**：测试脚本注册前先清 `reg_ip:*` 键。
10. **登录响应是 `{access_token, user}`**，不是 `token`（Playwright 脚本注入 localStorage 时注意）。

---

## 七、常用排查命令

```bash
pm2 status                    # 进程状态（ai-anime-backend 必须 online）
pm2 logs ai-anime-backend --lines 50   # 看后端日志
pm2 logs ai-anime-backend --err --lines 30   # 看错误（stderr）
ls /home/www/ai-anime/backend/output/ | wc -l   # 产物文件数
free -m                       # 内存
df -h /                       # 磁盘
curl -s http://127.0.0.1/api/user/profile -H "Host: anime.leesystem.xyz" -o /dev/null -w "%{http_code}\n"  # 本机直测
```