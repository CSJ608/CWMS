# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-28（依赖方向守卫落地）

### 已完成

- **依赖方向自动守卫**（issue #4 已关闭，PR #11，ADR-0008）：`scripts/check-deps.mjs` 按包角色检查声明图+实际图，进 CI；首跑抓出 8 处现行违规；服务接口契约化（LedgerReader 只读视图——策略看不见账本变更通道，Parnas 信息隐藏落点）；feat-inbound/veto 依赖瘦身到 contracts+kernel；11 包全部合规。
- **配置 schema 与 overlay 合并语义**（issue #3 已关闭，PR #10，ADR-0007）：Plugin.configSchema + resolveConfig；零配置→全默认、record 深合并、未知键报 ConfigError、reload 原子化；demo 第⑧/⑧b幕。
- **pda-runtime 通用扫码工作流引擎**（issue #2 已关闭，PR #9，ADR-0006）：组合根绑定，feat-inbound 零改动获得 PDA 能力，链式幂等。
- **core-task 任务机内核**（issue #1 已关闭，PR #8，ADR-0005）：显式迁移表 + opId 幂等推进。
- 参考资料索引 docs/references.md（PR #7）：理念出处 + 按需阅读地图；本地 Cordis 源码镜像 `C:\work\OpenCode\deepseek-harness\vendor\cordis`。新会话冷启动：README → ADR → references.md。
- 仓库与机制：公开仓库 CSJ608/CWMS；CI 三检（守卫/PR 标题/typecheck+test）；issue/PR 模板；Project 看板 #4（自动归档 Done）；main 分支保护；MIT。全景：kernel、contracts、core-ledger、core-task、client-registry、pda-runtime、策略缝三插件、feat-inbound、八幕 demo、ADR-0001~0008、58 测试。

### 门禁演练记录

- PR #6→#7→#8→#9→#10→#11：分支 → 本地门禁（check:deps + typecheck + test）→ PR → CI 三检 → squash 合并已成惯例。约定见 CONTRIBUTING：代码/契约/配置变更走 PR；交接快照可直接提交。

### 下一步（按优先级）

1. **PC 端投影雏形**：表格/卡片描述符 + 消费 runtime（三端投影的第二端，思路对齐 pda-runtime 的组合根绑定）
2. 大屏投影增强：task/changed 事件驱动作业看板读模型
3. 探索：GitHub MCP 接入 ZCode（issue #5），验证 AI 闭环管理 issue/PR/看板——需要用户在 ZCode 配置一次 MCP server
4. 持久化缝预热：core-ledger 的存储 provider 接口设计（内存实现已稳，第二个实现出现时拆缝）
