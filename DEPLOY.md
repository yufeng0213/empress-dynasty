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

### 拉不下来怎么办

国内服务器直连 GitHub 经常出现 `Connection was reset`（443 被重置）。三种绕法，任选其一。

**方式一：改用 SSH**（服务器 22 端口通常能通）

```bash
git clone git@github.com:yufeng0213/empress-dynasty.git
```

服务器上还没有公钥的话，先 `ssh-keygen -t ed25519 -C "server"`，把 `~/.ssh/id_ed25519.pub` 的内容加到 GitHub 的 Settings → SSH and GPG keys。

**方式二：本地打包上传**（最稳，不依赖服务器的网络）

```bash
# 在你自己的电脑上，仓库的上一级目录
tar --exclude=node_modules --exclude=dist --exclude=data -czf empress-dynasty.tar.gz empress-dynasty
scp empress-dynasty.tar.gz root@服务器IP:/opt/

# 服务器上
cd /opt && tar -xzf empress-dynasty.tar.gz && cd empress-dynasty
```

**方式三：仓库是私有的话**，clone 时要带 token：

```bash
git clone https://<你的token>@github.com/yufeng0213/empress-dynasty.git
```

这种方式 token 会留在 `.git/config` 里，服务器只有自己用问题不大；介意的话还是用方式一。

---

## 3. 配置环境变量

```bash
cp .env.example .env
vi .env
```

可以在这里填一组固定配置：

```ini
LLM_API_BASE=https://api.deepseek.com/v1
LLM_API_KEY=sk-你的密钥
LLM_MODEL=deepseek-chat
```

也可以全部留空，启动后在网页右上「AI 设置」里保存多套配置并切换，效果相同而且不用重建容器。

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
>
> 在网页里保存的配置写在 `data/llm-profiles.json`（同样只在服务器），页面只显示 `sk-••••` 这样的掩码；新增、切换、测试都即时生效。

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

> 这里必须带 `:3001`。想用域名直接访问、不带端口号，见第 7 节。

---

## 5. 放行端口

云厂商的安全组 / 防火墙要放行 3001：

```bash
# 如果服务器开了 ufw
sudo ufw allow 3001/tcp
```

阿里云、腾讯云、AWS 还要在控制台的「安全组」里加一条入站规则，否则外面访问不到。

如果后面按第 7 节改用 80 端口或加了反向代理，放行规则要跟着改：纯 80 访问放行 `80/tcp`，上了 HTTPS 就放行 `80/tcp` 和 `443/tcp`，此时 3001 只绑本机，不需要对外。

---

## 6. 自检

```bash
curl http://127.0.0.1:3001/api/health
```

正常返回：

```json
{
  "ok": true,
  "llm": {
    "configured": true,
    "profileId": "llm_xxx",
    "name": "主力模型",
    "model": "deepseek-chat",
    "endpoint": "..."
  },
  "storage": "/data/kv.json",
  "uptime": 12
}
```

`llm.configured` 是 `false` 时：先看网页「设置 · AI 接口」里是否有已启用的配置；如果用的是 `.env`，改完要 `docker compose up -d` 重建容器（不是 `restart`）。

---

## 7. 配域名和 HTTPS（建议）

先说清楚端口这件事：**域名只负责把名字解析到 IP，不改变端口**。浏览器在你不写端口时，默认连 80（http）或 443（https）。

游戏默认监听 3001，所以开箱状态是：

- `http://你的域名:3001` ✅ 能打开
- `http://你的域名` ❌ 打不开（浏览器去连 80，那里没有服务）

想直接输域名就进游戏，三选一。

### 7.1 最省事：把容器映射到 80

编辑 `docker-compose.yml`，改端口映射：

```yaml
    ports:
      - "80:3001"
```

```bash
docker compose up -d
```

之后访问 `http://你的域名` 即可。

限制：只有 HTTP，没有证书；如果服务器上已经有 Nginx / Apache 占着 80，会报 `port is already allocated` 起不来。手机上「添加到主屏幕」「音频自动播放」在纯 HTTP 下会被浏览器限制。

### 7.2 推荐：Caddy 反向代理 + 自动 HTTPS

服务继续待在 3001，但只绑本机；公网只暴露 80/443 给 Caddy。

**第一步**，改 `docker-compose.yml`，让 3001 不对外：

```yaml
    ports:
      - "127.0.0.1:3001:3001"
```

```bash
docker compose up -d
```

**第二步**，域名 A 记录指向服务器 IP，确认已生效：

```bash
ping 你的域名        # 返回服务器 IP 就对了
```

**第三步**，安装 Caddy：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy
```

**第四步**，编辑 `/etc/caddy/Caddyfile`（把域名换成你自己的）：

```
dynasty.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy
```

之后访问 `https://dynasty.example.com`。证书自动申请、自动续期，不用管。

**安全组 / 防火墙要放行 80 和 443**，否则申请证书会失败：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

### 7.3 服务器上已经有 Nginx

80/443 已被别的站点占用，就别再装 Caddy 了，加一个站点即可。

新建 `/etc/nginx/sites-available/dynasty`：

```nginx
server {
    listen 80;
    server_name 你的域名;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # AI 生成一段长剧情可能要一两分钟，别让它中途超时断开
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/dynasty /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d 你的域名
```

certbot 会自动配置好 443 和 HTTP 跳转。

> `proxy_read_timeout` 一定要调大。Nginx 默认 60 秒，遇到长剧情生成会返回 504，看起来就像 AI 挂了。

### 7.4 挂在子路径下：`https://你的域名/empress-dynasty/`

不想单独占一个域名、想和别的项目共用时，可以挂在子路径。前端已经做了自适应（资源走相对路径、接口带上当前前缀），**同一个镜像既能挂根路径也能挂子路径，不需要重新打包**。

唯一要做的是让反向代理**剥掉前缀**再转发。

**Nginx**

```nginx
# 不带末尾斜杠时补一个，否则相对资源路径会解析错
location = /empress-dynasty {
    return 301 /empress-dynasty/;
}

location /empress-dynasty/ {
    # 注意 proxy_pass 结尾这个 / ，它负责把 /empress-dynasty 前缀去掉
    proxy_pass http://127.0.0.1:3001/;

    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 180s;
    proxy_send_timeout 180s;
}
```

**Caddy**

```
example.com {
    redir /empress-dynasty /empress-dynasty/ 301

    handle_path /empress-dynasty/* {
        reverse_proxy 127.0.0.1:3001
    }
}
```

`handle_path` 自带剥离前缀的效果，不用额外处理。

**两个容易踩的点**

1. `proxy_pass http://127.0.0.1:3001/;` 末尾少了 `/` —— 后端会收到 `/empress-dynasty/api/kv`，直接 404。这是子路径部署最常见的失败原因。
2. 访问 `https://域名/empress-dynasty`（不带末尾斜杠）时，浏览器会以 `/` 为基准解析相对资源，页面白屏。上面那条 301 就是解决它的，别省。

`docker-compose.yml` 里的端口保持 `"127.0.0.1:3001:3001"` 即可，公网只暴露 80/443。

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

- `尚未配置 AI 接口` → 网页「设置 · AI 接口」里还没有启用任何配置；用 `.env` 的话确认写了 Key 并用 `up -d` 重建容器
- `配置「xxx」缺少 API Key` → 该配置保存时没带上密钥，编辑后重新填写
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
