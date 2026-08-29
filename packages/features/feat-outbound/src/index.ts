/**
 * 出库纵切片（feat-outbound）：第二个功能包（ADR-0012，issue #23）。
 *
 * 命题检验：新功能 = 新包。本包零改动内核与端 runtime，只做三件事——
 * host 半身（OutboundService：任务机 kind='pick' + 账本 ship 通道）、
 * client 半身（三端描述符登记）、功能级读模型（出库流水投影）。
 * 库存不足的否决是账本内核不变量（core-ledger 拒绝），不是策略缝——
 * 本包不引入任何新缝（准入五问：无第二实现）。
 */

import {
  DASHBOARD_CARDS,
  LEDGER,
  OUTBOUND,
  PDA_WORKFLOWS,
  PC_TABLES,
  TASK,
  type DashboardCard,
  type InventoryLedger,
  type ModuleRegistry,
  type OutboundLine,
  type PdaWorkflow,
  type PcTable,
  type TaskDetail,
  type TaskServiceView,
} from '@cwms/contracts'
import { definePlugin, type Context, type Plugin } from '@cwms/kernel'

export type ShipOutcome =
  | { blocked: false; line: OutboundLine; location: string }
  | { blocked: true; reason: string; line: OutboundLine }

export class OutboundService {
  constructor(
    private readonly ledger: InventoryLedger,
    private readonly tasks: TaskServiceView,
    private readonly ctx: Context,
  ) {}

  /**
   * 任务驱动的拣货出库：领取 → 执行 → 账本 ship → 完成。
   * 同 opId 重放返回当时结局；库存不足时任务取消、账本分毫不动。
   */
  shipViaTask(
    line: OutboundLine,
    location: string,
    opId: string,
    worker = 'PDA-01',
  ): ShipOutcome {
    const created = this.tasks.create('pick', { line, location }, opId)
    const task = this.tasks.get(created.id)
    if (task.status !== 'created') return this.#outcomeOf(task, line) // 幂等重放
    this.tasks.assign(created.id, worker, `${opId}:assign`)
    this.tasks.start(created.id, `${opId}:start`)
    try {
      this.ledger.ship(line, location)
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      this.tasks.cancel(created.id, reason, `${opId}:cancel`)
      return { blocked: true, reason, line }
    }
    const outcome: ShipOutcome = { blocked: false, line, location }
    this.tasks.complete(created.id, outcome, `${opId}:complete`)
    return outcome
  }

  #outcomeOf(task: TaskDetail, line: OutboundLine): ShipOutcome {
    if (task.status === 'completed') return task.result as Extract<ShipOutcome, { blocked: false }>
    return { blocked: true, reason: task.reason ?? '任务未完成', line }
  }
}

export const featOutboundPlugin: Plugin = definePlugin({
  name: 'feat-outbound',
  inject: [LEDGER, TASK, PDA_WORKFLOWS, DASHBOARD_CARDS, PC_TABLES],
  apply(ctx) {
    const ledger = ctx.getService<InventoryLedger>(LEDGER)
    const tasks = ctx.getService<TaskServiceView>(TASK)
    ctx.provide(OUTBOUND, new OutboundService(ledger, tasks, ctx))

    // client 半身：PDA 拣货工作流（与收货同一引擎，零端代码）
    ctx.getService<ModuleRegistry<PdaWorkflow>>(PDA_WORKFLOWS).register({
      id: 'outbound-pick',
      title: '拣货出库',
      steps: [
        { action: '确认拣货明细', scan: 'sku' },
        { action: '输入批次', scan: 'lot' },
        { action: '输入数量', input: 'qty' },
        { action: '扫描拣货库位完成出库', scan: 'location' },
      ],
    })

    ctx.getService<ModuleRegistry<DashboardCard>>(DASHBOARD_CARDS).register({
      id: 'outbound-rate',
      title: '今日出库量',
      metric: 'todayOutboundQty',
    })

    ctx.getService<ModuleRegistry<PcTable>>(PC_TABLES).register({
      id: 'outbound-log',
      title: '出库流水',
      columns: [
        { key: 'location', title: '库位' },
        { key: 'sku', title: 'SKU' },
        { key: 'lot', title: '批次' },
        { key: 'qty', title: '数量' },
      ],
    })
  },
})

/** 出库读模型投影：只读订阅账本事件，维护今日出库量与流水；卸载即重置。 */
export const outboundProjectionPlugin: Plugin = definePlugin({
  name: 'projection-outbound',
  inject: [LEDGER],
  apply(ctx) {
    const readModel = {
      todayOutboundQty: 0,
      log: [] as Array<{ location: string; sku: string; lot: string; qty: number }>,
    }
    ctx.on('ledger/changed', (change) => {
      if (change.kind !== 'ship') return
      readModel.todayOutboundQty += change.qty
      readModel.log.push({ location: change.location, sku: change.sku, lot: change.lot, qty: change.qty })
    })
    ctx.effect(() => {
      readModel.todayOutboundQty = 0
      readModel.log = []
    })
    ctx.provide('outbound/read-model', readModel)
  },
})
