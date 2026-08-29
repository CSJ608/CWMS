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

describe('PC runtime：列等值筛选（ADR-0009 增补）', () => {
  const FILTERABLE: PcTable = { ...TABLE, filters: [{ key: 'location' }] }

  it('筛选命中：等值行保留，标题与列不变', () => {
    const pda = mount(fakeRegistry(FILTERABLE))
    pda.bindProvider('inventory', () => [
      { location: 'A-01', qty: 5 },
      { location: 'B-01', qty: 2 },
      { location: 'A-01', qty: 3 },
    ])
    const view = pda.query('inventory', { location: 'A-01' })
    expect(view.title).toBe('库存一览')
    expect(view.columns).toEqual(FILTERABLE.columns)
    expect(view.rows).toEqual([
      { location: 'A-01', qty: 5 },
      { location: 'A-01', qty: 3 },
    ])
  })

  it('筛选未命中：行集为空，不报错', () => {
    const pda = mount(fakeRegistry(FILTERABLE))
    pda.bindProvider('inventory', () => [{ location: 'A-01', qty: 5 }])
    expect(pda.query('inventory', { location: 'Z-99' }).rows).toEqual([])
  })

  it('未知列报错：错误信息列出可用列', () => {
    const pda = mount(fakeRegistry(FILTERABLE))
    pda.bindProvider('inventory', () => [])
    expect(() => pda.query('inventory', { nope: 'x' })).toThrow(/无列 nope/)
  })

  it('列存在但未在 filters 声明：报错，筛选面归描述符管', () => {
    const pda = mount(fakeRegistry(FILTERABLE))
    pda.bindProvider('inventory', () => [])
    expect(() => pda.query('inventory', { qty: 5 })).toThrow(/未在 filters 中声明/)
  })

  it('无 filters 描述符的表不可筛；空筛选对象等同不筛', () => {
    const pda = mount() // TABLE 未声明 filters
    pda.bindProvider('inventory', () => [{ location: 'A-01', qty: 5 }])
    expect(() => pda.query('inventory', { location: 'A-01' })).toThrow(/未在 filters 中声明/)
    expect(pda.query('inventory', {}).rows).toEqual([{ location: 'A-01', qty: 5 }])
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
