/**
 * CWMS 契约包：全系统唯一的跨包词汇表。
 *
 * 依赖方向铁律（ADR-0003）：所有包只准依赖本包与 @cwms/kernel；
 * host 半身与 client 半身之间只通过本包对话。
 *
 * 事件契约也集中在此声明（声明合并写入内核的事件注册表），
 * 保证"谁在听什么事件"是可检索的公共知识，而非散落的私有约定。
 */

// ---- 服务 key（稳定的公共接缝名）----

export const LEDGER = 'ledger'
export const INBOUND = 'inbound'
export const TASK = 'task'
export const PDA_WORKFLOWS = 'pda/workflows'
export const PDA_RUNTIME = 'pda/runtime'
export const PC_TABLES = 'pc/tables'
export const PC_RUNTIME = 'pc/runtime'
export const DASHBOARD_CARDS = 'dashboard/cards'
export const DASHBOARD_RUNTIME = 'dashboard/runtime'
export const DASHBOARD_BOARD = 'dashboard/board'

// ---- 领域最小模型 ----

export interface StockLine {
  location: string
  sku: string
  lot: string
  qty: number
}

export interface ReceiptLine {
  sku: string
  lot: string
  qty: number
}

export interface LedgerChanged {
  kind: 'receive' | 'ship' | 'move'
  sku: string
  lot: string
  qty: number
  location: string
  /** 仅 move：移出库位。事件流守恒的依据——重放可重建账本（ADR-0011）。 */
  from?: string
}

// ---- 上架策略缝（waterfall：包装与短路即决策）----

export interface PutawayCandidate {
  location: string
  zone: string
  /** 该库位是否允许混放不同批次；缺省视为禁止。 */
  mixLotsAllowed?: boolean
}

export interface PutawayDecision {
  ok: boolean
  reason?: string
  location?: string
}

export interface PutawayRequest {
  line: ReceiptLine
  candidates: PutawayCandidate[]
  decision: PutawayDecision
}

// ---- 任务机（内核封闭清单成员，ADR-0005：迁移表 + opId 幂等推进）----

export type TaskStatus = 'created' | 'assigned' | 'executing' | 'completed' | 'cancelled'

export interface TaskSnapshot {
  id: string
  kind: string
  status: TaskStatus
  worker?: string
  reason?: string
  createdAt: number
}

export interface TaskChanged {
  taskId: string
  kind: string
  /** 'void' 表示任务被创建 */
  from: TaskStatus | 'void'
  to: TaskStatus
  opId: string
}

// ---- 客户端投影描述符（client 半身是数据，不是页面）----

export interface PdaWorkflowStep {
  action: string
  scan?: 'location' | 'sku' | 'lot'
  input?: 'qty'
}

export interface PdaWorkflow {
  id: string
  title: string
  steps: PdaWorkflowStep[]
}

export interface DashboardCard {
  id: string
  title: string
  metric: 'todayInboundQty' | 'stockTotalQty'
}

// ---- PC 投影描述符（ADR-0004：PC 交互是数据的函数）----

export interface PcColumn {
  key: string
  title: string
}

/** PC 表格描述符：纯数据，不含任何 UI 代码；行数据由组合根绑定。 */
export interface PcTable {
  id: string
  title: string
  columns: PcColumn[]
}

// ---- 服务契约：实现住在各包，接口住在契约包（ADR-0008）----
//
// 依赖方向铁律的执行点：功能与策略只准依赖 contracts + kernel，
// 所以它们只能通过这里的接口认识服务。LedgerReader 是**只读视图**——
// 策略与校验看得见账本现状，看不见变更通道（receive/ship/move 只属于
// 被授权驱动的功能宿主）。实现类与接口是结构化匹配，无需显式继承。

/** 账本只读视图：策略与校验缝的唯一窗口。 */
export interface LedgerReader {
  find(location: string, sku: string, lot: string): StockLine | undefined
  linesAt(location: string): StockLine[]
  total(): number
  snapshot(): StockLine[]
}

/** 完整账本 API：只有被授权驱动变更的功能宿主使用。 */
export interface InventoryLedger extends LedgerReader {
  receive(line: ReceiptLine, location: string): void
  ship(line: ReceiptLine, location: string): void
  move(line: ReceiptLine, from: string, to: string): void
}

/** 任务机契约：领域无关的推进协议（ADR-0005）。 */
export interface TaskDetail extends TaskSnapshot {
  payload: unknown
  result?: unknown
}

export interface TaskServiceView {
  create(kind: string, payload: unknown, opId: string): TaskSnapshot
  assign(taskId: string, worker: string, opId: string): TaskSnapshot
  start(taskId: string, opId: string): TaskSnapshot
  complete(taskId: string, result: unknown, opId: string): TaskSnapshot
  cancel(taskId: string, reason: string, opId: string): TaskSnapshot
  get(taskId: string): TaskDetail
  list(kind?: string, status?: TaskStatus): TaskDetail[]
}

/** 客户端模块注册表契约：功能包向端 runtime 登记描述符的唯一通道。 */
export interface ModuleRegistry<T extends { id: string }> {
  register(item: T): void
  get(id: string): T | undefined
  all(): T[]
}

// ---- 事件契约（写入内核的注册表）----

declare module '@cwms/kernel' {
  interface EmitEvents {
    'ledger/changed': LedgerChanged
    'task/changed': TaskChanged
  }
  interface WaterfallEvents {
    'putaway/decide': PutawayRequest
  }
}
