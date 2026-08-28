# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-28（pda-runtime 落地）

### 已完成

- **pda-runtime 通用扫码工作流引擎**（issue #2 已关闭，PR #9，ADR-0006）：消费 PdaWorkflow 描述符驱动"提示→提交→推进"；形状级校验，领域校验仍属策略缝；组合根绑定（谁启动会话谁提供 onSubmit→receiveViaTask）；**feat-inbound 零改动获得 PDA 能力**；最终步 opId 链式传给领域层，断网重传领域层不被触达（e2e 断言）；测试 34→47 全绿。
- **core-task 任务机内核**（issue #1 已关闭，PR #8，ADR-0005）：显式迁移表 + opId 幂等推进；feat-inbound 新增 receiveViaTask；demo 第⑥幕。
- 参考资料索引 docs/references.md（PR #7）：理念出处五组 + 任务导向按需阅读地图；本地 Cordis 源码镜像在 `C:\work\OpenCode\deepseek-harness\vendor\cordis`。新会话冷启动：README → ADR → references.md。
- 仓库与机制：公开仓库 CSJ608/CWMS；CI 双检（PR 标题 + typecheck/test）；issue/PR 模板；labels；milestone v0.1；Project 看板 #4「CWMS Roadmap」（issue 关闭自动挪 Done 已验证）；main 分支保护；MIT 许可证。
- 早期成果：可逆内核（kernel）、契约包、库存账（core-ledger）、任务机（core-task）、策略缝三插件（zone/abc/veto）、收货纵切片（feat-inbound）、PDA 引擎（pda-runtime）、七幕叙事 demo。ADR-0001~0006。

### 门禁演练记录

- PR #6（许可证）→ #7（参考资料）→ #8（core-task）→ #9（pda-runtime）：分支 → 本地门禁 → PR → CI 双检 → squash 合并已成惯例。约定见 CONTRIBUTING：代码/契约/配置变更走 PR；交接快照可直接提交。

### 下一步（按优先级）

1. **配置 overlay 的 schema 与合并语义**（issue #3，ADR-0002 机制化）：zone/velocity 配置 schema 化、overlay 合并语义、组合约束校验；零配置断言与 overlay 断言框架级化
2. CI 依赖方向自动守卫（issue #4）：内核零策略 import、功能不互依、client 半身只过 contracts
3. PC 端投影雏形：表格/表单描述符消费（三端投影的第二端，思路对齐 pda-runtime）
4. 探索：GitHub MCP 接入 ZCode（issue #5），验证 AI 闭环管理 issue/PR/看板
