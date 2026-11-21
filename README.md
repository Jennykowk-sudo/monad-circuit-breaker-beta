# Circuit Breaker — Monad 链上资产保护

前端静态单页站，部署在 **Vercel**，链上交互锁定 **Monad Testnet (chainId 10143)**。
落地页 + 钱包连接 + 保护规则 + 风险监测，演示模式不产生真实交易。

## 文件结构

```
├── index.html     # 落地页 + 产品面板 + 弹窗
├── styles.css     # 深色科技风样式
├── app.js         # 产品交互、钱包流程、保护规则、链守卫
├── config.js      # 配置中心（不暴露在界面上）
└── vercel.json    # Vercel 静态站配置 + 安全头
```

## 部署到 Vercel

打开 https://vercel.com/new → Import 仓库 → Framework 选 **Other** → Build Command 留空 → Deploy。
或目录内执行 `vercel --prod`。

## 配置（config.js，仅开发时修改）

| 项 | 状态 | 说明 |
|---|---|---|
| `wallet.privyAppId` | ⚠️ 空 | 接真实 Privy 时填 App ID |
| `protection.contractAddress` | ⚠️ 空 | 保护合约部署后填地址 |
| `flags.liveWallet / liveProtection` | ⚠️ false | 真实能力就绪后打开 |

## 安全提示

- Privy **App Secret**、任何私钥/API Key **不得**进前端或 GitHub，只放 Vercel 环境变量。
- 当前为演示流程，风险指数为规则型指标，不构成投资建议。
