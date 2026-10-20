# 女帝 · 王朝（网页版）

多代宫廷经营：治国、纳宠、生育、立储、继承。从 Android 版 `feature-dynasty` 插件独立出来的网页版本。

- 前端：Vue 3 + Vite，单页应用，手机 / 平板 / 桌面自适应
- 后端：Node + Express，一个进程同时负责静态资源、LLM 代理、存档读写、立绘库
- 立绘：支持导入多格拼图、浏览器内切分、按人物分配、全屏看大图
- 部署：单容器 Docker + 一个数据卷

## 为什么要有后端

浏览器有同源策略，直接请求多数 LLM 接口会被 CORS 拦掉；同时把 API Key 放在前端也等于公开。因此所有模型请求都走 `/api/chat` 由服务器转发，密钥只存在服务器上。

接口配置可以直接在网页「设置 · AI 接口」里维护：可以保存多套（地址 / 模型 / Key / 额外参数），随时切换启用哪一套，也可以单独测试连通性。配置落在服务器 `data/llm-profiles.json`，页面只拿到掩码，不会把密钥写进浏览器缓存。`.env` 里的配置会作为只读的「服务器环境变量」一并出现在列表里。

存档同理，从 `localStorage` 改为服务端文件，换设备、清缓存都不会丢。

## 目录结构

```
.
├─ src/
│  ├─ game-core/empire/   # 游戏引擎（纯 JS，无框架依赖，从原项目原样迁移）
│  ├─ game/llm.js         # 提示词与 AI 调用（只负责写文字，数值永远本地结算）
│  ├─ game/llmConfig.js   # 前端 AI 配置客户端（只读写掩码，不接触密钥）
│  ├─ game/portraits.js   # 立绘库接口与图片地址
│  ├─ game/portraitStore.js # 立绘分配、自动分配、稳定预览
│  ├─ game/sliceSheet.js  # 浏览器内切分多格拼图
│  ├─ storage/kv.js       # 存储层，接口与原 Android 版一致，内部改走服务端
│  ├─ views/              # 王朝主界面、召见、京城、AI 设置、立绘库、雷达图
│  ├─ App.vue
│  └─ main.js
├─ server/
│  ├─ index.js            # 路由：静态资源 / api/kv / api/chat / api/llm / api/portraits
│  ├─ llm.js              # LLM 代理
│  ├─ llm-config.js       # 多套接口配置的存取与掩码
│  ├─ portraits.js        # 立绘文件与 index.json
│  └─ store.js            # 存档原子写
├─ scripts/
│  └─ slice_portrait_sheets.py # 本地批量切图（可选，需要 Pillow）
├─ Dockerfile
├─ docker-compose.yml
├─ DEPLOY.md              # 完整部署手册
└─ .env.example
```

## 本地开发

需要 Node 20+。

```bash
npm install
cp .env.example .env      # 可留空，之后在网页「设置 · AI 接口」里配置
npm run dev               # 前端 5173，接口 3001，/api 自动代理
```

生产模式本地验证：

```bash
npm run build
npm start                 # 打开 http://localhost:3001
```

## 立绘资源包

人物卡片、详情页、名册、选秀、出行和召见都会优先显示立绘；点开人物大图或房间大图可以全屏查看。图片只保存在你自己的服务器，不会上传到第三方。

两种导入方式：

1. **网页内导入（推荐）**：进入「更多 · 立绘库」→「导入整图」，选一张多格拼图，按行列切分并预览，确认后入库；之后可以给人物单张分配，或一键「自动分配」。
2. **本地脚本**：`python scripts/slice_portrait_sheets.py "data/立绘全图" --rows 2 --cols 5`（需要 Pillow）。脚本会把切片写入 `data/portraits/` 并更新 `index.json`，重复执行会跳过已导入的格子。

说明：

- 切图在浏览器里用 canvas 完成，服务端只负责存文件，不需要 sharp / ImageMagick。
- 图片存放在 `data/portraits/`，索引是 `data/portraits/index.json`；`data/` 已在 `.gitignore` 里。
- 分配关系按存档存在 KV（`portrait_assignments`），不写进引擎数值；换设备也还在。
- 没手动分配时，会按人物 id 稳定预览一张同性立绘；点立绘卡片左下角可以改性别，女性角色（包括君主）需要「女」或「通用」立绘。
- 备份时把 `data/portraits/` 一起带走，或直接备份整个 `data/`。

