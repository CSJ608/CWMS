/**
 * 端到端叙事演示：pnpm demo
 *
 * 一条可演示的工作流（批次纪律）：简单场景零配置跑通 →
 * 混放否决短路 → 卸载否决插件行为改变（热插拔）→ 重挂载恢复（可逆性）→
 * ABC overlay 配置改变决策（复杂度按需付费）→ 客户端投影只是数据。
 */

import { DASHBOARD_CARDS, INBOUND, LEDGER, PDA_RUNTIME, PDA_WORKFLOWS, TASK, type ReceiptLine } from '@cwms/contracts'
import { ClientRegistry, type DashboardCard, type PdaWorkflow } from '@cwms/client-registry'
import { ledgerPlugin, Ledger } from '@cwms/core-ledger'
import { coreTaskPlugin, TaskService } from '@cwms/core-task'
import { PdaRuntime, pdaRuntimePlugin } from '@cwms/pda-runtime'
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
  system.mount(pdaRuntimePlugin)
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

// 7. PDA runtime：扫码会话驱动收货上架——"每次扫码 = 一次幂等推进"
//    适配器（组合根）把采集数据绑定到领域操作；功能包零改动获得端能力。
const pda = system.getService<PdaRuntime>(PDA_RUNTIME)
const pdaSession = pda.start(
  'inbound-putaway',
  {
    onSubmit: (collected, opId) =>
      inbound(system).receiveViaTask(
        { sku: String(collected.sku), lot: String(collected.lot), qty: collected.qty as number },
        'STAGING',
        [{ location: String(collected.location), zone: String(collected.location).split('-')[0]!, mixLotsAllowed: true }],
        opId,
      ),
  },
  'pda-boot-1',
)
say('⑦a PDA 会话开始，当前提示', pda.current(pdaSession.id).prompt)
pda.submit(pdaSession.id, 'SKU-4001', 'pda-op-1')
pda.submit(pdaSession.id, 'L20260910', 'pda-op-2')
pda.submit(pdaSession.id, 12, 'pda-op-3')
const pdaDone = pda.submit(pdaSession.id, 'C-03-01', 'pda-op-4')
const totalBeforeReplay = system.getService<Ledger>(LEDGER).total()
const pdaReplay = pda.submit(pdaSession.id, 'C-03-01', 'pda-op-4') // 模拟断网重传
say('⑦b PDA 完成 + 断网重传', {
  扫码结局: pdaDone.outcome,
  重传结局一致: JSON.stringify(pdaReplay.outcome) === JSON.stringify(pdaDone.outcome),
  重传后账本不变: system.getService<Ledger>(LEDGER).total() === totalBeforeReplay,
})

// 8. 配置 schema（ADR-0007）：深合并 overlay——冷链仓只加 S 区优先级，不抄全表
system.reload(putawayZonePlugin, { zonePriority: { S: 0 } })
const cold = inbound(system).receiveViaTask(
  { sku: 'SKU-5001', lot: 'L20261001', qty: 6 },
  'STAGING',
  [
    { location: 'A-01-01', zone: 'A' },
    { location: 'S-01-01', zone: 'S' },
  ],
  'op-cold',
)
say('⑧ 深合并 overlay：新增 S 区置顶（缺省表保留 A/B/C）', cold)

// 8b. 配置预算制：拼错的配置项大声报错，且原子 reload——旧配置保持在岗
const bad: Record<string, unknown> = { zonePriorty: { S: 0 } }
try {
  system.reload(putawayZonePlugin, bad as never)
} catch (error) {
  say('⑧b 未知配置项被拒绝（旧实例仍在岗）', (error as Error).message)
}

console.log('\n== 账本终态（唯一变更通道的产物） ==')
console.log(JSON.stringify(system.getService<Ledger>(LEDGER).snapshot(), null, 2))
