import { describe, expect, it, vi } from 'vitest'
import { PC_RUNTIME, PC_TABLES, type ModuleRegistry, type PcTable } from '@cwms/contracts'
import { PcRuntime, pcRuntimePlugin } from '@cwms/pc-runtime'
import { createSystem, definePlugin } from '@cwms/kernel'

const TABLE: PcTable = {
  id: 'inventory',
  title: '库存一览',
  columns: [
    { key: 'location', title: '库位' },
    { key: 'qty', title: '数量' },
  ],
}

function mount(registry: ModuleRegistry<PcTable> = fakeRegistry(TABLE)) {
  const system = createSystem()
  system.mount(definePlugin({ name: 'registry', apply: (ctx) => ctx.provide(PC_TABLES, registry) }))
  system.mount(pcRuntimePlugin)
  return system.getService<PcRuntime>(PC_RUNTIME)
}

function fakeRegistry(...items: PcTable[]): ModuleRegistry<PcTable> {
  const map = new Map(items.map((t) => [t.id, t]))
  return {
    register: (item) => void map.set(item.id, item),
    get: (id) => map.get(id),
    all: () => [...map.values()],
  }
}

describe('PC runtime：描述符消费与查询组装', () => {
  it('query 返回渲染形状：标题、列、由数据源提供的行', () => {
    const pda = mount()
    pda.bindProvider('inventory', () => [{ location: 'A-01', qty: 5 }])
    const view = pda.query('inventory')
    expect(view).toEqual({
      id: 'inventory',
      title: '库存一览',
      columns: TABLE.columns,
      rows: [{ location: 'A-01', qty: 5 }],
    })
  })

  it('未注册的表格与未绑定的数据源分别报错，指向各自职责', () => {
    const pda = mount()
    expect(() => pda.query('nope')).toThrow(/未注册/)
    expect(() => pda.query('inventory')).toThrow(/未绑定数据源/)
  })

  it('数据源每次查询重新求值（投影跟随领域状态）', () => {
    const pda = mount()
    let qty = 1
    pda.bindProvider('inventory', () => [{ location: 'A-01', qty }])
    expect(pda.query('inventory').rows[0]!.qty).toBe(1)
    qty = 9
    expect(pda.query('inventory').rows[0]!.qty).toBe(9)
  })

  it('同名重绑即替换（热重载友好）', () => {
    const pda = mount()
    const first = vi.fn(() => [])
    const second = vi.fn(() => [{ location: 'B-01', qty: 2 }])
    pda.bindProvider('inventory', first)
    pda.bindProvider('inventory', second)
    pda.query('inventory')
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('tables() 列出已注册的描述符', () => {
    const pda = mount()
    expect(pda.tables()).toEqual([TABLE])
  })
})

describe('PC runtime：宿主插件', () => {
  it('卸载可逆，重挂载为全新实例', () => {
    const system = createSystem()
    system.mount(definePlugin({ name: 'registry', apply: (ctx) => ctx.provide(PC_TABLES, fakeRegistry()) }))
    system.mount(pcRuntimePlugin)
    system.unmount('pc-runtime')
    expect(system.isMounted('pc-runtime')).toBe(false)
    system.mount(pcRuntimePlugin)
    expect(system.getService<PcRuntime>(PC_RUNTIME).tables()).toHaveLength(0)
  })
})
