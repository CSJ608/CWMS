# 贡献指南

## 分支与提交

- `main` 保持绿色：`pnpm typecheck && pnpm test` 通过才允许合并
- **代码、契约、配置面变更走 PR 门禁**：分支 → PR → CI 绿 → squash 合并（PR 标题即 Conventional Commits）
- 交接快照（`docs/methodology/_handoff.md`）等过程文档可直接提交 main
- 提交信息：Conventional Commits + 中文描述，例如
  - `feat(kernel): 服务卸载时清理依赖图`
  - `docs(adr): 起草配置分层修订`
  - `chore(ci): 增加依赖方向检查`
- PR 标题即首条提交信息，CI 校验格式

## 决策流程（ADR）

影响以下任一项的变更，先提 ADR（`docs/adr/NNNN-标题.md`），走 issue + PR 评审：

- 包拓扑（新增/拆分包）
- 契约（contracts 包的任何导出）
- 配置面（新增配置项）
- 内核语义（事件模式、生命周期、卸载规则）

ADR 只追加不改写；修订新开编号并引用旧编号。

## 测试门禁

- 内核行为变更必须同时改内核测试
- 新插件必须证明：零配置可用（或透明直通）、卸载可逆、与既有插件的顺序语义
- "已完成"以 git 与测试为准，不以文档为准
