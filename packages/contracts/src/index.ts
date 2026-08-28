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
export const PDA_WORKFLOWS = 'pda/workflows'
export const DASHBOARD_CARDS = 'dashboard/cards'

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

// ---- 事件契约（写入内核的注册表）----

declare module '@cwms/kernel' {
  interface EmitEvents {
    'ledger/changed': LedgerChanged
  }
  interface WaterfallEvents {
    'putaway/decide': PutawayRequest
  }
}
