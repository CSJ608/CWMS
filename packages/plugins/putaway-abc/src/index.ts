/**
 * 上架策略：ABC 动碰分级（可选提供者）。
 *
 * 证明策略缝的真实性：与 zone 策略并存，注册顺序决定包装层级。
 * 未配置动碰数据时是透明的直通监听器——装了也不改变行为（ADR-0002：
 * 复杂度按需付费，简单场景免费）。
 */

import type { PutawayRequest } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export interface AbcConfig {
  /** SKU → 年动碰次数。 */
  velocity?: Record<string, number>
  /** 快流 SKU 优先进入的库区。缺省 ['A']。 */
  fastZones?: string[]
  /** 动碰不超过该值的 SKU 视为快流。缺省 100。 */
  fastThreshold?: number
}

export const putawayAbcPlugin: Plugin<AbcConfig> = definePlugin<AbcConfig>({
  name: 'putaway-abc',
  apply(ctx, config) {
    const velocity = config?.velocity
    const fastZones = new Set(config?.fastZones ?? ['A'])
    const threshold = config?.fastThreshold ?? 100

    ctx.onWaterfall('putaway/decide', (request: PutawayRequest, next) => {
      if (!request.decision.ok) return next(request)
      if (!velocity) return next(request) // 未配置：透明直通
      const isFastMover = (velocity[request.line.sku] ?? 0) <= threshold
      const score = (zone: string) => (fastZones.has(zone) === isFastMover ? 0 : 1)
      request.candidates = [...request.candidates].sort((a, b) => score(a.zone) - score(b.zone))
      return next(request)
    })
  },
})
