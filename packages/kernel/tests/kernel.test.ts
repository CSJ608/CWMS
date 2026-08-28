import { describe, expect, it } from 'vitest'
import { createSystem, definePlugin } from '@cwms/kernel'

describe('内核：挂载与依赖', () => {
  it('inject 缺失时拒绝挂载并指出缺什么', () => {
    const system = createSystem()
    system.mount(definePlugin({ name: 'a', apply: (ctx) => ctx.provide('svc', {}) }))
    expect(() =>
      system.mount(definePlugin({ name: 'b', inject: ['nope'], apply: () => {} })),
    ).toThrow(/缺少依赖服务：nope/)
  })

  it('重复提供同一服务被拒绝', () => {
    const system = createSystem()
    system.mount(definePlugin({ name: 'a', apply: (ctx) => ctx.provide('svc', 1) }))
    expect(() =>
      system.mount(definePlugin({ name: 'b', apply: (ctx) => ctx.provide('svc', 2) })),
    ).toThrow(/不得重复提供/)
  })

  it('依赖者先于提供者卸载（级联），副作用全部回滚', () => {
    const system = createSystem()
    const order: string[] = []
    system.mount(
      definePlugin({
        name: 'provider',
        apply: (ctx) => {
          ctx.provide('svc', { v: 1 })
          ctx.effect(() => order.push('provider:effect'))
        },
      }),
    )
    system.mount(
      definePlugin({
        name: 'consumer',
        inject: ['svc'],
        apply: (ctx) => {
          ctx.effect(() => order.push('consumer:effect'))
        },
      }),
    )
    system.unmount('provider')
    expect(system.isMounted('provider')).toBe(false)
    expect(system.isMounted('consumer')).toBe(false)
    expect(order).toEqual(['consumer:effect', 'provider:effect']) // 后序 + LIFO
    expect(() => system.getService('svc')).toThrow(/不存在/)
  })
})

describe('内核：副作用可逆', () => {
  it('卸载时按 LIFO 执行 effect', () => {
    const system = createSystem()
    const order: string[] = []
    system.mount(
      definePlugin({
        name: 'p',
        apply: (ctx) => {
          ctx.effect(() => order.push('first'))
          ctx.effect(() => order.push('second'))
        },
      }),
    )
    system.unmount('p')
    expect(order).toEqual(['second', 'first'])
  })

  it('卸载移除本插件的监听器，不影响他人', () => {
    const system = createSystem()
    const seen: string[] = []
    system.mount(
      definePlugin({
        name: 'a',
        apply: (ctx) => ctx.on('ledger/changed', () => seen.push('a')),
      }),
    )
    system.mount(
      definePlugin({
        name: 'b',
        apply: (ctx) => ctx.on('ledger/changed', () => seen.push('b')),
      }),
    )
    system.unmount('a')
    system.emit('ledger/changed', undefined)
    expect(seen).toEqual(['b'])
    expect(system.listenerCount('ledger/changed')).toBe(1)
  })

  it('热重载后行为只取决于最终挂载集合（可逆性）', () => {
    const system = createSystem()
    const make = (tag: string) =>
      definePlugin<{ tag?: string }>({
        name: 'switchable',
        apply: (ctx, cfg) => ctx.provide('who', cfg?.tag ?? tag),
      })
    system.mount(make('v1'))
    expect(system.getService('who')).toBe('v1')
    system.reload(make('v2'), { tag: 'v2' })
    expect(system.getService('who')).toBe('v2')
    expect(system.mountedNames()).toEqual(['switchable'])
  })
})

describe('内核：waterfall 语义', () => {
  // 本组测试针对内核机制本身，使用 System 层非类型化 API，
  // 不依赖任何具体事件契约（契约由各包通过声明合并注册）。
  it('按注册顺序包装，最后返回处理结果', () => {
    const system = createSystem()
    system.mount(
      definePlugin({
        name: 'plus1',
        apply: (ctx) => ctx.onWaterfall('putaway/decide', (req, next) => next(req)),
      }),
    )
    system.addListener('plus1', 'raw', (n: number, next: (x: number) => number) => next(n + 1))
    system.addListener('times2', 'raw', (n: number, next: (x: number) => number) => next(n * 2))
    expect(system.waterfall<number>('raw', 5)).toBe(12) // (5+1)*2
  })

  it('短路跳过下游监听器', () => {
    const system = createSystem()
    const downstream: number[] = []
    system.addListener('gate', 'raw', () => 7) // 不调用 next：短路
    system.addListener('probe', 'raw', (n: number, next: (x: number) => number) => {
      downstream.push(n)
      return next(n)
    })
    expect(system.waterfall<number>('raw', 7)).toBe(7)
    expect(downstream).toEqual([])
  })

  it('短路者的返回值成为最终结果，下游被完全忽略', () => {
    const system = createSystem()
    system.addListener('short', 'raw', () => 'short-circuited')
    system.addListener('after', 'raw', (s: string, next: (x: string) => string) => next(s + '!'))
    expect(system.waterfall<string>('raw', 'x')).toBe('short-circuited')
  })
})
