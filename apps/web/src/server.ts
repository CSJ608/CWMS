/**
 * web 渲染器（apps/web）：三端投影的第一个图形消费者（ADR-0004/0009/0010 的命题兑现）。
 *
 * 组合根职责：组装与 demo 相同的系统，把描述符查询结果经 JSON 暴露给单页界面；
 * UI 事件经小 API 驱动真实领域操作（任务机 + 账本），投影轮询刷新。
 * 本应用不引入任何新缝、新契约——它是纯消费者（check-deps 的 app 角色豁免）。
 * 零依赖：node:http + 静态单页。
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import {
  DASHBOARD_BOARD,
  DASHBOARD_RUNTIME,
  INBOUND,
  LEDGER,
  OUTBOUND,
  PDA_RUNTIME,
  PDA_WORKFLOWS,
  PC_RUNTIME,
  TASK,
  type LedgerReader,
  type OutboundLine,
  type ReceiptLine,
  type TaskChanged,
  type TaskServiceView,
} from '@cwms/contracts'
import { clientRegistryPlugin } from '@cwms/client-registry'
import { Ledger, ledgerPlugin } from '@cwms/core-ledger'
import { coreTaskPlugin } from '@cwms/core-task'
import { DashboardRuntime, dashboardRuntimePlugin, TaskBoard, taskBoardPlugin } from '@cwms/dashboard-runtime'
import { dashboardProjectionPlugin, featInboundPlugin, InboundService } from '@cwms/feat-inbound'
import { featOutboundPlugin, outboundProjectionPlugin, OutboundService } from '@cwms/feat-outbound'
import { createSystem } from '@cwms/kernel'
import { PcRuntime, pcRuntimePlugin } from '@cwms/pc-runtime'
import { PdaRuntime, pdaRuntimePlugin } from '@cwms/pda-runtime'
import { putawayZonePlugin } from '@cwms/plugin-putaway-zone'
import { vetoMixedLotPlugin } from '@cwms/plugin-veto-mixed-lot'

const PORT = Number(process.env.PORT ?? 8787)

// ---- 组合根：与 demo 同构 ----
const system = createSystem()
system.mount(clientRegistryPlugin)
system.mount(ledgerPlugin)
system.mount(coreTaskPlugin)
system.mount(featInboundPlugin)
system.mount(dashboardProjectionPlugin)
system.mount(featOutboundPlugin)
system.mount(outboundProjectionPlugin)
system.mount(putawayZonePlugin)
system.mount(vetoMixedLotPlugin)
system.mount(pdaRuntimePlugin)
system.mount(pcRuntimePlugin)
system.mount(dashboardRuntimePlugin)
system.mount(taskBoardPlugin)

const ledger = system.getService<Ledger>(LEDGER)
const inbound = system.getService<InboundService>(INBOUND)
const outbound = system.getService<OutboundService>(OUTBOUND)
const tasks = system.getService<TaskServiceView>(TASK)
const pda = system.getService<PdaRuntime>(PDA_RUNTIME)
const pc = system.getService<PcRuntime>(PC_RUNTIME)
const dash = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
const board = system.getService<TaskBoard>(DASHBOARD_BOARD)

pc.bindProvider('inventory', () => ledger.snapshot().map((line) => ({ ...line })))
pc.bindProvider(
  'outbound-log',
  () =>
    system
      .getService<{ log: Array<Record<string, string | number>> }>('outbound/read-model')
      .log.map((row) => ({ ...row })),
)
dash.bindMetric('todayInboundQty', () => system.getService<{ todayInboundQty: number }>('dashboard/read-model').todayInboundQty)
dash.bindMetric('todayOutboundQty', () => system.getService<{ todayOutboundQty: number }>('outbound/read-model').todayOutboundQty)
dash.bindMetric('stockTotalQty', () => ledger.total())

const candidatesOf = (location: string) => [
  { location, zone: location.split('-')[0]!, mixLotsAllowed: location.startsWith('C') },
]

// ---- PDA 会话的领域绑定（组合根Adapter，同 demo）----
const submitOf = (workflowId: string) => (collected: Record<string, string | number>, opId: string) => {
  const line = { sku: String(collected.sku), lot: String(collected.lot), qty: collected.qty as number }
  const location = String(collected.location)
  if (workflowId === 'outbound-pick') return outbound.shipViaTask(line satisfies OutboundLine, location, opId)
  return inbound.receiveViaTask(line satisfies ReceiptLine, 'STAGING', candidatesOf(location), opId)
}

let seq = 0
const nextOp = (tag: string) => `web-${tag}-${String(++seq)}`

// ---- 会话↔任务关联（呈现层透传，无业务计算）----
// 订阅既有 task/changed 事件记 opId→taskId；PDA 会话完结那步的 opId 正是
// onSubmit→tasks.create 的 opId（链式幂等，ADR-0005），据此把任务 id 附到会话快照，
// 供前端「会话历史」与「任务轨迹」交叉对照。
const taskOfOp = new Map<string, string>()
system.addListener('web', 'task/changed', (change: TaskChanged) => {
  if (change.from === 'void') taskOfOp.set(change.opId, change.taskId)
})
const taskOfSession = new Map<string, string>()

// ---- 只读状态（投影快照，UI 轮询）----
function state() {
  return {
    totals: { stock: ledger.total() },
    cards: dash.cards().map((card) => dash.query(card.id)),
    tables: pc.tables().map((t) => pc.query(t.id)),
    board: board.snapshot(),
    tasks: tasks
      .list()
      .slice(-12)
      .reverse()
      .map((t) => ({ id: t.id, kind: t.kind, status: t.status, reason: t.reason })),
    pda: {
      workflows: system.getService<{ all(): Array<{ id: string; title: string }> }>(PDA_WORKFLOWS).all(),
      sessions: pda.list().map((s) => ({ ...s, prompt: s.prompt, taskId: taskOfSession.get(s.id) })),
    },
  }
}

// ---- 写操作（UI 按钮 → 领域操作）----
type Body = Record<string, unknown>
const str = (b: Body, k: string) => String(b[k] ?? '')
const num = (b: Body, k: string) => Math.trunc(Number(b[k] ?? 0))

const actions: Record<string, (body: Body) => unknown> = {
  inbound: (b) =>
    inbound.receiveViaTask(
      { sku: str(b, 'sku'), lot: str(b, 'lot'), qty: num(b, 'qty') },
      'STAGING',
      candidatesOf(str(b, 'location')),
      nextOp('in'),
    ),
  outbound: (b) => outbound.shipViaTask({ sku: str(b, 'sku'), lot: str(b, 'lot'), qty: num(b, 'qty') }, str(b, 'location'), nextOp('out')),
  'pda/start': (b) => pda.start(str(b, 'workflowId'), { onSubmit: submitOf(str(b, 'workflowId')) }, nextOp('start')),
  'pda/submit': (b) => {
    const opId = nextOp('step')
    const snap = pda.submit(str(b, 'sessionId'), (b['value'] as string | number) ?? '', opId)
    if (snap.status === 'completed') {
      const taskId = taskOfOp.get(opId)
      if (taskId) taskOfSession.set(snap.id, taskId)
    }
    return snap
  },
}

async function readBody(req: IncomingMessage): Promise<Body> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body
  } catch {
    return {}
  }
}

const html = await readFile(fileURLToPath(new URL('index.html', import.meta.url)), 'utf8')

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost')
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify(state()))
      return
    }
    if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
      const action = actions[url.pathname.slice(5)]
      if (!action) {
        res.writeHead(404, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: '未知操作' }))
        return
      }
      const result = action(await readBody(req))
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
      res.end(JSON.stringify({ ok: true, result }))
      return
    }
    res.writeHead(404)
    res.end('not found')
  } catch (error) {
    res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }))
  }
})

server.listen(PORT, () => {
  console.log(`CWMS 三端投影渲染器 → http://127.0.0.1:${PORT}（PC 表格 / 大屏看板 / PDA 扫码模拟器）`)
})
