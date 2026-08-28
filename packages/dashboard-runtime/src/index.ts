/**
 * 大屏 runtime（ADR-0004/0010）：卡片投影引擎 + 作业看板读模型。
 *
 * 与 pda-runtime / pc-runtime 同一模式：
 * - **纯机制**：卡片引擎消费 DashboardCard 描述符（指标名是数据），
 *   query() 组装 {描述符 + 指标值} 的渲染形状。指标值怎么算是组合根
 *   绑定的 provider 的事，runtime 不认识任何领域概念。
 * - **读模型只靠事件喂养**：作业看板订阅 task/changed 维护物化视图，
 *   大屏永不直查任务机——卸载即重置（可逆性纪律，ADR-0001）。
 * - 无实时推送/节流/历史曲线——投影按需付费（ADR-0002）。
 */

import {
  DASHBOARD_BOARD,
  DASHBOARD_CARDS,
  DASHBOARD_RUNTIME,
  type DashboardCard,
  type ModuleRegistry,
  type TaskChanged,
  type TaskStatus,
} from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export type MetricValue = string | number
export type MetricProvider = () => MetricValue

export interface CardView {
  id: string
  title: string
  metric: string
  value: MetricValue
}

export class DashboardRuntime {
  #cards: ModuleRegistry<DashboardCard> | null = null
  readonly #providers = new Map<string, MetricProvider>()

  /** 由宿主插件在挂载时接通卡片注册表（inject 的服务）。 */
  bindCards(registry: ModuleRegistry<DashboardCard>): void {
    this.#cards = registry
  }

  /** 组合根绑定指标数据源；同名重绑即替换（热重载友好）。 */
  bindMetric(metric: string, provide: MetricProvider): void {
    this.#providers.set(metric, provide)
  }

  query(cardId: string): CardView {
    const card = this.#cards?.get(cardId)
    if (!card) throw new Error(`大屏卡片 ${cardId} 未注册`)
    const provide = this.#providers.get(card.metric)
    if (!provide) throw new Error(`大屏卡片 ${cardId} 的指标 ${card.metric} 未绑定数据源（组合根职责，见 bindMetric）`)
    return { id: card.id, title: card.title, metric: card.metric, value: provide() }
  }

  cards(): DashboardCard[] {
    return this.#cards?.all() ?? []
  }
}

// ---- 作业看板读模型：task/changed 事件喂养的物化视图 ----

export interface BoardColumn {
  status: TaskStatus
  count: number
  taskIds: string[]
}

export interface TaskBoardView {
  columns: BoardColumn[]
}

const STATUSES: TaskStatus[] = ['created', 'assigned', 'executing', 'completed', 'cancelled']

export class TaskBoard {
  readonly #tasks = new Map<string, TaskStatus>()

  /** task/changed 的唯一入口：迁移任务所在列。 */
  on(change: TaskChanged): void {
    this.#tasks.set(change.taskId, change.to)
  }

  snapshot(): TaskBoardView {
    return {
      columns: STATUSES.map((status) => {
        const taskIds = [...this.#tasks.entries()].filter(([, s]) => s === status).map(([id]) => id)
        return { status, count: taskIds.length, taskIds }
      }),
    }
  }

  reset(): void {
    this.#tasks.clear()
  }
}

/** 宿主插件：把卡片引擎挂到服务 key 上。卡片注册表通过 inject 获得。 */
export const dashboardRuntimePlugin: Plugin = definePlugin({
  name: 'dashboard-runtime',
  inject: [DASHBOARD_CARDS],
  apply(ctx) {
    const runtime = new DashboardRuntime()
    runtime.bindCards(ctx.getService<ModuleRegistry<DashboardCard>>(DASHBOARD_CARDS))
    ctx.provide(DASHBOARD_RUNTIME, runtime)
  },
})

/** 作业看板投影：只读订阅任务事件，维护分列视图；卸载即清空。 */
export const taskBoardPlugin: Plugin = definePlugin({
  name: 'dashboard-task-board',
  apply(ctx) {
    const board = new TaskBoard()
    ctx.on('task/changed', (change) => board.on(change))
    ctx.effect(() => board.reset())
    ctx.provide(DASHBOARD_BOARD, board)
  },
})
