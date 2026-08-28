/**
 * PC 工作流 runtime（ADR-0004/0009）：表格投影引擎。
 *
 * 与 pda-runtime 同一模式：
 * - **纯机制**：消费 PcTable 描述符（列定义是数据），query() 组装渲染形状。
 *   runtime 不校验行内容——数据形状对齐列 key 是适配器的责任。
 * - **数据绑定在组合根**：谁组装系统谁 bindProvider。功能包只登记一次
 *   描述符即获得 PC 能力，零 UI 代码。
 * - 无分页/排序/虚拟滚动——投影按需付费（ADR-0002），真实需求出现再加。
 */

import { PC_TABLES, PC_RUNTIME, type ModuleRegistry, type PcColumn, type PcTable } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export type TableRow = Record<string, string | number>
export type TableProvider = () => TableRow[]

export interface TableView {
  id: string
  title: string
  columns: PcColumn[]
  rows: TableRow[]
}

export class PcRuntime {
  #tables: ModuleRegistry<PcTable> | null = null
  readonly #providers = new Map<string, TableProvider>()

  /** 由宿主插件在挂载时接通表格注册表（inject 的服务）。 */
  bindTables(registry: ModuleRegistry<PcTable>): void {
    this.#tables = registry
  }

  /** 组合根绑定数据源；同名重绑即替换（热重载友好）。 */
  bindProvider(tableId: string, provide: TableProvider): void {
    this.#providers.set(tableId, provide)
  }

  query(tableId: string): TableView {
    const table = this.#tables?.get(tableId)
    if (!table) throw new Error(`PC 表格 ${tableId} 未注册`)
    const provide = this.#providers.get(tableId)
    if (!provide) throw new Error(`PC 表格 ${tableId} 未绑定数据源（组合根职责，见 bindProvider）`)
    return { id: table.id, title: table.title, columns: table.columns, rows: provide() }
  }

  tables(): PcTable[] {
    return this.#tables?.all() ?? []
  }
}

/** 宿主插件：把 runtime 挂到服务 key 上。表格注册表通过 inject 获得。 */
export const pcRuntimePlugin: Plugin = definePlugin({
  name: 'pc-runtime',
  inject: [PC_TABLES],
  apply(ctx) {
    const runtime = new PcRuntime()
    runtime.bindTables(ctx.getService<ModuleRegistry<PcTable>>(PC_TABLES))
    ctx.provide(PC_RUNTIME, runtime)
  },
})
