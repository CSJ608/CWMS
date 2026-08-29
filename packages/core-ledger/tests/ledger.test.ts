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

  it('每笔变更发出 ledger/changed 事件，ts 为注入时钟的时刻', () => {
    const ledger = new Ledger(() => 1724900000000)
    const emit = vi.fn()
    ledger.bind(emit)
    ledger.receive(line(5), 'A-01')
    expect(emit).toHaveBeenCalledWith({
      kind: 'receive',
      sku: 'S1',
      lot: 'L1',
      qty: 5,
      location: 'A-01',
      ts: 1724900000000,
    })
  })

  it('缺省时钟：ts 为正数且落在取值时刻区间内', () => {
    const ledger = new Ledger()
    const events: import('@cwms/contracts').LedgerChanged[] = []
    ledger.bind((change) => events.push(change))
    const before = Date.now()
    ledger.receive(line(1), 'A-01')
    const after = Date.now()
    expect(typeof events[0]!.ts).toBe('number')
    expect(events[0]!.ts).toBeGreaterThanOrEqual(before)
    expect(events[0]!.ts).toBeLessThanOrEqual(after)
  })

  it('linesAt 供策略插件读取库位现状（混放判断的依据）', () => {
    const ledger = new Ledger()
    ledger.receive(line(5, 'L1'), 'A-01')
    ledger.receive(line(3, 'L2'), 'A-01')
    ledger.receive(line(2, 'L1'), 'B-01')
    expect(ledger.linesAt('A-01')).toHaveLength(2)
  })

  it('move 事件携带移出库位：事件流按守恒语义可重放重建账本（ADR-0011 前置条件）', () => {
    const ledger = new Ledger()
    const events: import('@cwms/contracts').LedgerChanged[] = []
    ledger.bind((change) => events.push(change))

    ledger.receive(line(10), 'STAGING')
    ledger.move(line(6), 'STAGING', 'A-01')
    ledger.ship(line(2), 'A-01')
    ledger.receive(line(4, 'L2'), 'C-01')
    ledger.move(line(4, 'L2'), 'C-01', 'A-01')

    expect(events.filter((e) => e.kind === 'move')).toMatchObject([
      { from: 'STAGING', location: 'A-01' },
      { from: 'C-01', location: 'A-01' },
    ])
    expect(events.every((e) => typeof e.ts === 'number' && e.ts > 0)).toBe(true)

    // 重放语义：receive +qty@location；ship -qty@location；move -qty@from +qty@location
    // 入参类型 Omit<'ts'> 即类型级证明：重放只消费守恒字段，不读 ts
    const replay = (evts: Array<Omit<import('@cwms/contracts').LedgerChanged, 'ts'>>) => {
      const replayed = new Map<string, number>()
      for (const e of evts) {
        const apply = (location: string, delta: number) => {
          const k = `${location}|${e.sku}|${e.lot}`
          const next = (replayed.get(k) ?? 0) + delta
          if (next === 0) replayed.delete(k)
          else replayed.set(k, next)
        }
        if (e.kind === 'receive') apply(e.location, +e.qty)
        else if (e.kind === 'ship') apply(e.location, -e.qty)
        else {
          apply(e.from!, -e.qty)
          apply(e.location, +e.qty)
        }
      }
      return replayed
    }
    const expected = new Map(
      ledger.snapshot().map((s) => [`${s.location}|${s.sku}|${s.lot}`, s.qty] as const),
    )
    expect(replay(events)).toEqual(expected)
    // ts 是元数据：剥离后重放结果不变——重放不读 ts，顺序由事件流次序定义（ADR-0011 增补）
    expect(replay(events.map(({ ts, ...rest }) => rest))).toEqual(expected)
  })
})
