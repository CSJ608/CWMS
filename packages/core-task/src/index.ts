/**
 * 任务机（core-task）：WMS 作业语义的地基，内核封闭清单成员（ADR-0005）。
 *
 * 设计要点：
 * - **领域无关**：kind 只是字符串。"putaway" 的语义全部住在功能包里，
 *   本服务不知道"上架"为何物——它只管状态迁移与幂等。
 * - **显式迁移表**：created → assigned → executing → completed；
 *   created/assigned/executing 可随时 cancelled；终态拒绝一切新迁移。
 *   同状态自环（新 opId 重复同一迁移）同样被拒绝——opId 是重放保护的
 *   唯一机制，绕过它重复推进是 bug，要暴露而不是吞掉。
 * - **幂等 = opId**：每次推进携带操作 id；重放返回该操作完成时的快照，
 *   不重复执行、不重复发事件；opId 跨任务复用立即报错。
 */

import { TASK, type TaskChanged, type TaskSnapshot, type TaskStatus } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  created: ['assigned', 'cancelled'],
  assigned: ['executing', 'cancelled'],
  executing: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
}

export interface TaskDetail extends TaskSnapshot {
  payload: unknown
  result?: unknown
}

interface TaskRecord {
  id: string
  kind: string
  status: TaskStatus
  payload: unknown
  worker?: string
  reason?: string
  result?: unknown
  createdAt: number
  /** opId → 该操作完成时的快照（幂等重放的依据） */
  ops: Map<string, TaskSnapshot>
}

export class TaskService {
  readonly #tasks = new Map<string, TaskRecord>()
  readonly #opIndex = new Map<string, { taskId: string; snapshot: TaskSnapshot }>()
  #seq = 0
  #emit: ((change: TaskChanged) => void) | null = null

  bind(emit: (change: TaskChanged) => void): void {
    this.#emit = emit
  }

  create(kind: string, payload: unknown, opId: string): TaskSnapshot {
    const replayed = this.#replay(opId)
    if (replayed) return replayed
    const id = `${kind}-${String(++this.#seq).padStart(4, '0')}`
    this.#tasks.set(id, {
      id,
      kind,
      status: 'created',
      payload,
      createdAt: Date.now(),
      ops: new Map(),
    })
    return this.#commit(id, 'void', 'created', opId)
  }

  assign(taskId: string, worker: string, opId: string): TaskSnapshot {
    const replayed = this.#replayFor(taskId, opId)
    if (replayed) return replayed
    this.#require(taskId).worker = worker
    return this.#transition(taskId, 'assigned', opId)
  }

  start(taskId: string, opId: string): TaskSnapshot {
    return this.#step(taskId, 'executing', opId)
  }

  complete(taskId: string, result: unknown, opId: string): TaskSnapshot {
    const replayed = this.#replayFor(taskId, opId)
    if (replayed) return replayed
    this.#require(taskId).result = result
    return this.#transition(taskId, 'completed', opId)
  }

  cancel(taskId: string, reason: string, opId: string): TaskSnapshot {
    const replayed = this.#replayFor(taskId, opId)
    if (replayed) return replayed
    this.#require(taskId).reason = reason
    return this.#transition(taskId, 'cancelled', opId)
  }

  get(taskId: string): TaskDetail {
    const task = this.#tasks.get(taskId)
    if (!task) throw new Error(`任务 ${taskId} 不存在`)
    return { ...this.#view(task) }
  }

  list(kind?: string, status?: TaskStatus): TaskDetail[] {
    return [...this.#tasks.values()]
      .filter((t) => (!kind || t.kind === kind) && (!status || t.status === status))
      .map((t) => this.#view(t))
  }

  // ---- 内部机制 ----

  #step(taskId: string, to: TaskStatus, opId: string): TaskSnapshot {
    const replayed = this.#replayFor(taskId, opId)
    if (replayed) return replayed
    return this.#transition(taskId, to, opId)
  }

  #transition(taskId: string, to: TaskStatus, opId: string): TaskSnapshot {
    const task = this.#require(taskId)
    if (task.ops.has(opId)) return task.ops.get(opId)!
    this.#assertFresh(opId, taskId)
    const from = task.status
    if (!TRANSITIONS[from].includes(to)) {
      throw new Error(`非法任务迁移：${taskId} ${from} → ${to}（opId=${opId}）`)
    }
    task.status = to
    return this.#commit(taskId, from, to, opId)
  }

  #commit(taskId: string, from: TaskStatus | 'void', to: TaskStatus, opId: string): TaskSnapshot {
    const task = this.#require(taskId)
    const snapshot = this.#view(task)
    task.ops.set(opId, snapshot)
    this.#opIndex.set(opId, { taskId, snapshot })
    this.#emit?.({ taskId, kind: task.kind, from, to, opId })
    return snapshot
  }

  /** opId 重放（创建场景）：该 opId 已被任何任务使用即视为重放。 */
  #replay(opId: string): TaskSnapshot | undefined {
    return this.#opIndex.get(opId)?.snapshot
  }

  /**
   * opId 重放（推进场景）：仅当 opId 属于**同一个任务**时才算重放；
   * 属于其他任务则交给 #assertFresh 报错——跨任务复用是 bug，不是重放。
   */
  #replayFor(taskId: string, opId: string): TaskSnapshot | undefined {
    const hit = this.#opIndex.get(opId)
    return hit && hit.taskId === taskId ? hit.snapshot : undefined
  }

  #assertFresh(opId: string, taskId: string): void {
    const hit = this.#opIndex.get(opId)
    if (hit && hit.taskId !== taskId) {
      throw new Error(`opId ${opId} 已被任务 ${hit.taskId} 使用，不得复用于 ${taskId}`)
    }
  }

  #require(taskId: string): TaskRecord {
    const task = this.#tasks.get(taskId)
    if (!task) throw new Error(`任务 ${taskId} 不存在`)
    return task
  }

  #view(task: TaskRecord): TaskDetail {
    return {
      id: task.id,
      kind: task.kind,
      status: task.status,
      worker: task.worker,
      reason: task.reason,
      createdAt: task.createdAt,
      payload: task.payload,
      result: task.result,
    }
  }
}

/** 宿主插件：把任务机挂到服务 key 上，并接通事件总线。 */
export const coreTaskPlugin: Plugin = definePlugin({
  name: 'core-task',
  apply(ctx) {
    const tasks = new TaskService()
    tasks.bind((change) => ctx.emit('task/changed', change))
    ctx.provide(TASK, tasks)
  },
})
