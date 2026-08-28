import { describe, expect, it } from 'vitest'
import { clientRegistryPlugin } from '@cwms/client-registry'
import {
  DASHBOARD_CARDS,
  INBOUND,
  LEDGER,
  PDA_WORKFLOWS,
  TASK,
  type DashboardCard,
  type InventoryLedger,
  type PdaWorkflow,
  type TaskChanged,
  type TaskServiceView,
} from '@cwms/contracts'
import { ledgerPlugin } from '@cwms/core-ledger'
import { coreTaskPlugin } from '@cwms/core-task'
import { createSystem, definePlugin, ConfigError } from '@cwms/kernel'
import { putawayAbcPlugin } from '@cwms/plugin-putaway-abc'
import { vetoMixedLotPlugin } from '@cwms/plugin-veto-mixed-lot'
import { dashboardProjectionPlugin, featInboundPlugin, InboundService } from '@cwms/feat-inbound'
import { putawayZonePlugin, type ZonePriorityConfig } from '@cwms/plugin-putaway-zone'

const CANDIDATES = [
  { location: 'A-01-01', zone: 'A' },
  { location: 'B-02-01', zone: 'B' },
  { location: 'C-03-01', zone: 'C', mixLotsAllowed: true },
]

function build() {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  system.mount(ledgerPlugin)
  system.mount(coreTaskPlugin)
  system.mount(featInboundPlugin)
  system.mount(dashboardProjectionPlugin)
  system.mount(putawayZonePlugin)
  return system
}

const inbound = (system: ReturnType<typeof build>) => system.getService<InboundService>(INBOUND)

describe('收货纵切片：一切皆插件的端到端证明', () => {
  it('零配置：简单场景按缺省区域优先级直接跑通（复杂度免费）', () => {
    const system = build()
    const result = inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 10 }, 'STAGING', CANDIDATES)
    expect(result).toEqual({ blocked: false, location: 'A-01-01', line: { sku: 'S1', lot: 'L1', qty: 10 } })
  })

  it('混放否决：校验策略短路，货物留在暂存区且账实一致', () => {
    const system = build()
    system.mount(vetoMixedLotPlugin)
    inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 10 }, 'STAGING', CANDIDATES)
    const blocked = inbound(system).receive({ sku: 'S1', lot: 'L2', qty: 5 }, 'STAGING', CANDIDATES)
    expect(blocked.blocked).toBe(true)
    expect(blocked.reason).toMatch(/禁止.*混放/)
    const ledger = system.getService<InventoryLedger>(LEDGER)
    expect(ledger.find('STAGING', 'S1', 'L2')?.qty).toBe(5) // 被拒货物账上可见，未上架
    expect(ledger.total()).toBe(15) // 守恒
  })

  it('热插拔：卸载否决插件同请求通过；重挂载行为恢复（可逆性）', () => {
    const system = build()
    system.mount(vetoMixedLotPlugin)
    inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 10 }, 'STAGING', CANDIDATES)
    const line = { sku: 'S1', lot: 'L2', qty: 5 }

    expect(inbound(system).receive(line, 'STAGING', CANDIDATES.slice(0, 2)).blocked).toBe(true)
    system.unmount('veto-mixed-lot')
    expect(inbound(system).receive(line, 'STAGING', CANDIDATES.slice(0, 2)).blocked).toBe(false)
    system.mount(vetoMixedLotPlugin)
    expect(inbound(system).receive(line, 'STAGING', CANDIDATES.slice(0, 2)).blocked).toBe(true)
  })

  it('ABC overlay：配置改变决策，不改任何产品代码（复杂度按需付费）', () => {
    const system = build()
    system.mount(vetoMixedLotPlugin)
    system.reload(putawayAbcPlugin, {
      velocity: { S1: 9999 },
      fastZones: ['C'],
      fastThreshold: 10000,
    })
    const result = inbound(system).receive({ sku: 'S1', lot: 'L9', qty: 1 }, 'STAGING', CANDIDATES)
    expect(result).toMatchObject({ blocked: false, location: 'C-03-01' }) // 快流 SKU 直配 C 区
  })

  it('客户端投影：功能包只登记描述符，不含任何 UI 代码', () => {
    const system = build()
    const workflows = system.getService<{ all(): PdaWorkflow[] }>(PDA_WORKFLOWS).all()
    const cards = system.getService<{ all(): DashboardCard[] }>(DASHBOARD_CARDS).all()
    expect(workflows).toHaveLength(1)
    expect(workflows[0]!.steps.map((s) => s.action)).toContain('扫描目标库位完成上架')
    expect(cards).toEqual([{ id: 'inbound-rate', title: '今日入库量', metric: 'todayInboundQty' }])
  })

  it('大屏是只读投影：订阅账本事件维护读模型，卸载即回滚', () => {
    const system = build()
    inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 10 }, 'STAGING', CANDIDATES)
    inbound(system).receive({ sku: 'S2', lot: 'L1', qty: 4 }, 'STAGING', CANDIDATES)
    const readModel = system.getService<{ todayInboundQty: number }>('dashboard/read-model')
    expect(readModel.todayInboundQty).toBe(14)
    system.unmount('projection-dashboard')
    expect(system.isMounted('projection-dashboard')).toBe(false)
  })
})

