/**
 * 客户端模块注册表（对标 DSH 的 ctx.clientModules）。
 *
 * client 半身不是页面，而是注册进注册表的**数据描述符**：
 * PDA 工作流是步骤序列，大屏卡片是指标名。真正的渲染器将来由
 * 各端 runtime 消费这些描述符——功能包永远不需要知道端的细节。
 */

import {
  DASHBOARD_CARDS,
  PDA_WORKFLOWS,
  type DashboardCard,
  type ModuleRegistry,
  type PdaWorkflow,
} from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export type { DashboardCard, PdaWorkflow }

export class ClientRegistry<T extends { id: string }> implements ModuleRegistry<T> {
  readonly #items = new Map<string, T>()

  register(item: T): void {
    if (this.#items.has(item.id)) throw new Error(`客户端模块 ${item.id} 重复注册`)
    this.#items.set(item.id, item)
  }

  get(id: string): T | undefined {
    return this.#items.get(id)
  }

  all(): T[] {
    return [...this.#items.values()]
  }
}

export const clientRegistryPlugin: Plugin = definePlugin({
  name: 'client-registry',
  apply(ctx) {
    ctx.provide(PDA_WORKFLOWS, new ClientRegistry<PdaWorkflow>())
    ctx.provide(DASHBOARD_CARDS, new ClientRegistry<DashboardCard>())
  },
})
