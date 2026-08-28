/**
 * CWMS 可逆插件内核。
 *
 * 设计对标 Cordis（Koishi 微内核）的核心语义，裁剪为一个教学级实现：
 * - 服务以稳定的字符串 key 注册（provide / getService），插件通过 inject 声明依赖；
 * - 一切注册（服务、监听器、资源）都是可逆副作用：卸载时按 LIFO 回滚；
 * - 提供者卸载时级联卸载其依赖者（生命周期包含关系）；
 * - 事件只支持 emit（观察）与 waterfall（包装/短路）两种分发模式，
 *   parallel / serial 留待需要时引入（见 ADR-0001 已知限制）。
 */

export type Disposer = () => void

/** emit 模式事件注册表：观察语义，不 await、无返回值。插件可通过声明合并扩充。 */
export interface EmitEvents {}

/** waterfall 模式事件注册表：包装语义，短路即决策。插件可通过声明合并扩充。 */
export interface WaterfallEvents {}

export type EmitListener<P> = (payload: P) => void
export type Next<P> = (payload: P) => P
export type WaterfallListener<P> = (payload: P, next: Next<P>) => P

export interface Plugin<C = void> {
  name: string
  /** 依赖的服务 key。内核在挂载前校验，缺失则拒绝挂载。 */
  inject?: readonly string[]
  apply(ctx: Context, config: C): void
}

export function definePlugin<C = void>(plugin: Plugin<C>): Plugin<C> {
  return plugin
}

interface Entry {
  plugin: Plugin<any>
  config: unknown
  effects: Disposer[]
  provides: string[]
}

interface Listener {
  owner: string
  run: (...args: any[]) => any
}

/** 每个插件实例拿到的门面：一切注册都记在该插件名下，卸载时可整体回滚。 */
export class Context {
  constructor(
    private readonly system: System,
    readonly pluginName: string,
  ) {}

  provide<T>(key: string, service: T): void {
    this.system.provide(this.pluginName, key, service)
  }

  getService<T>(key: string): T {
    return this.system.getService(key)
  }

  /** 登记可逆副作用。卸载本插件时按 LIFO 顺序执行。 */
  effect(dispose: Disposer): void {
    this.system.effect(this.pluginName, dispose)
  }

  on<K extends keyof EmitEvents>(event: K, listener: EmitListener<EmitEvents[K]>): void {
    this.system.addListener(this.pluginName, event as string, listener as EmitListener<any>)
  }

  onWaterfall<K extends keyof WaterfallEvents>(
    event: K,
    listener: WaterfallListener<WaterfallEvents[K]>,
  ): void {
    this.system.addListener(this.pluginName, event as string, listener as WaterfallListener<any>)
  }

  emit<K extends keyof EmitEvents>(event: K, payload: EmitEvents[K]): void {
    this.system.emit(event as string, payload)
  }

  waterfall<K extends keyof WaterfallEvents>(
    event: K,
    payload: WaterfallEvents[K],
  ): WaterfallEvents[K] {
    return this.system.waterfall(event as string, payload)
  }
}

export class System {
  readonly #services = new Map<string, { owner: string; value: unknown }>()
  readonly #effects = new Map<string, Disposer[]>()
  readonly #listeners = new Map<string, Listener[]>()
  readonly #entries = new Map<string, Entry>()
  /** 服务 key → 依赖该服务的插件名集合（用于级联卸载）。 */
  readonly #dependents = new Map<string, Set<string>>()

  mount<C>(plugin: Plugin<C>, config?: C): void {
    if (this.#entries.has(plugin.name)) {
      throw new Error(`插件 ${plugin.name} 已挂载`)
    }
    const inject = plugin.inject ?? []
    const missing = inject.filter((key) => !this.#services.has(key))
    if (missing.length > 0) {
      throw new Error(`插件 ${plugin.name} 缺少依赖服务：${missing.join('、')}（先挂载其提供者）`)
    }
    for (const key of inject) {
      const set = this.#dependents.get(key) ?? new Set<string>()
      set.add(plugin.name)
      this.#dependents.set(key, set)
    }
    const entry: Entry = { plugin, config, effects: [], provides: [] }
    this.#entries.set(plugin.name, entry)
    this.#effects.set(plugin.name, entry.effects)
    plugin.apply(new Context(this, plugin.name), config as C)
  }

  /** 卸载插件。先级联卸载依赖其服务的插件（后序），再 LIFO 回滚自身副作用。 */
  unmount(name: string): void {
    const entry = this.#entries.get(name)
    if (!entry) return
    for (const key of entry.provides) {
      for (const dependent of [...(this.#dependents.get(key) ?? [])]) {
        if (dependent !== name) this.unmount(dependent)
      }
    }
    const effects = this.#effects.get(name)
    if (effects) for (const dispose of [...effects].reverse()) dispose()
    this.#effects.delete(name)
    for (const key of entry.provides) this.#services.delete(key)
    for (const key of entry.plugin.inject ?? []) {
      const set = this.#dependents.get(key)
      if (set) {
        set.delete(name)
        if (set.size === 0) this.#dependents.delete(key)
      }
    }
    for (const [event, listeners] of this.#listeners) {
      this.#listeners.set(
        event,
        listeners.filter((l) => l.owner !== name),
      )
    }
    this.#entries.delete(name)
  }

  isMounted(name: string): boolean {
    return this.#entries.has(name)
  }

  /** 热重载：卸载后重新挂载同一插件，配置可替换。外部可观察行为只取决于最终挂载集合。 */
  reload<C>(plugin: Plugin<C>, config?: C): void {
    this.unmount(plugin.name)
    this.mount(plugin, config)
  }

  listenerCount(event: string): number {
    return (this.#listeners.get(event) ?? []).length
  }

  mountedNames(): string[] {
    return [...this.#entries.keys()]
  }

  // ---- 供 Context 调用的内部机制 ----

  provide(owner: string, key: string, value: unknown): void {
    const existing = this.#services.get(key)
    if (existing) {
      throw new Error(`服务 ${key} 已由 ${existing.owner} 提供，${owner} 不得重复提供`)
    }
    this.#services.set(key, { owner, value })
    this.#entries.get(owner)?.provides.push(key)
  }

  getService<T>(key: string): T {
    const service = this.#services.get(key)
    if (!service) {
      throw new Error(`服务 ${key} 不存在；已注册：${[...this.#services.keys()].join('、') || '（无）'}`)
    }
    return service.value as T
  }

  effect(owner: string, dispose: Disposer): void {
    this.#effects.get(owner)?.push(dispose)
  }

  addListener(owner: string, event: string, listener: EmitListener<any> | WaterfallListener<any>): void {
    const list = this.#listeners.get(event) ?? []
    list.push({ owner, run: listener })
    this.#listeners.set(event, list)
  }

  emit(event: string, payload: unknown): void {
    for (const listener of [...(this.#listeners.get(event) ?? [])]) {
      listener.run(payload)
    }
  }

  /** waterfall：按注册顺序包装。监听器不调用 next 即短路，下游被跳过。 */
  waterfall<P>(event: string, payload: P): P {
    const run = [...(this.#listeners.get(event) ?? [])].map((l) => l.run)
    const step = (index: number, current: P): P =>
      index >= run.length
        ? current
        : (run[index]!(current, (next: P) => step(index + 1, next)) as P)
    return step(0, payload)
  }
}

export function createSystem(): System {
  return new System()
}
