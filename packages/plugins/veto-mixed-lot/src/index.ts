/**
 * 作业校验策略：混放否决（waterfall 短路即决策）。
 *
 * 只通过 LedgerReader 只读视图看账本现状（ADR-0008：策略看得见现状，
 * 看不见变更通道）。目标库位已存在同 SKU 不同批次且该库位禁止混放时，
 * 置 decision 并【不调用 next】——短路，下游策略被跳过。
 *
 * 卸载本插件后同样的请求会通过——这正是插件化 WMS 交付定制的方式：
 * 客户的质检规则就是缝上的一个可插拔监听器，而不是产品代码里的 if。
 */

import { LEDGER, type LedgerReader, type PutawayRequest } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export const vetoMixedLotPlugin: Plugin = definePlugin({
  name: 'veto-mixed-lot',
  inject: [LEDGER],
  apply(ctx) {
    const ledger = ctx.getService<LedgerReader>(LEDGER)
    ctx.onWaterfall('putaway/decide', (request: PutawayRequest, next) => {
      if (!request.decision.ok) return next(request)
      const candidate = request.candidates[0]
      if (!candidate) {
        request.decision = { ok: false, reason: '没有可用候选库位' }
        return request // 短路
      }
      if (candidate.mixLotsAllowed) return next(request)
      const foreignLot = ledger
        .linesAt(candidate.location)
        .find((line) => line.sku === request.line.sku && line.lot !== request.line.lot)
      if (foreignLot) {
        request.decision = {
          ok: false,
          reason: `库位 ${candidate.location} 已有批次 ${foreignLot.lot}，禁止与批次 ${request.line.lot} 混放`,
        }
        return request // 短路：策略拥有一票否决权
      }
      return next(request)
    })
  },
})