describe('任务驱动的收货上架（core-task 集成，ADR-0005）', () => {
  it('完整生命周期驱动上架，task/changed 轨迹可查', () => {
    const system = build()
    const events: TaskChanged[] = []
    system.mount(
      definePlugin({
        name: 'probe',
        apply: (ctx) => ctx.on('task/changed', (change) => events.push(change)),
      }),
    )
    const result = inbound(system).receiveViaTask({ sku: 'S1', lot: 'L1', qty: 6 }, 'STAGING', CANDIDATES, 'op-A')
    expect(result).toMatchObject({ blocked: false, location: 'A-01-01' })
    expect(events.map((e) => `${e.from}→${e.to}`)).toEqual([
      'void→created',
      'created→assigned',
      'assigned→executing',
      'executing→completed',
    ])
    expect(system.getService<TaskServiceView>(TASK).list('putaway', 'completed')).toHaveLength(1)
  })

  it('同 opId 重放：结局相同、账本不变——PDA 弱网重试安全', () => {
    const system = build()
    const line = { sku: 'S2', lot: 'L1', qty: 6 }
    const first = inbound(system).receiveViaTask(line, 'STAGING', CANDIDATES, 'op-B')
    const totalAfterFirst = system.getService<InventoryLedger>(LEDGER).total()
    const replay = inbound(system).receiveViaTask(line, 'STAGING', CANDIDATES, 'op-B')
    expect(replay).toEqual(first)
    expect(system.getService<InventoryLedger>(LEDGER).total()).toBe(totalAfterFirst)
    expect(system.getService<TaskServiceView>(TASK).list()).toHaveLength(1)
  })

  it('决策被否决：任务取消并记录原因，货留暂存账上可查', () => {
    const system = build()
    system.mount(vetoMixedLotPlugin)
    inbound(system).receiveViaTask({ sku: 'S1', lot: 'L1', qty: 5 }, 'STAGING', CANDIDATES.slice(0, 2), 'op-C')
    const blocked = inbound(system).receiveViaTask(
      { sku: 'S1', lot: 'L2', qty: 3 },
      'STAGING',
      CANDIDATES.slice(0, 2),
      'op-D',
    )
    expect(blocked.blocked).toBe(true)
    const cancelled = system.getService<TaskServiceView>(TASK).list('putaway', 'cancelled')
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0]!.reason).toMatch(/混放/)
    expect(system.getService<InventoryLedger>(LEDGER).find('STAGING', 'S1', 'L2')?.qty).toBe(3)
  })
})

describe('配置 schema 化（ADR-0007 框架级验收）', () => {
  it('零配置：zone 缺省区域表直接生效（简单场景免费）', () => {
    const system = build()
    const result = inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 2 }, 'STAGING', [
      { location: 'B-01-01', zone: 'B' },
      { location: 'A-01-01', zone: 'A' },
    ])
    expect(result).toMatchObject({ blocked: false, location: 'A-01-01' })
  })

  it('深合并 overlay：新增 S 区置顶，缺省表保留——只加一行不抄全表', () => {
    const system = build()
    system.reload(putawayZonePlugin, { zonePriority: { S: 0 } })
    const result = inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 2 }, 'STAGING', [
      { location: 'A-01-01', zone: 'A' },
      { location: 'S-01-01', zone: 'S' },
      { location: 'C-01-01', zone: 'C' },
    ])
    expect(result).toMatchObject({ blocked: false, location: 'S-01-01' })
  })

  it('未知配置项 reload 报错，旧配置保持在岗（配置预算制 + 原子 reload）', () => {
    const system = build()
    const bad: Record<string, unknown> = { zonePriorty: { S: 0 } } // 拼写错误
    expect(() =>
      system.reload(putawayZonePlugin, bad as unknown as Partial<ZonePriorityConfig>),
    ).toThrow(ConfigError)
    expect(system.isMounted('putaway-zone')).toBe(true)
    const result = inbound(system).receive({ sku: 'S1', lot: 'L1', qty: 2 }, 'STAGING', [
      { location: 'C-01-01', zone: 'C' },
      { location: 'A-01-01', zone: 'A' },
    ])
    expect(result).toMatchObject({ location: 'A-01-01' }) // 缺省表仍然生效
  })
})
