import { describe, expect, it } from 'vitest'
import { DASHBOARD_BOARD, DASHBOARD_CARDS, DASHBOARD_RUNTIME, TASK, type DashboardCard, type ModuleRegistry, type TaskServiceView } from '@cwms/contracts'
import { ClientRegistry, clientRegistryPlugin } from '@cwms/client-registry'
import { coreTaskPlugin } from '@cwms/core-task'
import { createSystem } from '@cwms/kernel'
import { DashboardRuntime, dashboardRuntimePlugin, TaskBoard, taskBoardPlugin } from '../src'

function build(withTask = true) {
  const system = createSystem()
  system.mount(clientRegistryPlugin)
  if (withTask) system.mount(coreTaskPlugin)
  system.mount(dashboardRuntimePlugin)
  return system
}

const CARD: DashboardCard = { id: 'inbound-rate', title: '今日入库量', metric: 'todayInboundQty' }

function registerCard(system: ReturnType<typeof build>, card: DashboardCard = CARD) {
  system.getService<ModuleRegistry<DashboardCard>>(DASHBOARD_CARDS).register(card)
}

describe('大屏卡片投影：描述符 + 组合根指标绑定', () => {
  it('未注册任何卡片与绑定时，cards 为空但不报错', () => {
    const system = build()
    const runtime = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
    expect(runtime.cards()).toEqual([])
  })

  it('query 组装描述符与指标值；每次查询重新求值（投影跟随领域状态）', () => {
    const system = build()
    registerCard(system)
    const runtime = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
    let qty = 10
    runtime.bindMetric('todayInboundQty', () => qty)
    expect(runtime.query('inbound-rate')).toEqual({ id: 'inbound-rate', title: '今日入库量', metric: 'todayInboundQty', value: 10 })
    qty = 25
    expect(runtime.query('inbound-rate').value).toBe(25)
  })

  it('未注册的卡片、未绑定指标的卡片均大声报错（与 pc-runtime 同语义）', () => {
    const system = build()
    registerCard(system)
    const runtime = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
    expect(() => runtime.query('nope')).toThrow(/未注册/)
    expect(() => runtime.query('inbound-rate')).toThrow(/未绑定数据源/)
  })

  it('同名重绑即替换指标源（热重载友好）', () => {
    const system = build()
    registerCard(system)
    const runtime = system.getService<DashboardRuntime>(DASHBOARD_RUNTIME)
    runtime.bindMetric('todayInboundQty', () => 'old')
    runtime.bindMetric('todayInboundQty', () => 42)
    expect(runtime.query('inbound-rate').value).toBe(42)
  })
})

describe('作业看板读模型：task/changed 事件喂养', () => {
  const drive = (tasks: TaskServiceView, opId: string) => {
    const created = tasks.create('putaway', {}, opId)
    tasks.assign(created.id, 'PDA-01', `${opId}:assign`)
    tasks.start(created.id, `${opId}:start`)
    tasks.complete(created.id, { ok: true }, `${opId}:complete`)
    return created.id
  }

  it('任务生命周期推进时，任务在列间迁移', () => {
    const system = build()
    system.mount(taskBoardPlugin)
    const board = system.getService<TaskBoard>(DASHBOARD_BOARD)
    const tasks = system.getService<TaskServiceView>(TASK)

    const id = tasks.create('putaway', {}, 'op-1').id
    let columnOf = (status: string) => board.snapshot().columns.find((c) => c.status === status)!
    expect(columnOf('created').taskIds).toEqual([id])

    tasks.assign(id, 'PDA-01', 'op-1:assign')
    expect(columnOf('created').count).toBe(0)
    expect(columnOf('assigned').taskIds).toEqual([id])

    tasks.start(id, 'op-1:start')
    tasks.complete(id, {}, 'op-1:complete')
    expect(columnOf('completed').taskIds).toEqual([id])
    expect(board.snapshot().columns.map((c) => c.count)).toEqual([0, 0, 0, 1, 0])
  })

  it('多个任务各自落列，计数正确', () => {
    const system = build()
    system.mount(taskBoardPlugin)
    const board = system.getService<TaskBoard>(DASHBOARD_BOARD)
    const tasks = system.getService<TaskServiceView>(TASK)
    drive(tasks, 'a')
    drive(tasks, 'b')
    const cancelled = tasks.create('putaway', {}, 'c').id
    tasks.cancel(cancelled, '混放', 'c:cancel')
    const completed = board.snapshot().columns.find((c) => c.status === 'completed')!
    const cancelledCol = board.snapshot().columns.find((c) => c.status === 'cancelled')!
    expect(completed.count).toBe(2)
    expect(cancelledCol.taskIds).toEqual([cancelled])
  })

  it('卸载路径：unmount 后读模型重置，且不再跟随事件（可逆性纪律）', () => {
    const system = build()
    system.mount(taskBoardPlugin)
    const board = system.getService<TaskBoard>(DASHBOARD_BOARD)
    const tasks = system.getService<TaskServiceView>(TASK)
    drive(tasks, 'a')
    expect(board.snapshot().columns.some((c) => c.count > 0)).toBe(true)

    system.unmount('dashboard-task-board')
    expect(board.snapshot().columns.every((c) => c.count === 0 && c.taskIds.length === 0)).toBe(true)
    drive(tasks, 'b') // 卸载后事件不再被喂养
    expect(board.snapshot().columns.every((c) => c.count === 0)).toBe(true)
  })
})
