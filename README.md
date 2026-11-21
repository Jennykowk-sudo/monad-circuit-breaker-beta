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



## 安全提示

- 不要把 Privy **App Secret**、Pimlico API Key、任何私钥写进前端或提交到 GitHub。
  App ID 可以放前端；Secret/Key 必须放服务端（Vercel Serverless / 环境变量）。
- 该站默认演示模式，所有成交与挽回金额均为合成数据，不构成投资建议。
