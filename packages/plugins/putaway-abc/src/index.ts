/**
 * 上架策略：ABC 动碰分级（可选提供者）。
 *
 * 证明策略缝的真实性：与 zone 策略并存，注册顺序决定包装层级。
 * 未配置动碰数据时是透明的直通监听器——装了也不改变行为（ADR-0002：
 * 复杂度按需付费，简单场景免费）。配置经 schema 解析（ADR-0007）。
 */

import type { PutawayRequest } from '@cwms/contracts'
import { configField, defineConfigSchema, definePlugin, type Plugin } from '@cwms/kernel'

/** 解析后的配置。 */
export interface AbcConfig {
  /** SKU → 年动碰次数；空表 = 透明直通。 */
  velocity: Record<string, number>
  /** 快流 SKU 优先进入的库区。 */
  fastZones: string[]
  /** 动碰不超过该值的 SKU 视为快流。 */
  fastThreshold: number
}

export const putawayAbcPlugin: Plugin<AbcConfig> = definePlugin<AbcConfig>({
  name: 'putaway-abc',
  configSchema: defineConfigSchema<AbcConfig>({
    velocity: configField.recordOfInt({}),
    fastZones: configField.stringArray(['A']),
    fastThreshold: configField.int(100, { min: 1 }),
  }),
  apply(ctx, config) {
    const velocity = config.velocity
    const fastZones = new Set(config.fastZones)
    const threshold = config.fastThreshold

    ctx.onWaterfall('putaway/decide', (request: PutawayRequest, next) => {
      if (!request.decision.ok) return next(request)
      if (Object.keys(velocity).length === 0) return next(request) // 未配置：透明直通
      const isFastMover = (velocity[request.line.sku] ?? 0) <= threshold
      const score = (zone: string) => (fastZones.has(zone) === isFastMover ? 0 : 1)
      request.candidates = [...request.candidates].sort((a, b) => score(a.zone) - score(b.zone))
      return next(request)
    })
  },
})
