import { describe, expect, it } from 'vitest'
import { INBOUND, LEDGER, PDA_RUNTIME, TASK } from '@cwms/contracts'
import { clientRegistryPlugin } from '@cwms/client-registry'
import { Ledger, ledgerPlugin } from '@cwms/core-ledger'
import { coreTaskPlugin, TaskService } from '@cwms/core-task'
import { PdaRuntime, pdaRuntimePlugin } from '@cwms/pda-runtime'
import { createSystem } from '@cwms/kernel'
import { putawayZonePlugin } from '@cwms/plugin-putaway-zone'
import { vetoMixedLotPlugin } from '@cwms/plugin-veto-mixed-lot'
import { dashboardProjectionPlugin, featInboundPlugin, InboundService } from '@cwms/feat-inbound'

function build(withVeto = false) {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  system.mount(ledgerPlugin)
  system.mount(coreTaskPlugin)
  system.mount(featInboundPlugin)
  system.mount(dashboardProjectionPlugin)
  system.mount(putawayZonePlugin)
  if (withVeto) system.mount(vetoMixedLotPlugin)
  system.mount(pdaRuntimePlugin)
  return system
}

const candidatesOf = (location: string) => [
  { location, zone: location.split('-')[0]!, mixLotsAllowed: location.startsWith('C') },
]

function bootPda(system: ReturnType<typeof build>) {
  const inbound = system.getService<InboundService>(INBOUND)
  const pda = system.getService<PdaRuntime>(PDA_RUNTIME)
  const session = pda.start(
    'inbound-putaway',
    {
      onSubmit: (collected, opId) =>
        inbound.receiveViaTask(
          { sku: String(collected.sku), lot: String(collected.lot), qty: collected.qty as number },
          'STAGING',
          candidatesOf(String(collected.location)),
          opId,
        ),
    },
    'pda-boot',
  )
  return { pda, session }
}

describe('端到端：PDA 扫码 → runtime → 任务机 → 策略缝 → 账本', () => {
  it('扫码序列驱动上架成功，采集数据映射为领域操作', () => {
    const system = build()
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'SKU-9001', 'op-1')
    pda.submit(session.id, 'L1', 'op-2')
    pda.submit(session.id, 7, 'op-3')
    const done = pda.submit(session.id, 'B-02-01', 'op-4')
    expect(done.status).toBe('completed')
    expect(done.outcome).toMatchObject({ blocked: false, location: 'B-02-01' })
    const ledger = system.getService<Ledger>(LEDGER)
    expect(ledger.find('B-02-01', 'SKU-9001', 'L1')?.qty).toBe(7)
    expect(system.getService<TaskService>(TASK).list('putaway', 'completed')).toHaveLength(1)
  })

  it('断网重传：最终步同 opId 重放，领域层不再被触达', () => {
    const system = build()
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'SKU-9002', 'op-1')
    pda.submit(session.id, 'L1', 'op-2')
    pda.submit(session.id, 5, 'op-3')
    const done = pda.submit(session.id, 'A-01-01', 'op-4')
    const ledger = system.getService<Ledger>(LEDGER)
    const totalAfterDone = ledger.total()
    const tasksAfterDone = system.getService<TaskService>(TASK).list().length
    const replay = pda.submit(session.id, 'A-01-01', 'op-4') // 断网重传
    expect(replay).toEqual(done)
    expect(ledger.total()).toBe(totalAfterDone)
    expect(system.getService<TaskService>(TASK).list().length).toBe(tasksAfterDone)
  })

  it('校验缝仍有否决权：混放被拒，货留暂存，任务取消，会话如实上报', () => {
    const system = build(true)
    const inbound = system.getService<InboundService>(INBOUND)
    inbound.receive({ sku: 'S1', lot: 'L1', qty: 9 }, 'STAGING', candidatesOf('A-01-01'))
    const { pda, session } = bootPda(system)
    pda.submit(session.id, 'S1', 'op-1')
    pda.submit(session.id, 'L2', 'op-2')
    pda.submit(session.id, 3, 'op-3')
    const done = pda.submit(session.id, 'A-01-01', 'op-4')
    expect(done.status).toBe('completed')
    const outcome = done.outcome as { blocked: boolean; reason?: string }
    expect(outcome.blocked).toBe(true)
    expect(outcome.reason).toMatch(/混放/)
    const ledger = system.getService<Ledger>(LEDGER)
    expect(ledger.find('STAGING', 'S1', 'L2')?.qty).toBe(3)
    expect(system.getService<TaskService>(TASK).list('putaway', 'cancelled')).toHaveLength(1)
  })
})
