# AGENTS.md — CWMS 的 AI 地图

本文件是给所有 AI 工具（ZCode / Claude 等）的**地图**，每次会话自动加载。先读它，再动手。

## 项目是什么

CWMS 不是产品，是**试验田**：实践"一切皆插件"理念、探索工程管理、探索人机协作。
载体是 WMS 领域（内核 = 库存账；缝 = 策略与校验；三端 = 投影）。语言与框架服务于理念，不是理念服务于语言。

## 必读文档（按顺序）

1. [README.md](README.md) —— 定位、包地图、架构一页图
2. [docs/adr/](docs/adr/) —— **全部已接受的 ADR**。任何与 ADR 冲突的方案，要么改方案，要么先提 ADR 修订
3. [docs/methodology/_handoff.md](docs/methodology/_handoff.md) —— 交接快照：上次进度与下一步

## 会话开始做什么

1. 读交接快照，定位进度
2. `pnpm test && pnpm typecheck` 确认起点是绿的
3. 有 `docs/iterations/active/` 则读当前批次计划

## 关键约定（摘要，违反即返工）

- **依赖方向铁律**（ADR-0003）：功能/策略 → contracts + kernel；内核不 import 策略；client 半身只通过 contracts 对话
- **可逆性纪律**（ADR-0001）：每次注册必须配对 disposer（`ctx.effect` 或框架自动管理）；测试必须覆盖卸载路径
- **waterfall 注册顺序约定**（ADR-0001）：策略（排序）先挂载，校验（否决）最后挂载
- **配置项预算制**（ADR-0002）：新增配置项先论证"为什么不能是推断/约定/数据"；零配置必须可用
- **缝的准入五问**（ADR-0001）：多实现？缝稳定？故障隔离？生命周期可拥有？核心无需知道细节？有一条不过 → 普通模块
- **决策走 ADR**：影响拓扑、契约、配置面、缝的变更，先写 ADR 再写代码
- **提交约定**：Conventional Commits + 中文描述（`feat(kernel): …`）
- **"已完成"以 git 和测试为准**：绿了才算完成；`pnpm typecheck && pnpm test` 是门禁

## AI 协作约定（本仓库是实验场）

- 人负责方向判断与评审门禁；AI 负责实现、测试、文档与机制探索
- 大范围探索用子智能体（Explore），主会话保持决策与编辑
- 每次会话结束前更新 `_handoff.md`（下次会话从哪里继续）
- 新的协作方式实验（MCP、自动化、CI 里的 AI 步骤）记录到 issues，标签 `collab`
