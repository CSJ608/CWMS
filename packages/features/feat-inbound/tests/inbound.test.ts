import { describe, expect, it } from 'vitest'
import { clientRegistryPlugin } from '@cwms/client-registry'
import {
  DASHBOARD_CARDS,
  INBOUND,
  LEDGER,
  PDA_WORKFLOWS,
  type DashboardCard,
  type PdaWorkflow,
} from '@cwms/contracts'
import { Ledger, ledgerPlugin } from '@cwms/core-ledger'
import { createSystem } from '@cwms/kernel'
import { putawayAbcPlugin } from '@cwms/plugin-putaway-abc'
import { putawayZonePlugin } from '@cwms/plugin-putaway-zone'
import { vetoMixedLotPlugin } from '@cwms/plugin-veto-mixed-lot'
import { dashboardProjectionPlugin, featInboundPlugin, InboundService } from '@cwms/feat-inbound'

const CANDIDATES = [
  { location: 'A-01-01', zone: 'A' },
  { location: 'B-02-01', zone: 'B' },
  { location: 'C-03-01', zone: 'C', mixLotsAllowed: true },
]

function build() {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  system.mount(ledgerPlugin)
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
    const ledger = system.getService<Ledger>(LEDGER)
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
