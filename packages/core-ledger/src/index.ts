/**
 * 库存账（ledger）：WMS 的不变量内核（ADR-0001）。
 *
 * 一切库存变更必须经过本服务——它是全系统唯一的变更通道。
 * 策略可以建议，账本负责裁决：负库存被拒绝，每一笔变更都发出
 * ledger/changed 事件供投影订阅，账实可追溯。
 */

import { LEDGER, type InventoryLedger, type LedgerChanged, type ReceiptLine, type StockLine } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

const key = (location: string, sku: string, lot: string) => `${location}|${sku}|${lot}`

export class Ledger implements InventoryLedger {
  readonly #stocks = new Map<string, StockLine>()
  #emit: ((change: LedgerChanged) => void) | null = null

  /** 由宿主插件在挂载时接通事件总线（保持本类不依赖内核细节）。 */
  bind(emit: (change: LedgerChanged) => void): void {
    this.#emit = emit
  }

  receive(line: ReceiptLine, location: string): void {
    this.#assertPositive(line.qty)
    this.#change('receive', line, location, +line.qty)
  }

  ship(line: ReceiptLine, location: string): void {
    this.#assertPositive(line.qty)
    const current = this.#stocks.get(key(location, line.sku, line.lot))
    if (!current || current.qty < line.qty) {
      throw new Error(
        `库存不足：${location} 的 ${line.sku}（批次 ${line.lot}）仅有 ${current?.qty ?? 0}，无法发出 ${line.qty}`,
      )
    }
    this.#change('ship', line, location, -line.qty)
  }

  move(line: ReceiptLine, from: string, to: string): void {
    this.#assertPositive(line.qty)
    const src = this.#stocks.get(key(from, line.sku, line.lot))
    if (!src || src.qty < line.qty) {
      throw new Error(
        `库存不足：${from} 的 ${line.sku}（批次 ${line.lot}）仅有 ${src?.qty ?? 0}，无法移出 ${line.qty}`,
      )
    }
    const restFrom = src.qty - line.qty
    if (restFrom === 0) this.#stocks.delete(key(from, line.sku, line.lot))
    else this.#stocks.set(key(from, line.sku, line.lot), { ...src, qty: restFrom })

    const kTo = key(to, line.sku, line.lot)
    const existingTo = this.#stocks.get(kTo)
    const nextTo = (existingTo?.qty ?? 0) + line.qty
    this.#stocks.set(kTo, { location: to, sku: line.sku, lot: line.lot, qty: nextTo })
    // 事件携带移出侧（from）与移入侧（location）——收/发/移的事件流按守恒语义
    // 可完整重放重建账本（ADR-0011），这是事件流可作为审计与持久化格式的资格。
    this.#emit?.({ kind: 'move', sku: line.sku, lot: line.lot, qty: line.qty, location: to, from })
  }

  linesAt(location: string): StockLine[] {
    return [...this.#stocks.values()].filter((line) => line.location === location)
  }

  /** 库存查询：策略插件通过它读取现状，但绝不能绕过它改账。 */
  find(location: string, sku: string, lot: string): StockLine | undefined {
    return this.#stocks.get(key(location, sku, lot))
  }

  total(): number {
    return [...this.#stocks.values()].reduce((sum, line) => sum + line.qty, 0)
  }

  snapshot(): StockLine[] {
    return [...this.#stocks.values()]
  }

  #change(kind: LedgerChanged['kind'], line: ReceiptLine, location: string, delta: number): void {
    const k = key(location, line.sku, line.lot)
    const existing = this.#stocks.get(k)
    const nextQty = (existing?.qty ?? 0) + delta
    if (nextQty < 0) throw new Error(`账本拒绝负库存：${k}`)
    if (nextQty === 0) this.#stocks.delete(k)
    else
      this.#stocks.set(k, {
        location,
        sku: line.sku,
        lot: line.lot,
        qty: nextQty,
      })
    this.#emit?.({ kind, sku: line.sku, lot: line.lot, qty: Math.abs(delta), location })
  }

  #assertPositive(qty: number): void {
    if (!Number.isInteger(qty) || qty <= 0) throw new Error(`数量必须为正整数，收到 ${qty}`)
  }
}

/** 宿主插件：把账本挂到服务 key 上，并接通事件总线。 */
export const ledgerPlugin: Plugin = definePlugin({
  name: 'core-ledger',
  apply(ctx) {
    const ledger = new Ledger()
    ledger.bind((change) => ctx.emit('ledger/changed', change))
    ctx.provide(LEDGER, ledger)
  },
})
