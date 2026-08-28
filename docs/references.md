# 参考资料：理念的出处与按需阅读地图

> 本仓库实践的概念不是凭空发明的。这份索引回答两个问题：**这些理念从哪来**，
> 以及**新会话在什么任务下应该读什么**。每条都附一句"为什么读它"。
> 标 📁 的是本地资源（离线可查，优先读）；标 🌐 的是网络资源。

## 源体系：我们复刻的内核语义从哪来

CWMS 的 kernel 是 Cordis（Koishi 的微内核）的教学级复刻，理念词汇表
（可逆性、缝、waterfall 短路、纵切片）全部来自这条 lineage：

| 资源 | 说明 |
|---|---|
| 📁 `C:\work\OpenCode\deepseek-harness\vendor\cordis` | **Cordis 源码本体**。要理解内核机制的真实工业实现（Proxy、Fiber、effect 回滚），读这里 |
| 📁 `C:\work\OpenCode\deepseek-harness\docs\` | DSH 全部子系统文档（含中文版），Cordis 在业务规模上的应用样本 |
| 🌐 [Cordis 官方文档](https://cordis.moe/zh-CN/) | 元框架概念：服务与依赖、生命周期、事件。内核机制的标准表述 |
| 🌐 [Koishi：可逆的插件系统](https://koishi.chat/zh-CN/cookbook/design/disposable.html) | **可逆性哲学的原始表述**——"任意装卸后行为只与最终启用集合有关"。ADR-0001 的直接出处 |
| 🌐 [DSH：Cordis 入门](https://deepseek-harness.github.io/deepseek-harness/reference/cordis-primer) | 插件/Context/inject/事件分发模式（emit/waterfall/parallel/serial）的最佳入门 |
| 🌐 [DSH：能力 Seams 与核心服务](https://deepseek-harness.github.io/deepseek-harness/reference/capability-seams) | "缝"这个词的出处：接口包 + 多 provider 包的组织方式（ctx.shell 是模板） |
| 🌐 [DSH：添加 workspace 包](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/adding-a-package) | **包拓扑原则原文**："Definition/Provider/Consumer 需要独立演进时才拆包"。ADR-0003 的出处 |
| 🌐 [DSH：扩展插件形态](https://deepseek-harness.github.io/deepseek-harness/reference/cookbook/extension-cookbook) | "每个功能都是文档化扩展点上的监听器，没有任何一行修改循环本身" |
| 🌐 [DSH：Client 模块](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/client-modules) | ctx.clientModules 注册表——CWMS client-registry 的对标物 |

## 反面教材：插件化的代价与边界

避免把"一切皆插件"读成教条。这一组是解毒剂：

| 资源 | 说明 |
|---|---|
| 🌐 [Maël Nison：Plugin systems — when & why?](https://dev.to/arcanis/plugin-systems-when-why-58pp) | Yarn 作者。三个关键论点：**插件是约束不是自由**；"plugins are dangerous"——不懂设计空间别插件化；**"构建模块化架构"和"允许第三方接入"是两个独立决策** |
| 🌐 [Eclipse 架构（AOSA 第一章）](https://aosabook.org/en/v1/eclipse.html) | "一切皆插件"的工业级鼻祖与警示：扩展点石化、组合复杂度爆炸 |
| 🌐 [OSGi：Accidental Complexity](https://blog.osgi.org/2013/07/accidental-complexity.html) | 官方博客承认的第一周 ClassNotFound 地狱——模块化的防腐费有多贵 |
| 🌐 [Backstage：Everything is a Plugin (InfoQ)](https://www.infoq.com/presentations/backstage-plugin/) | 插件化支撑数百工程师分布式所有权的正面案例，代价是核心升级的长尾 |
| 🌐 [Erich Gamma 访谈 (Coding Horror)](https://blog.codinghorror.com/conversations-with-erich-gamma/) | Eclipse 主架构师到 VS Code 的设计转向：扩展 API 要小而稳，宁可少给不给错 |

## 模块化与包拓扑

| 资源 | 说明 |
|---|---|
| 🌐 Parnas《On the Criteria To Be Used in Decomposing Systems into Modules》(1972) | 模块化 = 信息隐藏的源头经典（按标题检索原文）。判断"这条边界切对了没有"的尺子 |
| 🌐 [Monorepo 前后端共享类型实践](https://dev.to/lico/step-by-step-guide-sharing-types-and-values-between-react-esm-and-nestjs-cjs-in-a-pnpm-monorepo-2o2j) | contracts 包为什么是前后端之间唯一必拆的边界 |
| 🌐 [LaunchDarkly：用 monorepo 保持前后端同步](https://launchdarkly.com/docs/tutorials/keeping-your-frontend-and-backend-in-sync-with-a-monorepo) | 契约包防 API 漂移的工程价值 |

## WMS 语境与协作方法（本地资源）

| 资源 | 说明 |
|---|---|
| 📁 `C:\work\OpenCode\AWms` | **真实的下一代 WMS 项目（.NET + React）**——CWMS 理念的回流目标；其 AGENTS.md 五阶段方法论是本仓库协作约定的参照系 |
| 📁 `C:\work\OpenCode\MWms` | 旧系统参照。"配置的复杂度均摊"问题的活样本（ADR-0002 的现实背景） |

## 工程规范

- 🌐 [Conventional Commits](https://www.conventionalcommits.org/zh-hans/) —— 提交与 PR 标题规范（CI 强制）
- 🌐 [ADR（Architecture Decision Records）](https://adr.github.io/) —— Nygard 式决策记录；本仓库 `docs/adr/` 只追加不改写

---

## 按需阅读地图（新会话从这里查）

| 你正要做的任务 | 先读 |
|---|---|
| 冷启动理解本仓库在探索什么 | README → ADR-0001 → 本文件"源体系"表 |
| 决定某个东西要不要做成插件/缝 | ADR-0001 五问 → Maël Nison 那篇 → Eclipse 教训 |
| 设计新的包/拆分现有包 | ADR-0003 → DSH《添加 workspace 包》 |
| 设计或评审配置项 | ADR-0002 → 看 MWms 的反例 |
| 动内核机制 | `vendor/cordis` 源码 ↔ Koishi《可逆的插件系统》→ kernel 测试用例 |
| 设计客户端投影（PDA/大屏） | ADR-0004 → DSH《Client 模块》 |
| 改协作流程/工程设施 | issue #5（MCP 实验）→ AWms 的 AGENTS.md 方法论 |
