# 女帝 · 王朝（网页版）

多代宫廷经营：治国、纳宠、生育、立储、继承。从 Android 版 `feature-dynasty` 插件独立出来的网页版本。

- 前端：Vue 3 + Vite，单页应用，手机 / 平板 / 桌面自适应
- 后端：Node + Express，一个进程同时负责静态资源、LLM 代理、存档读写
- 部署：单容器 Docker + 一个数据卷

## 为什么要有后端

浏览器有同源策略，直接请求多数 LLM 接口会被 CORS 拦掉；同时把 API Key 放在前端也等于公开。因此所有模型请求都走 `/api/chat` 由服务器转发，密钥只存在服务器 `.env` 里。

存档同理，从 `localStorage` 改为服务端文件，换设备、清缓存都不会丢。

## 目录结构

```
.
├─ src/
│  ├─ game-core/empire/   # 游戏引擎（纯 JS，无框架依赖，从原项目原样迁移）
│  ├─ game/llm.js         # 提示词与 AI 调用（只负责写文字，数值永远本地结算）
│  ├─ storage/kv.js       # 存储层，接口与原 Android 版一致，内部改走服务端
│  ├─ views/              # 王朝主界面、召见、京城、雷达图
│  ├─ App.vue
│  └─ main.js
├─ server/
│  ├─ index.js            # 路由：静态资源 / api/kv / api/chat
│  ├─ llm.js              # LLM 代理
│  └─ store.js            # 存档原子写
├─ Dockerfile
├─ docker-compose.yml
├─ DEPLOY.md              # 完整部署手册
└─ .env.example
```

## 本地开发

需要 Node 20+。

```bash
npm install
cp .env.example .env      # 填入 LLM_API_KEY
npm run dev               # 前端 5173，接口 3001，/api 自动代理
```

生产模式本地验证：

```bash
npm run build
npm start                 # 打开 http://localhost:3001
```

## 部署到云服务器

**完整步骤（装 Docker、配域名 HTTPS、备份、升级、排错）见 [DEPLOY.md](./DEPLOY.md)。**

服务器已装 Docker 的话，核心就三步：

```bash
git clone https://github.com/yufeng0213/empress-dynasty.git
cd empress-dynasty
cp .env.example .env && vi .env     # 至少填 LLM_API_KEY
docker compose up -d --build
```

浏览器访问 `http://服务器IP:3001`。

> `git clone` 报 `Connection was reset` 是 GitHub 443 被拦，改用 SSH 地址或本地打包上传，见 [DEPLOY.md 第 2 节](./DEPLOY.md#拉不下来怎么办)。

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `LLM_API_BASE` | 完整接口地址；只填到 `/v1` 也行，会自动补 `/chat/completions` |
| `LLM_API_KEY` | 接口密钥，只存在服务器 |
| `LLM_MODEL` | 模型名 |
| `LLM_EXTRA_PARAMS` | 可选，JSON 形式的额外参数，如 `{"top_p":0.95}` |
| `PORT` | 容器内监听端口，默认 3001 |
| `DATA_DIR` | 存档目录，容器内默认 `/data` |

### 存档

存档是普通 JSON，宿主机的 `./data/kv.json`。

```bash
cp data/kv.json ~/backup/kv-$(date +%F).json   # 备份
```

换服务器时把 `data/` 整个拷过去即可。文件损坏会自动改名为 `kv.corrupt.<时间戳>.json` 并保留原文件。

### 建议：套一层 HTTPS

手机上玩建议配个域名 + HTTPS（Caddy 最省事），否则部分浏览器会限制剪贴板、音频自动播放和「添加到主屏幕」。配置方法见 [DEPLOY.md 第 7 节](./DEPLOY.md#7-配域名和-https建议)。

## 桌面与手机

模板只有一套，靠 CSS 断点切换：

- `≥ 1024px`：底部导航变成左侧竖排侧栏，内容限宽居中；召见列表变多列，京城地图变四列
- `768–1023px`：保持底部导航，仅加大留白
- `< 768px`：与手机版完全一致的竖屏布局

## 说明

- 所有数值（属性、忠诚、野心、结算结果）都在本地引擎里算，模型只负责写人设、奏报、对白，不会改动数值。
- 没有配置 `LLM_API_KEY` 时游戏仍可玩，只是人物小传会使用本地模板兜底。
- 头像按 `/data/dynasty/avatars/...` 查找，当前仓库未内置图库，找不到时显示姓氏首字。