## 部署到云服务器

**完整步骤（装 Docker、配域名 HTTPS、备份、升级、排错）见 [DEPLOY.md](./DEPLOY.md)。**

服务器已装 Docker 的话，核心就三步：

```bash
git clone https://github.com/yufeng0213/empress-dynasty.git
cd empress-dynasty
cp .env.example .env && vi .env     # 可留空，进游戏后在网页里配置 AI
docker compose up -d --build
```

浏览器访问 `http://服务器IP:3001`。

> 默认监听 3001，所以地址带端口。想用域名访问，需要映射 80 或加反向代理，见 [DEPLOY.md 第 7 节](./DEPLOY.md#7-配域名和-https建议)。
>
> 支持三种挂法：根路径 `https://dynasty.example.com`、子路径 `https://example.com/empress-dynasty/`、或直接 IP+端口。前端资源与接口都用相对路径，同一个镜像不用重新打包。

> `git clone` 报 `Connection was reset` 是 GitHub 443 被拦，改用 SSH 地址或本地打包上传，见 [DEPLOY.md 第 2 节](./DEPLOY.md#拉不下来怎么办)。

### 环境变量

| 变量 | 说明 |
| --- | --- |
| `LLM_API_BASE` | 完整接口地址；只填到 `/v1` 也行，会自动补 `/chat/completions` |
| `LLM_API_KEY` | 接口密钥，只存在服务器；留空则改用网页里的配置 |
| `LLM_MODEL` | 模型名 |
| `LLM_EXTRA_PARAMS` | 可选，JSON 形式的额外参数，如 `{"top_p":0.95}` |
| `PORT` | 容器内监听端口，默认 3001 |
| `DATA_DIR` | 存档与 AI 配置目录，容器内默认 `/data` |

### AI 接口配置

两处都可以配置，二选一即可：

1. **网页内（推荐）**：首页右上「AI 设置」，或游戏内「设置」。支持保存多套配置、随时切换、单独测试。
2. **服务器 `.env`**：启动后作为只读的「服务器环境变量」配置出现，适合一台机器固定一个接口。

网页内配置的规则：

- 接口需兼容 OpenAI 的 `/chat/completions`；只填到 `/v1` 会自动补全。
- 配置保存在 `data/llm-profiles.json`，接口只回传掩码（如 `sk-••••abcd`），密钥不会进入浏览器缓存。
- 「测试连接」只发一条极短请求，验证地址、模型名与密钥。
- 切换后立即生效，不需要重启服务。
- 不配置也能玩：人设、奏报退回本地模板。

### 存档

存档是普通 JSON，宿主机的 `./data/kv.json`；AI 配置是 `./data/llm-profiles.json`；立绘在 `./data/portraits/`。

```bash
cp data/kv.json ~/backup/kv-$(date +%F).json   # 备份存档
cp data/llm-profiles.json ~/backup/llm-$(date +%F).json  # 备份接口配置（含密钥）
cp -r data/portraits ~/backup/portraits-$(date +%F)      # 备份立绘资源包
```

换服务器时把 `data/` 整个拷过去即可。文件损坏会自动改名为 `*.corrupt.<时间戳>.json` 并保留原文件。

### 建议：套一层 HTTPS

手机上玩建议配个域名 + HTTPS（Caddy 最省事），否则部分浏览器会限制剪贴板、音频自动播放和「添加到主屏幕」。配置方法见 [DEPLOY.md 第 7 节](./DEPLOY.md#7-配域名和-https建议)。

## 桌面与手机

模板只有一套，靠 CSS 断点切换：

- `≥ 1024px`：底部导航变成左侧竖排侧栏，内容限宽居中；召见列表变多列，京城地图变四列
- `768–1023px`：保持底部导航，仅加大留白
- `< 768px`：与手机版完全一致的竖屏布局

## 说明

- 所有数值（属性、忠诚、野心、结算结果）都在本地引擎里算，模型只负责写人设、奏报、对白，不会改动数值。
- 没有配置 AI 接口时游戏仍可玩，只是人物小传、奏报会使用本地模板兜底；配好之后在「设置」里一键切换即可。
- 头像按 `/data/dynasty/avatars/...` 查找，当前仓库未内置图库，找不到时显示姓氏首字。
