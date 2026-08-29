import { describe, expect, it } from 'vitest'
import { DASHBOARD_BOARD, DASHBOARD_RUNTIME, INBOUND, LEDGER, OUTBOUND, PDA_RUNTIME, PC_RUNTIME, TASK } from '@cwms/contracts'
import { clientRegistryPlugin } from '@cwms/client-registry'
import { Ledger, ledgerPlugin } from '@cwms/core-ledger'
import { coreTaskPlugin, TaskService } from '@cwms/core-task'
import { PdaRuntime, pdaRuntimePlugin } from '@cwms/pda-runtime'
import { PcRuntime, pcRuntimePlugin } from '@cwms/pc-runtime'
import { DashboardRuntime, dashboardRuntimePlugin, TaskBoard, taskBoardPlugin } from '@cwms/dashboard-runtime'
import { createSystem, definePlugin } from '@cwms/kernel'
import { putawayZonePlugin } from '@cwms/plugin-putaway-zone'
import { vetoMixedLotPlugin } from '@cwms/plugin-veto-mixed-lot'
import { dashboardProjectionPlugin, featInboundPlugin, InboundService } from '@cwms/feat-inbound'
import { featOutboundPlugin, outboundProjectionPlugin, OutboundService } from '@cwms/feat-outbound'

function build(withVeto = false) {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  system.mount(ledgerPlugin)
  system.mount(coreTaskPlugin)
  system.mount(featInboundPlugin)
  system.mount(dashboardProjectionPlugin)
  system.mount(featOutboundPlugin)
  system.mount(outboundProjectionPlugin)
  system.mount(putawayZonePlugin)
  if (withVeto) system.mount(vetoMixedLotPlugin)
  system.mount(pdaRuntimePlugin)
  system.mount(pcRuntimePlugin)
  system.mount(dashboardRuntimePlugin)
  system.mount(taskBoardPlugin)
  return system
}

const candidatesOf = (location: string) => [
  { location, zone: location.split('-')[0]!, mixLotsAllowed: location.startsWith('C') },
]

function bootPda(system: ReturnType<typeof build>) {
  const inbound = system.getService<InboundService>(INBOUND)
  const pda = system.getService<PdaRuntime>(PDA_RUNTIME)
  const session = pda.start(
    'inbound-putaway',
    {
      onSubmit: (collected, opId) =>
        inbound.receiveViaTask(
          { sku: String(collected.sku), lot: String(collected.lot), qty: collected.qty as number },
          'STAGING',
          candidatesOf(String(collected.location)),
          opId,
        ),
    },
    'pda-boot',
  )
  return { pda, session }
}

