# Circuit Breaker — Monad DeFi 风险保护演示站

面向终端用户的静态单页站，运行在 **Monad Testnet (chainId 10143)**，部署在 **Vercel**。
当前为演示/只读模式：合成行情 + 只读 RPC 观察，未连接 Privy、未执行链上写操作。

## 文件结构

```
monad-circuit-breaker/
├── index.html     # 页面结构（Hero / 8步旅程 / 风险面板 / 资源测试链接 / 开发者接入区）
├── styles.css     # 样式（深色科技风）
├── app.js         # 交互、粒子动画、只读 RPC、合约校验、适配器预留
├── config.js      # ★ 配置中心：所有链接、地址、App ID、开关都在这里
├── vercel.json    # Vercel 静态站部署配置 + 安全头
└── README.md      # 本文件
```

## 上传到 GitHub

```bash
cd monad-circuit-breaker
git init
git add .
git commit -m "feat: Monad Circuit Breaker user-facing site"
git branch -M main
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git push -u origin main
```

> 若仓库已在 GitHub 建好，用 `git remote set-url origin <你的仓库URL>` 替换第 5 行。

## 部署到 Vercel

**方式 A（推荐，最省事）**
1. 打开 https://vercel.com/new
2. 用 GitHub 登录，Import 你刚上传的仓库
3. Framework 选 **Other / 无框架**，`vercel.json` 会被自动识别
4. Build Command 留空，Output Directory 填 `.`（根目录）
5. 点 Deploy，得到 `https://<项目名>.vercel.app`

**方式 B（命令行）**
```bash
npm i -g vercel
cd monad-circuit-breaker
vercel --prod
```

**绑定自定义域名**：Vercel 项目 → Settings → Domains → 添加域名 → 按提示改 DNS。

## 部署前要确认的配置（config.js）

| 项 | 当前状态 | 说明 |
|---|---|---|
| `network.rpcHttp / rpcWs` | ✅ 官方默认值 | 生产建议换自己的服务端 RPC |
| `network.explorer` | ✅ 官方 | 测试网浏览器 |
| `links.tutorial1` | ✅ Pimlico tutorial1 | 无 Gas / Paymaster 教程 |
| `links.resources` | ✅ 你的 Notion 页 | 项目资源入口 |
| `links.monadBridge` | ✅ 你提供的 Bridge | 第三方桥，谨慎核验 |
| `links.privyApiDocs` | ✅ Privy 文档 | App ID / 鉴权说明 |
| `wallet.privyAppId` | ⚠️ 空 | 填 Privy App ID 后接 SDK |
| `protection.contractAddress` | ⚠️ 空 | 你的保护合约地址 |
| `protection.testTokenAddress` | ⚠️ 已填但未核验 | `0x88b8…055d`，两网均无字节码，按合成占位处理 |
| `flags.liveWallet / liveProtection` | ⚠️ false | 真实能力就绪后再打开 |

## 已核实的合约地址（Monad Testnet，来自官方 registry）

Multicall3 `0xca11…ca11`、WMON `0xfb8b…c541`、USDC `0x534b…3a3`、
UniversalRouter `0x1b7b…c22`、CreateX `0xba5e…a5ed`、Permit2 `0x0000…ba3`。
完整来源：https://github.com/monad-crypto/protocols

> UniswapV2/V3 Factory、USDT、WBTC、WETH 在官方测试网清单中**未收录**，页面留空待核验，切勿用主网地址顶替。

## 安全提示

- 不要把 Privy **App Secret**、Pimlico API Key、任何私钥写进前端或提交到 GitHub。
  App ID 可以放前端；Secret/Key 必须放服务端（Vercel Serverless / 环境变量）。
- 该站默认演示模式，所有成交与挽回金额均为合成数据，不构成投资建议。
