import { describe, expect, it, vi } from 'vitest'
import { PDA_RUNTIME, PDA_WORKFLOWS, type PdaWorkflow } from '@cwms/contracts'
import { PdaRuntime, pdaRuntimePlugin } from '@cwms/pda-runtime'
import { createSystem, definePlugin } from '@cwms/kernel'

const WORKFLOW: PdaWorkflow = {
  id: 'demo-flow',
  title: '演示流程',
  steps: [
    { action: '扫 SKU', scan: 'sku' },
    { action: '输数量', input: 'qty' },
    { action: '扫库位完成', scan: 'location' },
  ],
}

function mount(workflow = WORKFLOW) {
  const system = createSystem()
  system.mount(
    definePlugin({
      name: 'registry',
      apply: (ctx) =>
        ctx.provide(PDA_WORKFLOWS, {
          get: (id: string) => (id === workflow.id ? workflow : undefined),
        }),
    }),
  )
  system.mount(pdaRuntimePlugin)
  return system.getService<PdaRuntime>(PDA_RUNTIME)
}

describe('PDA runtime：会话与推进', () => {
  it('start 返回首步提示；submit 按序推进并采集数据', () => {
    const pda = mount()
    const session = pda.start('demo-flow')
    expect(session.status).toBe('running')
    expect(session.prompt).toMatchObject({ index: 1, total: 3, action: '扫 SKU', expects: 'scan' })
    pda.submit(session.id, 'SKU-1', 'op-1')
    const afterQty = pda.submit(session.id, 5, 'op-2')
    expect(afterQty.collected).toEqual({ sku: 'SKU-1', qty: 5 })
    expect(afterQty.prompt).toMatchObject({ index: 3, action: '扫库位完成' })
  })

  it('最后一步触发 onSubmit，会话完成并携带结局', () => {
    const pda = mount()
    const onSubmit = vi.fn((collected) => ({ ok: true, collected }))
    const session = pda.start('demo-flow', { onSubmit })
    pda.submit(session.id, 'SKU-1', 'op-1')
    pda.submit(session.id, 5, 'op-2')
    const done = pda.submit(session.id, 'A-01', 'op-3')
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({ sku: 'SKU-1', qty: 5, location: 'A-01' }, 'op-3')
    expect(done.status).toBe('completed')
    expect(done.prompt).toBeNull()
    expect(done.outcome).toEqual({ ok: true, collected: { sku: 'SKU-1', qty: 5, location: 'A-01' } })
  })

  it('数量步拒绝非正整数；扫码步拒绝空值', () => {
    const pda = mount()
    const session = pda.start('demo-flow')
    pda.submit(session.id, 'SKU-1', 'op-1')
    expect(() => pda.submit(session.id, 0, 'op-2')).toThrow(/正整数/)
    expect(() => pda.submit(session.id, 1.5, 'op-2')).toThrow(/正整数/)
    expect(() => pda.submit(session.id, '12', 'op-2')).toThrow(/正整数/)
    pda.submit(session.id, 4, 'op-2')
    expect(() => pda.submit(session.id, '', 'op-3')).toThrow(/扫码内容/)
  })

  it('onSubmit 抛错时会话原地不动，同 opId 可重试', () => {
    const pda = mount()
    let calls = 0
    const session = pda.start('demo-flow', {
      onSubmit: () => {
        calls += 1
        if (calls === 1) throw new Error('领域暂时不可用')
        return { ok: true }
      },
    })
    pda.submit(session.id, 'SKU-1', 'op-1')
    pda.submit(session.id, 5, 'op-2')
    expect(() => pda.submit(session.id, 'A-01', 'op-3')).toThrow(/领域暂时不可用/)
    const retried = pda.submit(session.id, 'A-01', 'op-3')
    expect(calls).toBe(2)
    expect(retried.status).toBe('completed')
    expect(retried.outcome).toEqual({ ok: true })
  })
})

describe('PDA runtime：opId 幂等（ADR-0005 语义复用）', () => {
  it('同 opId 重放返回当时快照，不重复推进、不重复触发 onSubmit', () => {
    const pda = mount()
    const onSubmit = vi.fn(() => ({ ok: true }))
    const session = pda.start('demo-flow', { onSubmit })
    const first = pda.submit(session.id, 'SKU-1', 'op-1')
    const replay = pda.submit(session.id, 'SKU-XXX', 'op-1') // 同 opId，值不同也不生效
    expect(replay).toEqual(first)
    expect(pda.current(session.id).collected).toEqual({ sku: 'SKU-1' })
    pda.submit(session.id, 5, 'op-2')
    pda.submit(session.id, 'A-01', 'op-3')
    pda.submit(session.id, 'A-01', 'op-3') // 最终步重放
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('start 同 opId 重放不产生第二个会话', () => {
    const pda = mount()
    const a = pda.start('demo-flow', undefined, 'boot-1')
    const b = pda.start('demo-flow', undefined, 'boot-1')
    expect(b.id).toBe(a.id)
    expect(pda.list()).toHaveLength(1)
  })

  it('opId 跨会话复用立即报错', () => {
    const pda = mount()
    const a = pda.start('demo-flow', undefined, 'boot-1')
    const b = pda.start('demo-flow', undefined, 'boot-2')
    pda.submit(a.id, 'SKU-1', 'shared-op')
    expect(() => pda.submit(b.id, 'X', 'shared-op')).toThrow(/已被会话 pda-0001 使用/)
    expect(a.id).toBe('pda-0001')
  })

  it('已结束的会话拒绝新提交（新 opId）', () => {
    const pda = mount()
    const session = pda.start('demo-flow', { onSubmit: () => ({}) })
    pda.submit(session.id, 'S', 'op-1')
    pda.submit(session.id, 1, 'op-2')
    pda.submit(session.id, 'L', 'op-3')
    expect(() => pda.submit(session.id, 'L', 'op-4')).toThrow(/已结束/)
  })
})

describe('PDA runtime：宿主插件', () => {
  it('未注册的工作流报错；注册表通过 inject 获得', () => {
    const pda = mount()
    expect(() => pda.start('nope')).toThrow(/未注册/)
  })

  it('卸载后服务消失（可逆），重挂载为全新实例', () => {
    const system = createSystem()
    system.mount(
      definePlugin({
        name: 'registry',
        apply: (ctx) => ctx.provide(PDA_WORKFLOWS, { get: () => undefined }),
      }),
    )
    system.mount(pdaRuntimePlugin)
    system.unmount('pda-runtime')
    expect(system.isMounted('pda-runtime')).toBe(false)
    system.mount(pdaRuntimePlugin)
    expect(system.getService<PdaRuntime>(PDA_RUNTIME).list()).toHaveLength(0)
  })
})
