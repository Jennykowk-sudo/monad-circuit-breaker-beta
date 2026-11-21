/* ============================================================================
 * Monad Circuit Breaker —— 站点配置中心
 * ----------------------------------------------------------------------------
 * 这里集中了所有「需要你提供/确认」的值，以及所有对外链接与接口占位。
 * 修改本文件后，前端会自动读取，无需改动 HTML / app.js。
 *
 * 图例：
 *   ✅ 已填好（官方来源或默认值，可直接使用）
 *   ⚠️ 占位符 —— 你提供真实值后替换；页面会明确显示「未配置」而不是伪造成功
 * ========================================================================== */
window.MCB_CONFIG = {
  /* ---------------- 品牌 ---------------- */
  brand: {
    name: "Circuit Breaker",
    fullName: "Monad Circuit Breaker",
    tagline: "市场异常时，让保护先于恐慌发生。",
    // ⚠️ 你的正式域名（Vercel 会给你一个 *.vercel.app，绑定域名后填这里）
    siteUrl: "",
  },

  /* ---------------- 网络（✅ Monad Testnet 官方参数）---------------- */
  network: {
    chainId: 10143,
    chainName: "Monad Testnet",
    // ✅ 官方公共 HTTP RPC（只读观察用；生产请换自己的服务端代理）
    rpcHttp: "https://testnet-rpc.monad.xyz",
    // ✅ 官方公共 WSS RPC（实测：端点不带 /ws；/ws 路径返回 405）
    rpcWs: "wss://testnet-rpc.monad.xyz",
    // ✅ Monad 官方区块浏览器（用于「查看交易/合约」测试链接）
    explorer: "https://testnet.monadexplorer.com",
    // ✅ 订阅方法：标准 Ethereum newHeads（有序推送，实测通过）
    // 注意：monadNewHeads 也有效，但推送的是乱序区块（84386→84390→84387…），故不用。
    blockSubscription: "newHeads",
    faucet: "https://faucet.monad.xyz",
  },

  /* ---------------- 官方 / 资源链接（✅ 大部分已填）---------------- */
  links: {
    // ⚠️ 你提供的 Notion 资源页（已放入「资源」区；链接本身可用，内容需登录查看时为正常）
    resources: "https://monad-foundation.notion.site/11b6367594f282158200811b59062d68",
    monadDocs: "https://docs.monad.xyz",
    monadProtocols: "https://github.com/monad-crypto/protocols",
    monadTestnetCsv: "https://raw.githubusercontent.com/monad-crypto/protocols/refs/heads/main/protocols-testnet.csv",
    explorer: "https://testnet.monadexplorer.com",
    verifyContract: "https://monadvision.com/",
    privyDocs: "https://docs.privy.io",
    privyApiDocs: "https://docs.privy.io/api-reference/introduction#param-privy-app-id",
    privyDashboard: "https://dashboard.privy.io/apps?page=settings&tab=basics",
    // ✅ tutorial1（无 Gas 方案）= Pimlico 官方「第一笔无 Gas 交易」教程
    //    技术栈：permissionless.js + Safe 智能账户 + Pimlico Verifying Paymaster（ERC-4337）
    //    端点形如 https://api.pimlico.io/v2/<chain>/rpc?apikey=<KEY>
    tutorial1: "https://docs.pimlico.io/guides/tutorials/tutorial-1",
    sponsorDashboard: "https://dashboard.pimlico.io",
    // ✅ 你提供的 Monad Bridge（跨链桥）；非官方 Monad 基金会资产，谨慎核验
    monadBridge: "https://monadbridge.com/",
  },

  /* ---------------- 钱包 / 无 Gas（⚠️ 需你填）---------------- */
  wallet: {
    // ⚠️ Privy App ID：从 dashboard.privy.io 创建应用后获得，形如 clpxxxxx
    privyAppId: "",
    // Privy 需在其 Dashboard 中启用 Monad Testnet（chainId 10143）
    privyConfigured: false,
    // ⚠️ Gas Sponsorship 是否已在服务端配置（前端只能展示状态，不能伪造代付）
    gasSponsorshipConfigured: false,
  },

  /* ---------------- 保护合约 / 测试资产（⚠️ 需你填）---------------- */
  // 这里放「你自己的」保护合约与测试代币；未填时页面显示 NOT DEPLOYED / REQUIRED
  protection: {
    contractAddress: "",     // ⚠️ 你部署在 Monad Testnet 的保护合约地址 0x...
    contractAbi: [],         // ⚠️ 可选：ABI（接入真实写操作时需要）
    // ⚠️ 你给的 Uniswap 链接里的代币：0x88b8e2161dedc77ef4ab7585569d2415a1c1055d
    //    实测：Monad Testnet(10143) 与 Mainnet(143) 均无字节码、官方 registry 未收录
    //    → 目前按合成/占位处理，切勿当作已验证资产；确认网络与合约后替换
    testTokenAddress: "0x88b8e2161dedc77ef4ab7585569d2415a1c1055d",
    testTokenSymbol: "TEST", // ⚠️ 待核验：symbol() 无返回，暂用占位
    testTokenVerified: false,
    // 你给的完整 Uniswap 交易链接（chain=monad，注意 Uniswap 这里指向的是主网）
    uniswapSwapUrl: "https://app.uniswap.org/swap?chain=monad&inputCurrency=NATIVE&outputCurrency=0x88b8e2161dedc77ef4ab7585569d2415a1c1055d&value=1&field=input",
  },

  /* ---------------- 官方典型合约清单（✅ 来自 monad-crypto/protocols 官方 registry）----------------
   * 全部为 Monad Testnet (10143) 地址。空字符串 = registry 未收录，切勿用 Mainnet 地址顶替。
   * 每条都会渲染成可点击的 Explorer 链接，方便你逐条做「测试链接」验证。            */
  contracts: [
    { name: "Multicall3",              address: "0xca11bde05977b3631167028862be2a173976ca11", note: "Canonical" },
    { name: "Wrapped MON (WMON)",      address: "0xfb8bf4c1cc7a94c73d209a149ea2abea852bc541", note: "Canonical" },
    { name: "USDC (Circle)",           address: "0x534b2f3a21130d7a60830c2df862319e593943a3", note: "Stablecoin" },
    { name: "UniversalRouter",         address: "0x1b7bfcd2870329b987191910d85c22c7287f3c22", note: "Uniswap v4" },
    { name: "CreateX",                 address: "0xba5ed099633d3b313e4d5f7bdc1305d3c28ba5ed", note: "Canonical" },
    { name: "Permit2",                 address: "0x000000000022d473030f116ddee9f6b43ac78ba3", note: "Canonical" },
    { name: "UniswapV2Factory",        address: "", note: "Registry 未收录 · 待核验" },
    { name: "UniswapV2Router02",       address: "", note: "Registry 未收录 · 待核验" },
    { name: "UniswapV3Factory",        address: "", note: "Registry 未收录 · 待核验" },
    { name: "USDT",                    address: "", note: "Registry 未收录 · 待核验" },
    { name: "WBTC",                    address: "", note: "Registry 未收录 · 待核验" },
    { name: "WETH",                    address: "", note: "Registry 未收录 · 待核验" },
  ],

  /* ---------------- 数据 / 行情源（⚠️ 需你提供才有真实数据）---------------- */
  dataSources: {
    // ⚠️ CEX 行情 WebSocket（如 Binance wss://stream.binance.com:9443/ws/...）
    cexWs: "",
    // ⚠️ 后端报价 API（Vercel Serverless，如 /api/quote）
    quoteApi: "/api/quote",
  },

  /* ---------------- 功能开关 ---------------- */
  flags: {
    // 默认全部为模拟/只读。接好真实适配器后逐项打开。
    demoMode: true,          // 合成行情 + 模拟执行
    readOnlyObserver: true,  // 只读 RPC 观察区块（可真实连接）
    liveWallet: false,       // ⚠️ 配好 Privy 后改 true
    liveProtection: false,   // ⚠️ 保护合约 + 测试代币 + 后端就绪后改 true
  },
};
