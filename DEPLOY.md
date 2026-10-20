# 部署手册

从一台空服务器到能打开游戏，全程照着做即可。以 Ubuntu 22.04 / Debian 12 为例，其他发行版把 `apt` 换成对应的包管理器。

整套服务只有一个容器，最低配 1 核 1G 内存足够跑。

---

## 0. 需要准备的东西

| 项目 | 说明 |
| --- | --- |
| 一台云服务器 | 1 核 1G 起，能访问外网 |
| 一个 LLM 接口 | OpenAI 兼容格式的 `/chat/completions`，需要 API Key |
| （可选）域名 | 想用 HTTPS 就需要，纯 IP 只能走 HTTP |

---

## 1. 安装 Docker

Ubuntu / Debian 官方一键脚本：

```bash
curl -fsSL https://get.docker.com | sh
```

装完确认版本（需要 20.10+，compose 需要 v2）：

```bash
docker --version
docker compose version
```

如果 `docker` 命令要加 `sudo` 才能用，把当前用户加进 docker 组（重新登录生效）：

```bash
sudo usermod -aG docker $USER
```

> 国内服务器如果拉取镜像很慢，给 Docker 配一个镜像加速器，编辑 `/etc/docker/daemon.json`：
>
> ```json
> {
>   "registry-mirrors": ["https://docker.m.daocloud.io"]
> }
> ```
>
> 然后 `sudo systemctl restart docker`。加速器地址会失效，用之前先确认能访问。

---

## 2. 拉取代码

```bash
cd /opt
git clone https://github.com/yufeng0213/empress-dynasty.git
cd empress-dynasty
```

---

## 3. 配置环境变量

```bash
cp .env.example .env
vi .env
```

至少要改这三行：

```ini
LLM_API_BASE=https://api.deepseek.com/v1
LLM_API_KEY=sk-你的密钥
LLM_MODEL=deepseek-chat
```

`LLM_API_BASE` 只填到 `/v1` 就行，服务端会自动补 `/chat/completions`；填完整地址也可以。

常见接口地址：

| 服务 | LLM_API_BASE | 模型示例 |
| --- | --- | --- |
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| Moonshot | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-plus` |
| OpenRouter | `https://openrouter.ai/api/v1` | 按站点模型名填 |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |

> 密钥只存在服务器上，不会进浏览器，也不会进 git（`.env` 已在 `.gitignore` 里）。

---

## 4. 启动

```bash
docker compose up -d --build
```

第一次构建要下载 Node 镜像并安装依赖，大约 1~3 分钟。看日志确认起来了：

```bash
docker compose logs -f
```

出现这两行就说明正常：

```
女帝王朝 · 服务已启动 http://0.0.0.0:3001
  LLM: deepseek-chat @ https://api.deepseek.com/v1/chat/completions
```

按 `Ctrl+C` 退出日志（不会停容器）。

浏览器打开 `http://服务器IP:3001`。

---

## 5. 放行端口

云厂商的安全组 / 防火墙要放行 3001：

```bash
# 如果服务器开了 ufw
sudo ufw allow 3001/tcp
```

阿里云、腾讯云、AWS 还要在控制台的「安全组」里加一条入站规则，否则外面访问不到。

---

## 6. 自检

```bash
curl http://127.0.0.1:3001/api/health
```

正常返回：

```json
{
  "ok": true,
  "llm": { "configured": true, "model": "deepseek-chat", "endpoint": "..." },
  "storage": "/data/kv.json",
  "uptime": 12
}
```

`llm.configured` 是 `false` 说明 `.env` 没生效，改完要 `docker compose up -d` 重建容器（不是 `restart`）。

---

## 7. 配域名和 HTTPS（建议）

手机上加到主屏幕、自动播放音频这些功能在 HTTP 下会被浏览器限制，有域名的话最好配上。用 Caddy 两行搞定。

先让容器只监听本机，避免 3001 直接暴露到公网。编辑 `docker-compose.yml`：

```yaml
    ports:
      - "127.0.0.1:3001:3001"
```

然后 `docker compose up -d`。

在服务器上装 Caddy（用 Docker 跑也行）：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

编辑 `/etc/caddy/Caddyfile`：

```
dynasty.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy
```

域名 A 记录指向服务器 IP，Caddy 会自动申请并续期 Let's Encrypt 证书。之后访问 `https://dynasty.example.com` 即可。

---

## 8. 存档备份

存档就是宿主机上的一个 JSON 文件：`/opt/empress-dynasty/data/kv.json`。

```bash
# 备份
cp data/kv.json ~/dynasty-backup-$(date +%F).json

# 恢复
cp ~/dynasty-backup-2026-10-20.json data/kv.json
docker compose restart
```

建议加一条定时任务，每天备份一次，保留 7 天：

```bash
crontab -e
```

```cron
0 4 * * * cd /opt/empress-dynasty && mkdir -p backup && cp data/kv.json backup/kv-$(date +\%F).json && find backup -name 'kv-*.json' -mtime +7 -delete
```

> 多台设备之间共享同一份存档，因为存档在服务器上，不在浏览器里。两个人同时玩会互相覆盖，自己玩没问题。

---

## 9. 升级

```bash
cd /opt/empress-dynasty
git pull
docker compose up -d --build
```

`data/` 是宿主机的目录，重建容器不会动它。

---

## 10. 排错

**构建时 `npm ci` 报错**
`package-lock.json` 和 `package.json` 对不上。本地执行 `npm install` 更新 lock 后再提交。

**页面能打开，但 AI 生成一直失败**
看日志定位：

```bash
docker compose logs --tail=50
```

- `服务器未配置 LLM_API_KEY` → `.env` 没写或用了 `restart` 而不是 `up -d`
- `上游接口失败 401` → Key 错了
- `上游接口失败 404` → `LLM_API_BASE` 路径不对，确认能拼出 `/chat/completions`
- `生成超时` → 服务器访问不了该接口，先在容器里测：
  ```bash
  docker compose exec empress node -e "fetch('https://api.deepseek.com/v1/models').then(r=>console.log(r.status)).catch(e=>console.log('ERR',e.message))"
  ```

**存档保存失败 / 提示写入失败**
检查目录权限：

```bash
ls -ld data
docker compose logs | grep 存档
```

容器内以 root 运行，一般不会出问题；如果宿主机 `data/` 是你用 root 手动建的，试试 `sudo chown -R 1000:1000 data`。

**端口被占用**

```bash
sudo ss -lntp | grep 3001
```

改 `.env` 里的 `PORT` 和 `docker-compose.yml` 的端口映射即可。

**改了代码但页面没变**
浏览器缓存了 `index.html` 以外的资源。`assets/` 是带 hash 的，正常会自己更新；强制刷新 `Ctrl+Shift+R` 即可。

---

## 附：不用 Docker 直接跑

```bash
npm ci
npm run build
LLM_API_BASE=... LLM_API_KEY=... LLM_MODEL=... DATA_DIR=./data npm start
```

需要 Node 20+。适合本地调试，长期运行还是用 Docker。
