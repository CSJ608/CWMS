# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-28（PC 投影落地，三端已通两端）

### 已完成

- **PC 端投影雏形**（issue #12 已关闭，PR #13，ADR-0009）：pc-runtime 表格投影引擎（PcTable 描述符 + 组合根 bindProvider + query 组装）；feat-inbound 登记'库存一览'十行声明即获得 PC 能力；e2e 断言一次领域操作三端投影同步（PDA 驱动/PC 呈现/大屏计数）。
- **依赖方向自动守卫**（issue #4 已关闭，PR #11，ADR-0008）：check-deps 按角色检查声明图+实际图进 CI；首跑抓 8 处违规；服务接口契约化（LedgerReader 只读视图）；12 包合规。
- **配置 schema 与 overlay 合并语义**（issue #3 已关闭，PR #10，ADR-0007）。
- **pda-runtime 通用扫码工作流引擎**（issue #2 已关闭，PR #9，ADR-0006）。
- **core-task 任务机内核**（issue #1 已关闭，PR #8，ADR-0005）。
- 参考资料索引 docs/references.md（PR #7）：理念出处 + 按需阅读地图；本地 Cordis 源码镜像 `C:\work\OpenCode\deepseek-harness\vendor\cordis`。新会话冷启动：README → ADR → references.md。
- 全景：13 包（kernel/contracts/core-ledger/core-task/client-registry/pda-runtime/pc-runtime/三策略插件/feat-inbound/demo），九幕 demo，ADR-0001~0009，65 测试，CI 三检（守卫/PR 标题/typecheck+test），看板自动归档，main 分支保护，MIT。

### 门禁演练记录

- PR #6→#13：分支 → 本地门禁（check:deps + typecheck + test）→ PR → CI 三检 → squash 合并已成惯例。约定见 CONTRIBUTING：代码/契约/配置变更走 PR；交接快照可直接提交。

### 下一步（按优先级）

1. **大屏投影补全**（三端的最后一段）：task/changed 事件驱动的作业看板读模型 + dashboard-runtime 供卡片指标（复用 pc/pda 已确立的模式）
2. 探索：GitHub MCP 接入 ZCode（issue #5），验证 AI 闭环管理 issue/PR/看板——需要用户在 ZCode 配置一次 MCP server
3. 持久化缝预热：core-ledger 存储接口设计（内存实现已稳，第二个实现出现时拆缝）
4. 真实感增强：PC 表格加过滤/排序描述符字段（等真实需求，勿预设计）
