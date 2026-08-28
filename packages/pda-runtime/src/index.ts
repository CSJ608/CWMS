/**
 * PDA 工作流 runtime（ADR-0004/0006 的落地）：通用扫码工作流引擎。
 *
 * 设计要点：
 * - **纯机制**：消费 PdaWorkflow 描述符，驱动"扫码-校验-推进"。
 *   校验只有形状级（扫码非空、数量正整数）——**领域校验仍属策略缝**
 *   （混放否决等在域内行使否决权，runtime 永不越权）。
 * - **绑定在组合根**：谁启动会话谁提供 onSubmit——PDA 适配器把采集到的
 *   数据映射到领域操作。功能包零改动获得端能力；runtime 只依赖
 *   contracts + kernel，通过 inject 拿工作流注册表。
 * - **幂等复用 ADR-0005 语义**：opId 全局唯一、重放返回当时快照、
 *   跨会话复用报错。最终一步的 opId 会传给 onSubmit，实现链式幂等：
 *   PDA 断网重传 → runtime 重放 → 不再触达领域层。
 */

import { PDA_WORKFLOWS, PDA_RUNTIME, type PdaWorkflow, type PdaWorkflowStep } from '@cwms/contracts'
import { definePlugin, type Plugin } from '@cwms/kernel'

export interface PdaPrompt {
  index: number
  total: number
  action: string
  expects: 'scan' | 'input' | 'confirm'
}

export interface PdaSessionSnapshot {
  id: string
  workflowId: string
  status: 'running' | 'completed'
  stepIndex: number
  collected: Record<string, string | number>
  /** 当前步骤提示；completed 时为 null */
  prompt: PdaPrompt | null
  outcome?: unknown
}

/** PDA 适配器提供的领域绑定：把采集数据映射为领域操作，返回操作结局。 */
export type SubmitHandler = (collected: Record<string, string | number>, opId: string) => unknown

export interface StartOptions {
  onSubmit?: SubmitHandler
}

interface SessionRecord {
  id: string
  workflowId: string
  status: 'running' | 'completed'
  stepIndex: number
  collected: Record<string, string | number>
  steps: PdaWorkflowStep[]
  onSubmit?: SubmitHandler
  outcome?: unknown
  ops: Map<string, PdaSessionSnapshot>
}

export class PdaRuntime {
  readonly #sessions = new Map<string, SessionRecord>()
  readonly #opIndex = new Map<string, { sessionId: string; snapshot: PdaSessionSnapshot }>()
  #workflows: { get(id: string): PdaWorkflow | undefined } | null = null
  #seq = 0

  /** 由宿主插件在挂载时接通工作流注册表（inject 的服务）。 */
  bindWorkflows(registry: { get(id: string): PdaWorkflow | undefined }): void {
    this.#workflows = registry
  }

