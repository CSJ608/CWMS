# Agent Lab：多智能体路线图自治实验（issue #27）

> 形态：**1 编排者（PM）+ 1 执行者 + 5 评审门**，围绕路线图状态机运转。
> 设计依据：MAST 失败分类（协调失败是多智能体头号死因）、Cognition《Don't Build
> Multi-Agents》（执行者交接丢上下文、动作携带隐式决策）、Anthropic 编排者-工人
> 架构（无状态并行验证是多智能体真正有效的用法）。

## 铁律

1. **确定性门禁优先于 LLM 门禁**：CI 三检（守卫/标题/typecheck+test）是硬门，
   AI 评审只管 CI 管不了的——美观、易用、架构一致性、测试诚意、代码微观质量。
2. **单执行者**：任意时刻只有一个智能体在写代码，串行、持有完整上下文。
   多角色全部是无状态评审：每次从零读产物，只拿 rubric + 材料，不带上一轮印象。
3. **独立性**：评审门与执行者是不同子智能体，零共享上下文。这是代码评审有效的
   前提——作者回头看自己的代码，看到的是自己隐式决策的合理化。
4. **门禁矩阵**：路线图每项声明必须过哪些门（非全开）。门只在管辖范围有戏可唱时
   出场，控制成本（子智能体 token ≈ 4×）并降低橡皮图章化。
5. **评审必须给证据**：verdict 一律 `pass/fail + 逐条证据`（file:line、截图描述、
   操作步骤）；fail 必须可复现；不确定 → fail 并说明存疑点（从严者胜）。
6. **预算与熔断**：每 PR 修复 ≤2 轮；连续 2 项路线图项失败停机；实验总 PR ≤10；
   所有合并仍走 PR + CI 绿；PM 永不直推 main。

## 迭代循环

```
PM 取路线图下一项
  → 派工执行者（一次一项）
  → 执行者实现 + 自查（AGENTS.md 硬约定）→ 推分支 → 开 PR
  → CI 三检（硬门）
  → 按该项门禁矩阵派发评审门（并行，各出结构化 verdict）
  → 有 fail：执行者修复（≤2 轮）→ 重新过门
  → 全 pass：PM 经 MCP squash 合并 → 更新路线图勾选 + 指标记录
  → 下一项
路线图全勾 或 熔断 → PM 写总结报告（issue #27 + 交接快照）→ 停止
```

## 指标记录（每 PR 一行，记录进 #27 评论）

| 字段 | 说明 |
|---|---|
| 修复轮数 | 0/1/2 |
| 各门 verdict | ux/visual/arch/quality/code：pass 或 fail(拦截条数) |
| 拦截明细 | 每条：门 / 内容 / 执行者是否采纳 |
| 人工干预 | 次数与原因（目标 0） |
| 失败归类 | 按 MAST：规约 / 协调 / 验证 |

## 验证协议

- **Phase 0 注入测试（先跑）**：6 个已知问题分支（低对比度文字、alert 残留、
  缺 disposer、渲染器内算库存、弱断言测试、`as` 类型欺骗），五门盲审度量
  命中率与误报。门禁可靠性不达标不进入 Phase 1。
- **Phase 1 自治运行**：PM 驱动路线图 agent-lab-1（4 项）。
- **判定**见 issue #27：全票通过 = 实验失败（角色未真正行使专业知识）。

## 角色清单

提示词即岗位知识，逐份独立文件（评审子智能体只加载自己的）：

- [pm.md](roles/pm.md) ｜ [executor.md](roles/executor.md)
- [ux-reviewer.md](roles/ux-reviewer.md) ｜ [visual-reviewer.md](roles/visual-reviewer.md)
- [architecture-reviewer.md](roles/architecture-reviewer.md)
- [quality-reviewer.md](roles/quality-reviewer.md) ｜ [code-reviewer.md](roles/code-reviewer.md)
