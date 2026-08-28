# CWMS

> 一切皆插件的 WMS 试验田。语言只是工具，这里的产出是**理念、工程方法、人机协作方式**。

CWMS 探索三件事：

1. **开发理念**——"一切皆插件"在业务系统（以 WMS 为载体）里意味着什么：内核只剩不变量与接缝定义，一切会变的东西都是缝上的可插拔决策。
2. **工程管理**——包拓扑、ADR 决策记录、契约先行、可逆性纪律，如何让项目制的"标准产品 + 定制开发"不再退化为配置泥潭。
3. **人机协作**——与 AI 结对（ZCode 等）的最高效方式：AGENTS.md 地图、交接快照、issue 驱动、评审门禁。

## 快速开始

```sh
pnpm install
pnpm test      # 19 个测试：内核语义 + 账本不变量 + 端到端纵切片
pnpm demo      # 一条可演示的收货上架工作流（混放否决 / 热插拔 / 可逆性 / ABC overlay）
```

## 包地图（v0）

| 包 | 角色 | 一句话 |
|---|---|---|
| `packages/kernel` | 内核 | 可逆插件机制：服务注入、LIFO 副作用回滚、级联卸载、emit/waterfall 事件 |
| `packages/contracts` | 契约 | 全系统唯一跨包词汇表：领域类型、服务 key、事件契约、客户端描述符 |
| `packages/core-ledger` | 内核 | 库存账：唯一变更通道，拒绝负库存，守护账实守恒 |
| `packages/core-task` | 内核 | 任务机：显式迁移表 + opId 幂等推进（PDA 弱网重试安全），领域无关 |
| `packages/client-registry` | 内核 | 客户端模块注册表：client 半身是数据描述符，不是页面 |
| `packages/pda-runtime` | 端基建 | 通用扫码工作流引擎：消费描述符驱动推进，opId 幂等，绑定在组合根 |
| `packages/plugins/putaway-zone` | 策略 | 区域优先级上架（缺省提供者，零配置可用） |
| `packages/plugins/putaway-abc` | 策略 | ABC 动碰分级（可选提供者，配置驱动） |
| `packages/plugins/veto-mixed-lot` | 校验 | 混放否决（waterfall 短路即一票否决） |
| `packages/features/feat-inbound` | 纵切片 | 收货功能 = host 半身服务 + PDA 工作流 + 大屏卡片，一个包 |
| `apps/demo` | 演示 | 叙事式端到端脚本 |

## 架构一页图

```
                    ┌─────────────────────────────────────┐
                    │   内核（不可插拔的不变量）             │
                    │   kernel（可逆机制）  core-ledger（账） │
                    └──────────────┬──────────────────────┘
                                   │ 只依赖 contracts + kernel
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
   策略缝（多实现）            纵切片（功能包）           客户端投影
   putaway-zone               feat-inbound              client-registry
   putaway-abc            （host+PDA+大屏半身）        （描述符 → 各端 runtime）
   veto-mixed-lot
```

依赖方向铁律：**功能与策略只准依赖 contracts 与 kernel；内核不 import 任何策略；所有 client 半身只通过 contracts 对话。**

## 决策记录（ADR）

一切重要决策进 [docs/adr/](docs/adr/)，编号递增、只追加不改写：

- [ADR-0001 微内核与可逆插件](docs/adr/0001-微内核与可逆插件.md)
- [ADR-0002 配置分层：简单场景必须免费](docs/adr/0002-配置分层-简单场景必须免费.md)
- [ADR-0003 包拓扑：纵切片，按角色拆缝](docs/adr/0003-包拓扑-纵切片按角色拆缝.md)
- [ADR-0004 三端投影：PC/PDA/大屏是同一领域的三种函数](docs/adr/0004-三端投影.md)
- [ADR-0005 任务机内核：显式迁移表与 opId 幂等推进](docs/adr/0005-任务机内核-迁移表与幂等推进.md)
- [ADR-0006 端 runtime：通用工作流引擎与组合根绑定](docs/adr/0006-端runtime-通用工作流引擎与组合根绑定.md)

理念出处与新会话按需阅读地图见[参考资料索引](docs/references.md)。

## 已知限制（诚实清单）

- 事件只实现 emit / waterfall；parallel / serial 待真实需求出现再引入。
- 内核为教学级实现（约 200 行），未做性能优化与沙箱隔离。
- 演示使用内存账本；持久化是未来的一个 provider 缝，不是现在的问题。

## 许可证

[MIT](LICENSE)