describe('端到端：PDA 扫码 → runtime → 任务机 → 策略缝 → 账本', () => {
  it('扫码序列驱动上架成功，采集数据映射为领域操作', () => {
    const system = build()
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'SKU-9001', 'op-1')
    pda.submit(session.id, 'L1', 'op-2')
    pda.submit(session.id, 7, 'op-3')
    const done = pda.submit(session.id, 'B-02-01', 'op-4')
    expect(done.status).toBe('completed')
    expect(done.outcome).toMatchObject({ blocked: false, location: 'B-02-01' })
    const ledger = system.getService<Ledger>(LEDGER)
    expect(ledger.find('B-02-01', 'SKU-9001', 'L1')?.qty).toBe(7)
    expect(system.getService<TaskService>(TASK).list('putaway', 'completed')).toHaveLength(1)
  })

  it('断网重传：最终步同 opId 重放，领域层不再被触达', () => {
    const system = build()
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'SKU-9002', 'op-1')
    pda.submit(session.id, 'L1', 'op-2')
    pda.submit(session.id, 5, 'op-3')
    const done = pda.submit(session.id, 'A-01-01', 'op-4')
    const ledger = system.getService<Ledger>(LEDGER)
    const totalAfterDone = ledger.total()
    const tasksAfterDone = system.getService<TaskService>(TASK).list().length
    const replay = pda.submit(session.id, 'A-01-01', 'op-4') // 断网重传
    expect(replay).toEqual(done)
    expect(ledger.total()).toBe(totalAfterDone)
    expect(system.getService<TaskService>(TASK).list().length).toBe(tasksAfterDone)
  })

  it('校验缝仍有否决权：混放被拒，货留暂存，任务取消，会话如实上报', () => {
    const system = build(true)
    const inbound = system.getService<InboundService>(INBOUND)
    inbound.receive({ sku: 'S1', lot: 'L1', qty: 9 }, 'STAGING', candidatesOf('A-01-01'))
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'S1', 'op-1')
    pda.submit(session.id, 'L2', 'op-2')
    pda.submit(session.id, 3, 'op-3')
    const done = pda.submit(session.id, 'A-01-01', 'op-4')
    expect(done.status).toBe('completed')
    const outcome = done.outcome as { blocked: boolean; reason?: string }
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toMatch(/混放/)
    const ledger = system.getService<Ledger>(LEDGER)
    expect(ledger.find('STAGING', 'S1', 'L2')?.qty).toBe(3)
    expect(system.getService<TaskService>(TASK).list('putaway', 'cancelled')).toHaveLength(1)
  })

  it('一次领域操作，三端投影同步：PDA 驱动、PC 呈现、大屏卡片与作业看板', () => {
    const system = build(true)
    const dash = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
    dash.bindMetric('todayInboundQty', () => system.getService<{ todayInboundQty: number }>('dashboard/read-model').todayInboundQty)
    dash.bindMetric('stockTotalQty', () => system.getService<Ledger>(LEDGER).total())
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'SKU-7001', 'op-1')
    pda.submit(session.id, 'L7', 'op-2')
    pda.submit(session.id, 4, 'op-3')
    pda.submit(session.id, 'C-03-01', 'op-4') // C 区混放允许，上架成功

    const pc = system.getService<PcRuntime>(PC_RUNTIME)
    pc.bindProvider('inventory', () =>
      system.getService<Ledger>(LEDGER).snapshot().map((line) => ({ ...line })),
    )
    const view = pc.query('inventory')
    expect(view.title).toBe('库存一览')
    expect(view.columns.map((c) => c.key)).toEqual(['location', 'sku', 'lot', 'qty'])
    expect(view.rows).toContainEqual({ location: 'C-03-01', sku: 'SKU-7001', lot: 'L7', qty: 4 })

    // 筛选（列等值，ADR-0009 增补）：描述符声明 filters 后 query 可按库位筛，行集精确
    expect(pc.query('inventory', { location: 'C-03-01' }).rows).toEqual([
      { location: 'C-03-01', sku: 'SKU-7001', lot: 'L7', qty: 4 },
    ])

    // 大屏卡片：描述符 + 组合根指标源，值跟随领域状态
    expect(dash.cards().map((c) => c.id)).toEqual(['inbound-rate', 'outbound-rate'])
    expect(dash.query('inbound-rate').value).toBeGreaterThanOrEqual(4)
    // 作业看板：task/changed 事件喂养，收货任务已入 completed 列
    const board = system.getService<TaskBoard>(DASHBOARD_BOARD)
    const completed = board.snapshot().columns.find((c) => c.status === 'completed')!
    expect(completed.taskIds).toHaveLength(1)
    expect(completed.taskIds[0]).toMatch(/^putaway-/)
  })

  it('第二纵切片出库：入库后 PDA 拣货出库，三端投影同步且账本守恒（ADR-0012）', () => {
    const system = build(true)
    const dash = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
    dash.bindMetric('todayInboundQty', () => system.getService<{ todayInboundQty: number }>('dashboard/read-model').todayInboundQty)
    dash.bindMetric('todayOutboundQty', () => system.getService<{ todayOutboundQty: number }>('outbound/read-model').todayOutboundQty)
    const pc = system.getService<PcRuntime>(PC_RUNTIME)
    pc.bindProvider('outbound-log', () =>
      system.getService<{ log: Array<Record<string, string | number>> }>('outbound/read-model').log.map((row) => ({ ...row })),
    )
    const inbound = system.getService<InboundService>(INBOUND)

    // 先入库：C 区混放允许，6 件 SKU-8001
    inbound.receive({ sku: 'SKU-8001', lot: 'L8', qty: 6 }, 'STAGING', candidatesOf('C-03-01'))
    const ledger = system.getService<Ledger>(LEDGER)
    const totalAfterInbound = ledger.total()

    // PDA 拣货出库：同一引擎，第二个工作流
    const pda = system.getService<PdaRuntime>(PDA_RUNTIME)
    const session = pda.start(
      'outbound-pick',
      {
        onSubmit: (collected, opId) =>
          system.getService<OutboundService>(OUTBOUND).shipViaTask(
            { sku: String(collected.sku), lot: String(collected.lot), qty: collected.qty as number },
            String(collected.location),
            opId,
          ),
      },
      'pda-pick-boot',
    )
    pda.submit(session.id, 'SKU-8001', 'pick-1')
    pda.submit(session.id, 'L8', 'pick-2')
    pda.submit(session.id, 4, 'pick-3')
    const done = pda.submit(session.id, 'C-03-01', 'pick-4')
    expect(done.status).toBe('completed')
    expect(done.outcome).toMatchObject({ blocked: false, location: 'C-03-01' })

    // 账本守恒：出库 4，总量减 4，库位余 2
    expect(ledger.total()).toBe(totalAfterInbound - 4)
    expect(ledger.find('C-03-01', 'SKU-8001', 'L8')?.qty).toBe(2)

    // 三端投影：看板 completed 含 pick 任务、PC 流水有行、大屏出库卡片有值
    const board = system.getService<TaskBoard>(DASHBOARD_BOARD)
    expect(board.snapshot().columns.find((c) => c.status === 'completed')!.taskIds.length).toBeGreaterThanOrEqual(1)
    expect(system.getService<TaskService>(TASK).list('pick', 'completed')).toHaveLength(1)
    const logView = pc.query('outbound-log')
    expect(logView.rows).toContainEqual({ location: 'C-03-01', sku: 'SKU-8001', lot: 'L8', qty: 4 })
    expect(dash.query('outbound-rate').value).toBe(4)
    expect(dash.query('inbound-rate').value).toBeGreaterThanOrEqual(6)
  })

  it('出库库存不足：PDA 会话完成但结局 blocked，任务 cancelled、账本不动', () => {
    const system = build(true)
    const inbound = system.getService<InboundService>(INBOUND)
    inbound.receive({ sku: 'SKU-8002', lot: 'L8', qty: 2 }, 'STAGING', candidatesOf('C-03-01'))
    const ledger = system.getService<Ledger>(LEDGER)
    const before = ledger.total()

    const pda = system.getService<PdaRuntime>(PDA_RUNTIME)
    const session = pda.start(
      'outbound-pick',
      {
        onSubmit: (collected, opId) =>
          system.getService<OutboundService>(OUTBOUND).shipViaTask(
            { sku: String(collected.sku), lot: String(collected.lot), qty: collected.qty as number },
            String(collected.location),
            opId,
          ),
      },
      'pda-pick-boot2',
    )
    pda.submit(session.id, 'SKU-8002', 'pick-1')
    pda.submit(session.id, 'L8', 'pick-2')
    pda.submit(session.id, 5, 'pick-3')
    const done = pda.submit(session.id, 'C-03-01', 'pick-4')
    const outcome = done.outcome as { blocked: boolean; reason?: string }
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toMatch(/库存不足/)
    expect(ledger.total()).toBe(before)
    expect(system.getService<TaskService>(TASK).list('pick', 'cancelled')).toHaveLength(1)
  })
})
