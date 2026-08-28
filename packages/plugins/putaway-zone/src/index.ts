/**
 * 上架策略：区域优先级（缺省提供者）。
 *
 * 配置 schema 声明在插件身上（ADR-0007）：零配置用缺省区域表开箱即跑；
 * overlay 深合并——新增冷链区 S 只写一行，不必抄全表（ADR-0002）。
 */

import type { PutawayRequest } from '@cwms/contracts'
import { configField, defineConfigSchema, definePlugin, type Plugin } from '@cwms/kernel'

/** 解析后的配置（字段必有值：默认值即产品决策）。 */
export interface ZonePriorityConfig {
  zonePriority: Record<string, number>
}

export const DEFAULT_ZONE_PRIORITY: Record<string, number> = { A: 1, B: 2, C: 3 }

export const putawayZonePlugin: Plugin<ZonePriorityConfig> = definePlugin<ZonePriorityConfig>({
  name: 'putaway-zone',
  configSchema: defineConfigSchema<ZonePriorityConfig>({
    zonePriority: configField.recordOfInt(DEFAULT_ZONE_PRIORITY),
  }),
  apply(ctx, config) {
    const priority = config.zonePriority
    ctx.onWaterfall('putaway/decide', (request: PutawayRequest, next) => {
      if (!request.decision.ok) return next(request)
      request.candidates = [...request.candidates].sort(
        (a, b) => (priority[a.zone] ?? 99) - (priority[b.zone] ?? 99),
      )
      return next(request)
    })
  },
})