  start(workflowId: string, options?: StartOptions, opId?: string): PdaSessionSnapshot {
    const id = `pda-${String(++this.#seq).padStart(4, '0')}`
    const effectiveOpId = opId ?? `${id}:start`
    const replayed = this.#opIndex.get(effectiveOpId)
    if (replayed) return replayed.snapshot
    const workflow = this.#workflows?.get(workflowId)
    if (!workflow) {
      this.#seq -= 1
      throw new Error(`工作流 ${workflowId} 未注册`)
    }
    this.#sessions.set(id, {
      id,
      workflowId,
      status: 'running',
      stepIndex: 0,
      collected: {},
      steps: workflow.steps,
      onSubmit: options?.onSubmit,
      ops: new Map(),
    })
    return this.#commit(this.#sessions.get(id)!, effectiveOpId)
  }

  /** 提交当前步骤。opId 幂等：重放返回当时快照，不重复推进、不重复触发 onSubmit。 */
  submit(sessionId: string, value: string | number, opId: string): PdaSessionSnapshot {
    const replayed = this.#replayFor(sessionId, opId)
    if (replayed) return replayed
    const session = this.#require(sessionId)
    this.#assertFresh(opId, sessionId)
    if (session.status !== 'running') {
      throw new Error(`会话 ${sessionId} 已结束（${session.status}），不能继续提交`)
    }
    const step = session.steps[session.stepIndex]
    if (!step) throw new Error(`会话 ${sessionId} 步骤越界`)
    this.#validate(step, value)

    const finished = session.stepIndex + 1 >= session.steps.length
    if (finished) {
      // 先执行领域绑定，成功后才落地状态——onSubmit 抛错时会话原地不动，同 opId 可重试
      const key = step.scan ?? step.input
      const collectedNext = key ? { ...session.collected, [key]: value } : { ...session.collected }
      const outcome = session.onSubmit?.(collectedNext, opId)
      session.collected = collectedNext
      session.stepIndex += 1
      session.status = 'completed'
      session.outcome = outcome
    } else {
      const key = step.scan ?? step.input
      if (key) session.collected[key] = value
      session.stepIndex += 1
    }
    return this.#commit(session, opId)
  }

  current(sessionId: string): PdaSessionSnapshot {
    return this.#view(this.#require(sessionId))
  }

  list(): PdaSessionSnapshot[] {
    return [...this.#sessions.values()].map((s) => this.#view(s))
  }

  // ---- 内部机制 ----

  #validate(step: PdaWorkflowStep, value: string | number): void {
    if (step.input === 'qty') {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
        throw new Error(`步骤"${step.action}"需要正整数数量，收到 ${value}`)
      }
      return
    }
    if (step.scan || step.input) {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new Error(`步骤"${step.action}"需要扫码内容，收到空值`)
      }
    }
    // 无 scan/input 的步骤是确认步：任意值皆可
  }

  #replayFor(sessionId: string, opId: string): PdaSessionSnapshot | undefined {
    const hit = this.#opIndex.get(opId)
    return hit && hit.sessionId === sessionId ? hit.snapshot : undefined
  }

  #assertFresh(opId: string, sessionId: string): void {
    const hit = this.#opIndex.get(opId)
    if (hit && hit.sessionId !== sessionId) {
      throw new Error(`opId ${opId} 已被会话 ${hit.sessionId} 使用，不得复用于 ${sessionId}`)
    }
  }

  #require(sessionId: string): SessionRecord {
    const session = this.#sessions.get(sessionId)
    if (!session) throw new Error(`会话 ${sessionId} 不存在`)
    return session
  }

  #commit(session: SessionRecord, opId: string): PdaSessionSnapshot {
    const snapshot = this.#view(session)
    session.ops.set(opId, snapshot)
    this.#opIndex.set(opId, { sessionId: session.id, snapshot })
    return snapshot
  }

  #view(session: SessionRecord): PdaSessionSnapshot {
    const step = session.steps[session.stepIndex]
    return {
      id: session.id,
      workflowId: session.workflowId,
      status: session.status,
      stepIndex: session.stepIndex,
      collected: { ...session.collected },
      prompt:
        session.status === 'running' && step
          ? {
              index: session.stepIndex + 1,
              total: session.steps.length,
              action: step.action,
              expects: step.scan ? 'scan' : step.input ? 'input' : 'confirm',
            }
          : null,
      outcome: session.outcome,
    }
  }
}

/** 宿主插件：把 runtime 挂到服务 key 上。工作流注册表通过 inject 获得。 */
export const pdaRuntimePlugin: Plugin = definePlugin({
  name: 'pda-runtime',
  inject: [PDA_WORKFLOWS],
  apply(ctx) {
    const runtime = new PdaRuntime()
    runtime.bindWorkflows(ctx.getService<{ get(id: string): PdaWorkflow | undefined }>(PDA_WORKFLOWS))
    ctx.provide(PDA_RUNTIME, runtime)
  },
})
