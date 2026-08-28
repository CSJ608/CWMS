/**
 * 收货纵切片（feat-inbound）：一个功能包 = 一个包 = 一个插件身份。
 *
 * host 半身：InboundService（收货 + 上架决策编排，走 putaway/decide 瀑布）；
 * client 半身：向注册表登记 PDA 工作流描述符与大屏卡片描述符——
 * 三端是同一功能的三种投影（ADR-0004），本包不包含任何 UI 代码。
 */

import {
  DASHBOARD_CARDS,
  INBOUND,
  LEDGER,
  PDA_WORKFLOWS,
  PC_TABLES,
  TASK,
  type DashboardCard,
  type InventoryLedger,
  type ModuleRegistry,
  type PutawayRequest,
  type PdaWorkflow,
  type PcTable,
  type ReceiptLine,
  type TaskDetail,
  type TaskServiceView,
} from '@cwms/contracts'
import { definePlugin, type Context, type Plugin } from '@cwms/kernel'

export type PutawayOutcome =
  | { blocked: false; location: string; line: ReceiptLine }
  | { blocked: true; reason: string; line: ReceiptLine }

export class InboundService {
  constructor(
    private readonly ledger: InventoryLedger,
    private readonly tasks: TaskServiceView,
    private readonly ctx: Context,
  ) {}

  /** 收货入库：账本记账，策略缝决定上架库位。 */
  receive(line: ReceiptLine, staging: string, candidates: PutawayRequest['candidates']) {
    this.ledger.receive(line, staging)
    const request: PutawayRequest = { line, candidates, decision: { ok: true } }
    const decided = this.ctx.waterfall('putaway/decide', request)
    if (!decided.decision.ok && !decided.decision.location) {
      return { blocked: true as const, reason: decided.decision.reason ?? '被策略拒绝', line }
    }
    const target = decided.decision.location ?? decided.candidates[0]?.location
    if (!target) return { blocked: true as const, reason: '没有可用候选库位', line }
    this.ledger.move(line, staging, target)
    return { blocked: false as const, location: target, line }
  }

  /**
   * 任务驱动的收货上架：每次调用携带 opId，走完整任务生命周期
   * （created → assigned → executing → completed/cancelled）。
   * PDA 弱网重放同 opId 时返回当时的结局——不重复收货、不重复推进。
   */
  receiveViaTask(
    line: ReceiptLine,
    staging: string,
    candidates: PutawayRequest['candidates'],
    opId: string,
    worker = 'PDA-01',
  ): PutawayOutcome {
    const created = this.tasks.create('putaway', { line, staging, candidates }, opId)
    const task = this.tasks.get(created.id)
    if (task.status !== 'created') return this.#outcomeOf(task, line) // 幂等重放
    this.tasks.assign(created.id, worker, `${opId}:assign`)
    this.tasks.start(created.id, `${opId}:start`)
    this.ledger.receive(line, staging)
    const decided = this.ctx.waterfall('putaway/decide', {
      line,
      candidates,
      decision: { ok: true },
    })
    const target = decided.decision.location ?? decided.candidates[0]?.location
    if (!decided.decision.ok || !target) {
      const reason = decided.decision.reason ?? '没有可用候选库位'
      this.tasks.cancel(created.id, reason, `${opId}:cancel`)
      return { blocked: true, reason, line }
    }
    this.ledger.move(line, staging, target)
    const outcome: PutawayOutcome = { blocked: false, location: target, line }
    this.tasks.complete(created.id, outcome, `${opId}:complete`)
    return outcome
  }

  #outcomeOf(task: TaskDetail, line: ReceiptLine): PutawayOutcome {
    if (task.status === 'completed') return task.result as Extract<PutawayOutcome, { blocked: false }>
    return { blocked: true, reason: task.reason ?? '任务未完成', line }
  }
}

export const featInboundPlugin: Plugin = definePlugin({
  name: 'feat-inbound',
  inject: [LEDGER, TASK, PDA_WORKFLOWS, DASHBOARD_CARDS, PC_TABLES],
  apply(ctx) {
    const ledger = ctx.getService<InventoryLedger>(LEDGER)
    const tasks = ctx.getService<TaskServiceView>(TASK)
    ctx.provide(INBOUND, new InboundService(ledger, tasks, ctx))

    // client 半身：PDA 端收到的是一份工作流定义（任务驱动，ADR-0004）
    ctx.getService<ModuleRegistry<PdaWorkflow>>(PDA_WORKFLOWS).register({
      id: 'inbound-putaway',
      title: '收货上架',
      steps: [
        { action: '确认收货明细', scan: 'sku' },
        { action: '输入批次', scan: 'lot' },
        { action: '输入数量', input: 'qty' },
        { action: '扫描目标库位完成上架', scan: 'location' },
      ],
    })

    ctx.getService<ModuleRegistry<DashboardCard>>(DASHBOARD_CARDS).register({
      id: 'inbound-rate',
      title: '今日入库量',
      metric: 'todayInboundQty',
    })

    // client 半身：PC 端收到的是一份表格描述符（数据驱动，ADR-0009）
    ctx.getService<ModuleRegistry<PcTable>>(PC_TABLES).register({
      id: 'inventory',
      title: '库存一览',
      columns: [
        { key: 'location', title: '库位' },
        { key: 'sku', title: 'SKU' },
        { key: 'lot', title: '批次' },
        { key: 'qty', title: '数量' },
      ],
    })
  },
})

/** 大屏投影插件：只读订阅账本事件，维护物化读模型——大屏永不直查业务表。 */
export const dashboardProjectionPlugin: Plugin = definePlugin({
  name: 'projection-dashboard',
  inject: [LEDGER, DASHBOARD_CARDS],
  apply(ctx) {
    const readModel = { todayInboundQty: 0 }
    ctx.on('ledger/changed', (change) => {
      if (change.kind === 'receive') readModel.todayInboundQty += change.qty
    })
    ctx.effect(() => {
      readModel.todayInboundQty = 0
    })
    ctx.provide('dashboard/read-model', readModel)
  },
})
