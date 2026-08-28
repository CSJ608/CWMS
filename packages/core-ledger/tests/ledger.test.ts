import { describe, expect, it, vi } from 'vitest'
import { Ledger } from '@cwms/core-ledger'

const line = (qty: number, lot = 'L1') => ({ sku: 'S1', lot, qty })

describe('库存账：唯一变更通道', () => {
  it('收发移转保持守恒，快照可追溯', () => {
    const ledger = new Ledger()
    ledger.receive(line(10), 'A-01')
    ledger.move(line(4), 'A-01', 'B-01')
    ledger.ship(line(3), 'A-01')
    expect(ledger.total()).toBe(7)
    expect(ledger.find('A-01', 'S1', 'L1')?.qty).toBe(3)
    expect(ledger.find('B-01', 'S1', 'L1')?.qty).toBe(4)
  })

  it('拒绝负库存与非法数量', () => {
    const ledger = new Ledger()
    expect(() => ledger.ship(line(1), 'A-01')).toThrow(/库存不足/)
    expect(() => ledger.receive(line(0), 'A-01')).toThrow(/正整数/)
    expect(() => ledger.receive(line(-1), 'A-01')).toThrow(/正整数/)
  })

  it('每笔变更发出 ledger/changed 事件', () => {
    const ledger = new Ledger()
    const emit = vi.fn()
    ledger.bind(emit)
    ledger.receive(line(5), 'A-01')
    expect(emit).toHaveBeenCalledWith({
      kind: 'receive',
      sku: 'S1',
      lot: 'L1',
      qty: 5,
      location: 'A-01',
    })
  })

  it('linesAt 供策略插件读取库位现状（混放判断的依据）', () => {
    const ledger = new Ledger()
    ledger.receive(line(5, 'L1'), 'A-01')
    ledger.receive(line(3, 'L2'), 'A-01')
    ledger.receive(line(2, 'L1'), 'B-01')
    expect(ledger.linesAt('A-01')).toHaveLength(2)
  })
})
