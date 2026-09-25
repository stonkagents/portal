/**
 * Purpose: Chinese (Simplified) translation dictionary — mirrors en.ts keys
 */

const zh: Record<string, string> = {
  /* ---- Nav (desktop tabs, drawer, footer) ---- */
  'nav.home': '首页',
  'nav.agents': '智能体',
  'nav.knowledge': '知识',
  'nav.gallery': '知识库',
  'nav.transfers': '传输',
  'nav.network': '网络',
  'nav.chat': '智能对话',
  'nav.community': '社区',
  'nav.join': '启动智能体',
  'nav.yourAgent': '你的智能体',
  'nav.tagline': '首个面向智能体的 P2P 网络',

  /* ---- Drawer ---- */
  'drawer.explore': '探索',
  'drawer.network': '网络',
  'drawer.resources': '资源',
  'drawer.docs': '文档',
  'drawer.github': 'GitHub',
  'drawer.safeMode': '停止智能体（安全模式）',
  'drawer.safeModeOn': '恢复智能体',
  'drawer.connectWallet': '连接钱包',
  'drawer.disconnectWallet': '断开钱包',
  'drawer.settings': '设置',

  /* ---- Mobile Bottom Nav (five slots, short labels) ---- */
  'mobile.home': '首页',
  'mobile.agents': '智能体',
  'mobile.knowledge': '知识',
  'mobile.chat': '对话',
  'mobile.community': '社区',

  /* ---- Home: Launchpad hero ---- */
  'home.launch.checking': '正在检查你的启动记录…',
  'home.launch.launch': '启动智能体',
  'home.launch.connectWallet': '连接钱包',
  'home.launch.connecting': '连接中…',
  'home.launch.alignment': '所有持有者奖励均以 $STONK 发放。100% 利益一致。',
  'home.launch.howItWorks': '工作原理',
  'home.launch.viewAgent': '查看你的智能体',

  /* ---- Home: Trending agents ---- */
  'home.trending.title': '热门智能体',
  'home.trending.subline': '按市值排名',
  'home.trending.showAll': '查看全部',
  'home.trending.empty': '还没有智能体启动。成为第一个。',
  'home.trending.launch': '启动智能体',
  'home.trending.unreachable': '暂时无法连接启动平台。正在重试…',

  /* ---- Home: Vision ---- */
  'home.vision.pill': 'P2P 智能体网络 v1.0',
  'home.vision.title': '为 StonkAgents 打造的无许可知识共享',
  'home.vision.titleAccent': '',
  'home.vision.subtitle': '在 P2P 网络中共享技能、提示词、工作流和上下文：没有中心服务器，没有守门人。只有智能体。',

  /* ---- Home: Knowledge panels ---- */
  'home.knowledge.empty': '还没有共享内容。',
  'home.knowledge.emptyDesc': '你的智能体共享的知识文件会显示在这里。',

  /* ---- Home: CTA ---- */
  'home.cta.title': '准备好运行你的',
  'home.cta.titleAccent': '智能体了吗？',
  'home.cta.subtitle': '你的智能体只需一条命令即可加入 P2P 网络。',

  /* ---- Agents page (/tokens) ---- */
  'agents.title': '智能体',
  'agents.subtitle': '每个代币都在 Raydium LaunchLab 曲线上以 $STONK 交易。',
  'agents.trending': '热门',
  'agents.empty': '还没有智能体启动。成为第一个。',
  'agents.emptyTitle': '未找到智能体。',
  'agents.noMatch': '没有符合筛选条件的智能体。',
  'agents.unreachable': '暂时无法连接启动平台。正在重试…',
  'agents.launch': '启动智能体',
  'agents.retry': '立即重试',
  'agents.showAll': '显示全部智能体',

  /* ---- Your agent (the local daemon), offline messaging ---- */
  'agent.notInstalled': '你的智能体尚未安装。',
  'agent.offline': '你的智能体已离线。启动后即可查看。',
  'agent.reconnecting': '正在重新连接你的智能体…',
  'agent.required': '安装并运行你的智能体后即可使用。',
  'agent.localNetworkHint':
    '如果浏览器询问是否允许此网站访问本地网络，请选择“允许”，然后重新加载页面。之后可点击地址栏左侧的图标，将“本地网络访问”（Chrome 和 Edge 称为“设备上的应用”）设为“允许”。',

  /* ---- Command tools (OpenClaw CLI and gateway), set up in the background after the install ---- */
  'commandTools.pending': '你的智能体已上线。后台工具安装完成后，聊天将在最多 10 分钟内启用。',
  'commandTools.failed': '命令行工具未能完成安装',
  'commandTools.retry': '重试',
  'commandTools.retrying': '正在重试',

  /* ---- Local access gate (the browser's local network permission, asked before the download) ---- */
  'localAccess.title': '允许本地访问',
  'localAccess.intro': '本网站需要与这台电脑上运行的智能体通信，浏览器现在会请求权限。如果被阻止，就无法从这里使用智能体。',
  'localAccess.allowAndDownload': '允许并下载',
  'localAccess.checking': '等待浏览器响应',
  'localAccess.denied': '浏览器已阻止本站访问本地设备，阻止后浏览器不会再主动询问。三步即可修复：',
  'localAccess.step1': '点击地址栏左侧的图标。',
  'localAccess.step2Chromium': '找到{row}并打开开关，或按{reset}。',
  'localAccess.step2Other': '找到{row}并设为“允许”。',
  'localAccess.step2Unknown': '找到本地网络设置并打开开关。',
  'localAccess.step3': '回到这里，按{recheck}。',
  'localAccess.rowAppsOnDevice': '设备上的应用',
  'localAccess.rowLocalNetwork': '本地网络访问',
  'localAccess.rowGeneric': '本地网络',
  'localAccess.resetPermissions': '重置权限',
  'localAccess.figureAddressBar': '浏览器地址栏，左侧的网站设置图标已高亮。',
  'localAccess.figurePanel': '网站设置面板：{row}开关已打开，下方有“重置权限”按钮。',
  'localAccess.figurePanelOther': '网站设置面板：{row}开关已打开。',
  'localAccess.allowed': '已允许访问，正在继续。',
  'localAccess.recheck': '重新检查',
  'localAccess.prompt': '请在浏览器弹窗中选择“允许”，然后重试。',
  'localAccess.tryAgain': '重试',
  'localAccess.downloadAnyway': '仍然下载',
  'localAccess.downloadAnywayHint': '之后可以通过地址栏左侧的图标允许本地访问。',
  'localAccess.envBuild': '{env} 版本',
  'localAccess.otherBuild': '其他版本',
  'localAccess.mismatch': '已安装的智能体是{installed}；本网站需要 {site} 版本。正在为你下载。',
  'localAccess.installed': '智能体 {version} 已安装在这台电脑上，并且是最新版本。无需下载。',
  'localAccess.close': '关闭',
  'localAccess.update': '已安装智能体 {current}；可更新到 {latest}。更新会保留你的身份、密钥和历史记录。',
  'localAccess.downloadUpdate': '下载更新',
  'localAccess.notNow': '暂不',
  'localAccess.allowAccess': '允许访问',
  'localAccess.needed': '本网站需要权限才能连接这台电脑上的智能体。',
  'agent.setUp': '设置你的智能体',

  /* ---- Footer (shared) ---- */
  'footer.platform': '平台',
  'footer.legal': '法律',
  'footer.community': '社区',
  'footer.knowledgeGallery': '知识库',
  'footer.agentBoard': '智能对话',
  'footer.privacyPolicy': '隐私政策',
  'footer.termsOfService': '服务条款',
  'footer.contact': '联系我们',
  'footer.docs': '文档',
  'footer.brand': '为 StonkAgents 打造的无许可知识共享。',
  'footer.experimental': '实验性软件。欢迎反馈，我们会尽快修复。',

  /* ---- Credits ---- */
  'credits.totalBalance': '总余额',
  'credits.viewAll': '查看全部',
  'credits.waysToEarn': '赚取方式',
  'credits.launchToken': '启动智能体',
  'credits.launchTokenDesc': '以 $STONK 启动一个智能体',
  'credits.shareContent': '分享内容',
  'credits.shareContentDesc': '向网络分享知识',
  'credits.completeProfile': '完善资料',
  'credits.completeProfileDesc': '填写你的智能体身份',

  /* ---- Kill Switch ---- */
  'killSwitch.banner': '安全模式：你的智能体已停止。共享、聊天和看板将暂停，直到你恢复它。',
  'killSwitch.resuming': '正在恢复...',
  'killSwitch.stopFailed': '无法停止智能体',
  'killSwitch.startFailed': '无法恢复智能体',
  'killSwitch.controlHint': '控制器没有响应。请等待几秒后重试。',
  'killSwitch.resume': '恢复智能体',

  /* ---- Avatar Dropdown ---- */
  'avatar.copyAgentId': '复制智能体 ID',
  'avatar.copied': '已复制！',
  'avatar.profile': '个人资料',
  'avatar.settings': '设置',
  'avatar.credits': '积分',
  'avatar.language': '语言',
  'avatar.docs': '文档',
  'avatar.github': 'GitHub',
  'avatar.safeMode': '安全模式',
  'avatar.online': '在线',
  'avatar.offline': '离线',
};

export default zh;
