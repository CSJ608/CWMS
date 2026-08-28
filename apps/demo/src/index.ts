/**
 * 端到端叙事演示：pnpm demo
 *
 * 一条可演示的工作流（批次纪律）：简单场景零配置跑通 →
 * 混放否决短路 → 卸载否决插件行为改变（热插拔）→ 重挂载恢复（可逆性）→
 * ABC overlay 配置改变决策（复杂度按需付费）→ 客户端投影只是数据。
 */

import { DASHBOARD_CARDS, INBOUND, LEDGER, PDA_WORKFLOWS, TASK, type ReceiptLine } from '@cwms/contracts'
import { ClientRegistry, type DashboardCard, type PdaWorkflow } from '@cwms/client-registry'
import { ledgerPlugin, Ledger } from '@cwms/core-ledger'
import { coreTaskPlugin, TaskService } from '@cwms/core-task'
import { clientRegistryPlugin } from '@cwms/client-registry'
import { dashboardProjectionPlugin, featInboundPlugin, InboundService } from '@cwms/feat-inbound'
import { createSystem } from '@cwms/kernel'
import { putawayAbcPlugin } from '@cwms/plugin-putaway-abc'
import { putawayZonePlugin } from '@cwms/plugin-putaway-zone'
import { vetoMixedLotPlugin } from '@cwms/plugin-veto-mixed-lot'

const say = (title: string, body: unknown) =>
  console.log(`\n== ${title} ==\n${JSON.stringify(body, null, 2)}`)

const CANDIDATES = [
  { location: 'A-01-01', zone: 'A' },
  { location: 'B-02-01', zone: 'B' },
  { location: 'C-03-01', zone: 'C', mixLotsAllowed: true },
]

function build() {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  system.mount(ledgerPlugin)
  system.mount(coreTaskPlugin)
  system.mount(featInboundPlugin)
  system.mount(dashboardProjectionPlugin)
  system.mount(putawayZonePlugin)
  return system
}

const inbound = (system: ReturnType<typeof createSystem>) =>
  system.getService<InboundService>(INBOUND)

// 1. 简单场景：零配置，收一批货并按缺省区域优先级上架
const system = build()
say('已挂载插件', system.mountedNames())

const firstLine: ReceiptLine = { sku: 'SKU-1001', lot: 'L20260801', qty: 10 }
say('① 零配置上架（简单场景免费）', inbound(system).receive(firstLine, 'STAGING', CANDIDATES))

// 2. 混放否决：同一库位来不同批次，被校验策略一票否决
system.mount(vetoMixedLotPlugin)
const secondLine: ReceiptLine = { sku: 'SKU-1001', lot: 'L20260815', qty: 5 }
const blocked = inbound(system).receive(secondLine, 'STAGING', CANDIDATES.slice(0, 2))
say('② 混放否决（短路即决策）', blocked)

// 3. 热插拔：卸载否决插件，同样的请求通过；重挂载，行为恢复——可逆性
system.unmount('veto-mixed-lot')
const passed = inbound(system).receive(secondLine, 'STAGING', CANDIDATES.slice(0, 2))
say('③a 卸载否决插件后同请求', passed)
system.mount(vetoMixedLotPlugin)
const blockedAgain = inbound(system).receive({ ...secondLine, lot: 'L20260820' }, 'STAGING', CANDIDATES.slice(0, 2))
say('③b 重挂载后同请求再次被拒（可逆）', blockedAgain)

// 4. ABC overlay：复杂场景通过配置付费，不改任何代码。
//    架构约定：策略（排序）先挂载，校验（否决）最后挂载——校验永远看到最终候选序。
//    veto 在第 ② 步已挂载，reload 将它移到链尾，正是为了让 ABC 排序先生效。
system.reload(putawayAbcPlugin, { velocity: { 'SKU-1001': 5000 }, fastZones: ['C'], fastThreshold: 10000 })
system.reload(vetoMixedLotPlugin)
const hotSale: ReceiptLine = { sku: 'SKU-1001', lot: 'L20260825', qty: 3 }
const abcResult = inbound(system).receive(hotSale, 'STAGING', CANDIDATES)
say('④ ABC overlay：快流 SKU 直配 C 区（混放允许）', abcResult)

// 5. 客户端投影：PDA 拿到工作流定义，大屏拿到卡片与只读读模型
say('⑤ PDA 工作流描述符', system.getService<ClientRegistry<PdaWorkflow>>(PDA_WORKFLOWS).all())
say(
  '⑤ 大屏卡片与读模型',
  {
    cards: system.getService<ClientRegistry<DashboardCard>>(DASHBOARD_CARDS).all(),
    readModel: system.getService<{ todayInboundQty: number }>('dashboard/read-model'),
  },
)

// 6. 任务驱动 + opId 幂等：PDA 弱网重放安全——重复提交不重复收货
const taskLine: ReceiptLine = { sku: 'SKU-3001', lot: 'L20260901', qty: 8 }
const firstRun = inbound(system).receiveViaTask(taskLine, 'STAGING', CANDIDATES, 'op-9001')
const totalAfterFirst = system.getService<Ledger>(LEDGER).total()
const replayRun = inbound(system).receiveViaTask(taskLine, 'STAGING', CANDIDATES, 'op-9001')
say('⑥ 任务驱动收货（opId 幂等重放）', {
  firstRun,
  replayRun,
  重放后账本总量不变: totalAfterFirst === system.getService<Ledger>(LEDGER).total(),
  任务轨迹: system
    .getService<TaskService>(TASK)
    .list('putaway')
    .map((t) => `${t.id} ${t.status}${t.reason ? `（${t.reason}）` : ''}`),
})

console.log('\n== 账本终态（唯一变更通道的产物） ==')
console.log(JSON.stringify(system.getService<Ledger>(LEDGER).snapshot(), null, 2))
