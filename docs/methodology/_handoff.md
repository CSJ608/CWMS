# 交接快照

> 每次会话结束前更新本文件：下次会话从这里继续。

## 最近更新：2026-08-28（v0 起步）

### 已完成

- 全流程门禁首次演练（PR #6，MIT 许可证）：分支 → 本地门禁 → PR → CI 双检（标题规范+类型测试）→ squash 合并 → main CI 绿。约定已写入 CONTRIBUTING：代码/契约/配置变更走 PR；交接快照可直接提交。

- 仓库骨架：pnpm monorepo + TS（module ESNext + Bundler resolution），vitest，9 包
- 内核 `@cwms/kernel`：provide/getService、inject 校验、LIFO 副作用回滚、级联卸载、依赖图清理、emit/waterfall（短路语义）、reload
- 契约 `@cwms/contracts`：领域类型、服务 key、事件契约（声明合并）、客户端描述符
- 账本 `@cwms/core-ledger`：唯一变更通道、负库存拒绝、原子 move、ledger/changed 事件
- 策略缝示例：putaway-zone（缺省）、putaway-abc（overlay 配置）、veto-mixed-lot（短路否决）
- 纵切片 `@cwms/feat-inbound`：host 服务 + PDA 工作流描述符 + 大屏卡片 + 投影插件
- 演示 `apps/demo`：五幕叙事全部跑通（含"策略先注册、校验后注册"顺序约定）
- 验证：typecheck 绿，19/19 测试绿
- 文档：ADR-0001~0004、README、CONTRIBUTING、AGENTS.md
- GitHub：仓库已公开（CSJ608/CWMS），CI 绿、issue/PR 模板、labels、milestone、issues #1~#5、Project 看板 #4「CWMS Roadmap」（5 个 issue 已挂载）、main 分支保护已开（禁 force-push/删除，要求会话解决）

### 下一步（按优先级）

1. 任务机内核 `core-task`（状态机 + 幂等推进）——PDA 语义的地基
2. PDA 工作流 runtime 的第一个可运行实现（消费描述符，mock 扫码）
3. 配置分层 schema 化：overlay 的合并语义与校验
4. CI 增加依赖方向自动守卫（检查 package.json 依赖 + 内核零策略 import）
5. 探索：GitHub MCP 接入 ZCode，验证 AI 闭环管理 issue/PR
