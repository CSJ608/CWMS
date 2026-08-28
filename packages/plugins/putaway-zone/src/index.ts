/**
 * 上架策略：区域优先级（缺省提供者）。
 *
 * 零配置可用（ADR-0002）：缺省区域优先级内置，简单仓库开箱即跑；
 * 复杂仓库通过 overlay 配置覆盖优先级表，而不是改代码。
 */

import type { PutawayRequest } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export interface ZonePriorityConfig {
  zonePriority?: Record<string, number>
}

export const DEFAULT_ZONE_PRIORITY: Record<string, number> = { A: 1, B: 2, C: 3 }

export const putawayZonePlugin: Plugin<ZonePriorityConfig> = definePlugin<ZonePriorityConfig>({
  name: 'putaway-zone',
  apply(ctx, config) {
    const priority = config?.zonePriority ?? DEFAULT_ZONE_PRIORITY
    ctx.onWaterfall('putaway/decide', (request: PutawayRequest, next) => {
      if (!request.decision.ok) return next(request)
      request.candidates = [...request.candidates].sort(
        (a, b) => (priority[a.zone] ?? 99) - (priority[b.zone] ?? 99),
      )
      return next(request)
    })
  },
})
