# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-28（core-task 落地）

### 已完成

- **core-task 任务机内核**（issue #1 已关闭，PR #8，ADR-0005）：created→assigned→executing→completed/cancelled 显式迁移表；opId 幂等推进（重放返回当时快照，不重复执行/发事件，跨任务复用报错）；task/changed 事件（from='void' 表示创建）；feat-inbound 新增 receiveViaTask（PDA 弱网重试安全，同 opId 重放账本不变）；demo 第⑥幕；测试 19→34 全绿。
- 参考资料索引 docs/references.md（PR #7）：理念出处五组（源体系/反面教材/模块化/WMS 语境/工程规范）+ 任务导向按需阅读地图；本地 Cordis 源码镜像在 `C:\work\OpenCode\deepseek-harness\vendor\cordis`。新会话冷启动：README → ADR → references.md。
- 仓库与机制：公开仓库 CSJ608/CWMS；CI 双检（PR 标题 + typecheck/test）；issue/PR 模板；labels；milestone v0.1；Project 看板 #4「CWMS Roadmap」；main 分支保护（禁 force-push/删除）；MIT 许可证（PR #6）。
- 早期成果：可逆内核（kernel）、契约包、库存账（core-ledger）、策略缝三插件（zone/abc/veto）、收货纵切片（feat-inbound）、六幕叙事 demo。ADR-0001~0005。

### 门禁演练记录

- PR #6（许可证）→ #7（参考资料）→ #8（core-task）：分支 → 本地门禁 → PR → CI 双检 → squash 合并已成惯例。约定见 CONTRIBUTING：代码/契约/配置变更走 PR；交接快照可直接提交。

### 下一步（按优先级）

1. **PDA 工作流 runtime 雏形**（issue #2）：消费 PdaWorkflow 描述符，mock 扫码逐步推进 receiveViaTask——把"扫码 = 幂等推进"真正接到端上
2. 配置 overlay 的 schema 与合并语义（issue #3）：zone/velocity 配置 schema 化
3. CI 依赖方向自动守卫（issue #4）：内核零策略 import、功能不互依
4. 探索：GitHub MCP 接入 ZCode（issue #5），验证 AI 闭环管理 issue/PR/看板
