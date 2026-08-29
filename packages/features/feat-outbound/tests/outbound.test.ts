import { describe, expect, it } from 'vitest'
import { LEDGER, OUTBOUND, TASK, type InventoryLedger, type TaskServiceView } from '@cwms/contracts'
import { clientRegistryPlugin } from '@cwms/client-registry'
import { Ledger, ledgerPlugin } from '@cwms/core-ledger'
import { coreTaskPlugin } from '@cwms/core-task'
import { createSystem } from '@cwms/kernel'
import { OutboundService, outboundProjectionPlugin, featOutboundPlugin } from '../src'

function build() {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  system.mount(ledgerPlugin)
  system.mount(coreTaskPlugin)
  system.mount(featOutboundPlugin)
  system.mount(outboundProjectionPlugin)
  return system
}

const line = (qty: number) => ({ sku: 'S1', lot: 'L1', qty })

describe('出库纵切片：任务机 + 账本 ship 通道', () => {
  it('先入后出：shipViaTask 扣减账本、任务入 completed', () => {
    const system = build()
    const ledger = system.getService<Ledger>(LEDGER)
    ledger.receive(line(10), 'A-01')
    const outbound = system.getService<OutboundService>(OUTBOUND)
    const outcome = outbound.shipViaTask(line(4), 'A-01', 'op-1')
    expect(outcome).toEqual({ blocked: false, line: line(4), location: 'A-01' })
    expect(ledger.total()).toBe(6)
    expect(system.getService<TaskServiceView>(TASK).list('pick', 'completed')).toHaveLength(1)
  })

  it('库存不足：任务 cancelled、账本分毫不动、结局如实上报', () => {
    const system = build()
    const ledger = system.getService<Ledger>(LEDGER)
    ledger.receive(line(3), 'A-01')
    const outbound = system.getService<OutboundService>(OUTBOUND)
    const outcome = outbound.shipViaTask(line(5), 'A-01', 'op-2')
    if (!outcome.blocked) throw new Error('库存不足应被否决')
    expect(outcome.reason).toMatch(/库存不足/)
    expect(ledger.total()).toBe(3)
    const cancelled = system.getService<TaskServiceView>(TASK).list('pick', 'cancelled')
    expect(cancelled).toHaveLength(1)
    expect(cancelled[0]!.reason).toMatch(/库存不足/)
  })

  it('opId 幂等：重放返回当时结局，不重复扣账', () => {
    const system = build()
    const ledger = system.getService<Ledger>(LEDGER)
    ledger.receive(line(10), 'A-01')
    const outbound = system.getService<OutboundService>(OUTBOUND)
    const first = outbound.shipViaTask(line(4), 'A-01', 'op-3')
    const replay = outbound.shipViaTask(line(4), 'A-01', 'op-3')
    expect(replay).toEqual(first)
    expect(ledger.total()).toBe(6)
    expect(system.getService<TaskServiceView>(TASK).list('pick')).toHaveLength(1)
  })

  it('出库读模型：只随 ship 事件增长，卸载即重置', () => {
    const system = build()
    const ledger = system.getService<Ledger>(LEDGER)
    const outbound = system.getService<OutboundService>(OUTBOUND)
    ledger.receive(line(10), 'A-01')
    outbound.shipViaTask(line(4), 'A-01', 'op-4')
    ledger.receive(line(2), 'B-01') // 入库不计入出库读模型
    const readModel = system.getService<{ todayOutboundQty: number; log: Array<{ sku: string; qty: number; location: string }> }>('outbound/read-model')
    expect(readModel.todayOutboundQty).toBe(4)
    expect(readModel.log).toEqual([{ location: 'A-01', sku: 'S1', lot: 'L1', qty: 4 }])
    system.unmount('projection-outbound')
    expect(readModel.todayOutboundQty).toBe(0)
    expect(readModel.log).toEqual([])
  })

  it('契约面：InventoryLedger 类型对齐（OutboundLine 与 ReceiptLine 结构化匹配）', () => {
    const system = build()
    const ledger = system.getService<InventoryLedger>(LEDGER)
    expect(typeof ledger.ship).toBe('function')
  })
})
