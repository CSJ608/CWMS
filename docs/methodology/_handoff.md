# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-29（第二纵切片落地——"新功能即新包"首次可执行验证）

- **feat-outbound 第二纵切片**（issue #23 已关闭，PR #24，ADR-0012）：拣货出库 = 新包（host 半身 + 三端描述符 + 出库读模型投影），复用任务机 kind='pick' 与账本 ship 通道；**内核与端 runtime 零 diff（命题可执行证明）**；contracts 仅词汇表扩展（OUTBOUND/OutboundLine/todayOutboundQty）。不新增策略缝。全景：14 包（workspace），ADR-0001~0012，80 测试，demo 十一幕。

## 上一步：2026-08-29（#21 值守注册，实验进入无人值守验证期）

### 已完成

- **collab 实验三值守注册**（issue #21）：自动化 `automation-2357de60-6f8b-4632-910f-128ebc468415`（每 2 小时）巡检 open PR 的 check_runs，按定稿提示词（#21 评论 5459416228）只修类型红/守卫红、`fix(ci)` 推 PR 分支、复查至绿后在 PR 与 #21 记录、测试红或连续 2 败停手求助、永不推 main、无红静默。注册时点 main @ 93b23a5、无开放 PR（注册记录见 #21 评论 5459445190）。**验证期判定留给人**：观察真实修复/求助的质量 → 决定关闭（升级常态）或回退。注意：自动化随本工作区持久，删除即停；该自动化独占本工作区值守会话（一任务一会话）。
- **collab 实验二：定时项目回顾**（issue #20）：会话自动化 `automation-0726d4b5-d12b-405b-b140-862615f885ac`（每天 09:00，应人要求从工作日放宽）自动汇总开放 issue/PR + CI 状态 + 24h 合并 + 快照下一步，回帖 #20。硬边界：只读 + 唯一写操作一条评论；MCP 不可用则放弃运行（不退回 gh）。首期基线纪要已发（评论 5454878072）。**待验证**：连续数个工作日纪要准确 → 人评审 → 决定是否升级 #21（#21 值守已注册，此判定并入 #21 验证期一并观察）。注意：自动化随本工作区持久，删除即停。
- **collab 实验三设计稿与演练**（issue #21）：PR 变红时 AI 自动修复推送——只推 PR 分支不碰 main、连续 2 次修复失败停手求助。演练 PR #22 红→绿约 5 分钟一次修复成功（记录 #21 评论 5459416228）；MCP 无 Actions 日志工具，诊断路径定为本地复现。
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

1. **#21/#20 验证期观察**（人主导，AI 待命）：值守每 2 小时自动巡检，修复记录/求助会自动落到 #21；回顾纪要每天 09:00 落到 #20。人评审若干次真实修复与纪要的质量后判定：#21 关闭（升级常态）或回退（删自动化即停）。AI 会话期间如被问到实验状态，先读 #20/#21 最新评论
2. **持久化第二实现**（等真实需求）：出现时按 ADR-0011 二选一路线拆缝，另立 ADR；当前事件流已具备重放资格
3. PC 表格过滤/排序描述符字段（等真实需求，勿预设计）
