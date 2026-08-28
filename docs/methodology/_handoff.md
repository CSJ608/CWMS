# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-29（定时回顾实验启动）

### 已完成

- **collab 实验二：定时项目回顾**（issue #20）：会话自动化 `automation-0726d4b5-d12b-405b-b140-862615f885ac`（工作日 09:00）自动汇总开放 issue/PR + CI 状态 + 24h 合并 + 快照下一步，回帖 #20。硬边界：只读 + 唯一写操作一条评论；MCP 不可用则放弃运行（不退回 gh）。首期基线纪要已发（评论 5454878072）。**待验证**：连续数个工作日纪要准确 → 人评审 → 决定是否升级 #21。注意：自动化随本工作区持久，删除即停。
- **collab 实验三设计稿**（issue #21，未实施）：PR 变红时 AI 自动修复推送——只推 PR 分支不碰 main、连续 2 次修复失败停手求助、前置条件是 #20 验证通过。
- **持久化缝预热**（issue #18 已关闭，PR #19，ADR-0011）：不拆缝（五问：无第二实现），实质改动是修复 `ledger/changed` 事件流守恒缺口——move 事件补 `from`（移出库位），重放语义固化为 `receive +qty@loc / ship -qty@loc / move -qty@from +qty@loc`；「重放重建账本」测试作为守恒性的可执行证明，事件流升格为审计/持久化格式。拆缝条件与两条候选形状（快照 store / 事件溯源）入档 ADR-0011。全景：13 包（workspace），ADR-0001~0011，73 测试。
- **大屏投影**（issue #16 已关闭，PR #17，ADR-0010）：dashboard-runtime 双件套——DashboardRuntime（卡片描述符 + 组合根 bindMetric + query，复刻 pc-runtime 模式）与 taskBoardPlugin（task/changed 事件喂养的分列作业看板读模型，卸载即重置）。**顺手修掉守卫漏洞**：check-deps 此前漏配 `client-registry`/`pda-runtime`/`pc-runtime` 的角色（意外豁免），新增 runtime 角色，13 包全合规。e2e 三端同步断言扩展为大屏卡片 + 作业看板；demo 第十幕。PR 正文用英文 `Closes #N` 可正常联动关闭 issue（中文不行，已验证）。
- **GitHub MCP 验收通过**（issue #5 已关闭）：人确认看板归档 + 终判通过；「MCP 闭环可用」及两个实测边界（中文关闭关键字不联动须显式 update_issue；工具面无 Projects 工具）已沉淀进 AGENTS.md 协作约定。今后 issue→PR→合并全程走 MCP，禁用 shell gh。
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

1. **#20 定时回顾验证**（人）：工作日 09:00 看纪要是否准确出现；连续数日准确 → 在 #20 回帖判定实验成败，再决定是否启动 #21（自动修 CI，设计已就绪）
2. **持久化第二实现**（等真实需求）：出现时按 ADR-0011 二选一路线拆缝，另立 ADR；当前事件流已具备重放资格
3. PC 表格过滤/排序描述符字段（等真实需求，勿预设计）
