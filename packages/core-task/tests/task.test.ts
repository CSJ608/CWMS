import { describe, expect, it, vi } from 'vitest'
import { TASK, type TaskChanged } from '@cwms/contracts'
import { coreTaskPlugin, TaskService } from '@cwms/core-task'
import { createSystem, definePlugin } from '@cwms/kernel'

describe('任务机：显式迁移表', () => {
  it('正常生命周期 created → assigned → executing → completed', () => {
    const tasks = new TaskService()
    const id = tasks.create('putaway', { sku: 'S1' }, 'op-1').id
    tasks.assign(id, 'PDA-01', 'op-2')
    tasks.start(id, 'op-3')
    tasks.complete(id, { location: 'A-01' }, 'op-4')
    expect(tasks.get(id).status).toBe('completed')
    expect(tasks.get(id).result).toEqual({ location: 'A-01' })
  })

  it('跳步被拒绝（created 直接到 executing）', () => {
    const tasks = new TaskService()
    const id = tasks.create('putaway', {}, 'op-1').id
    expect(() => tasks.start(id, 'op-2')).toThrow(/created → executing/)
  })

  it('终态拒绝一切新迁移', () => {
    const tasks = new TaskService()
    const id = tasks.create('putaway', {}, 'op-1').id
    tasks.cancel(id, '客户取消', 'op-2')
    expect(() => tasks.assign(id, 'PDA-01', 'op-3')).toThrow(/cancelled → assigned/)
    expect(() => tasks.cancel(id, 'again', 'op-4')).toThrow(/cancelled → cancelled/)
  })

  it('executing 可取消；取消原因记录在案', () => {
    const tasks = new TaskService()
    const id = tasks.create('putaway', {}, 'op-1').id
    tasks.assign(id, 'PDA-01', 'op-2')
    tasks.start(id, 'op-3')
    tasks.cancel(id, '库位被占用', 'op-4')
    expect(tasks.get(id).status).toBe('cancelled')
    expect(tasks.get(id).reason).toBe('库位被占用')
  })
})

describe('任务机：opId 幂等', () => {
  it('同 opId 重放返回当时的快照，不重复执行', () => {
    const tasks = new TaskService()
    const id = tasks.create('putaway', {}, 'op-1').id
    const first = tasks.assign(id, 'PDA-01', 'op-2')
    const replay = tasks.assign(id, 'PDA-99', 'op-2') // 同 opId，worker 参数不同也不生效
    expect(replay).toEqual(first)
    expect(tasks.get(id).worker).toBe('PDA-01')
  })

  it('create 重放不产生第二个任务', () => {
    const tasks = new TaskService()
    const a = tasks.create('putaway', { sku: 'S1' }, 'op-1')
    const b = tasks.create('putaway', { sku: 'S1' }, 'op-1')
    expect(b.id).toBe(a.id)
    expect(tasks.list('putaway')).toHaveLength(1)
  })

  it('opId 跨任务复用立即报错', () => {
    const tasks = new TaskService()
    tasks.create('putaway', {}, 'op-1')
    const other = tasks.create('putaway', {}, 'op-2').id
    expect(() => tasks.assign(other, 'PDA-01', 'op-1')).toThrow(/已被任务 putaway-0001 使用/)
  })

  it('新 opId 重复同一迁移被拒绝（重放保护只有 opId 一条路）', () => {
    const tasks = new TaskService()
    const id = tasks.create('putaway', {}, 'op-1').id
    tasks.assign(id, 'PDA-01', 'op-2')
    expect(() => tasks.assign(id, 'PDA-01', 'op-9')).toThrow(/assigned → assigned/)
  })
})

describe('任务机：事件与查询', () => {
  it('task/changed 记录完整迁移轨迹，重放不重复发事件', () => {
    const tasks = new TaskService()
    const events: TaskChanged[] = []
    tasks.bind((change) => events.push(change))
    const id = tasks.create('putaway', {}, 'op-1').id
    tasks.assign(id, 'PDA-01', 'op-2')
    tasks.start(id, 'op-3')
    tasks.complete(id, {}, 'op-4')
    tasks.complete(id, {}, 'op-4') // 重放
    expect(events.map((e) => `${e.from}→${e.to}`)).toEqual([
      'void→created',
      'created→assigned',
      'assigned→executing',
      'executing→completed',
    ])
    expect(events.every((e) => e.kind === 'putaway' && e.taskId === id)).toBe(true)
  })

  it('list 按 kind 与 status 过滤', () => {
    const tasks = new TaskService()
    const a = tasks.create('putaway', {}, 'op-1').id
    tasks.create('pick', {}, 'op-2')
    tasks.assign(a, 'PDA-01', 'op-3')
    expect(tasks.list('putaway')).toHaveLength(1)
    expect(tasks.list('putaway', 'assigned')).toHaveLength(1)
    expect(tasks.list('putaway', 'created')).toHaveLength(0)
    expect(tasks.list()).toHaveLength(2)
  })
})

describe('任务机：宿主插件', () => {
  it('通过 coreTaskPlugin 挂载到 TASK 服务 key，卸载可逆', () => {
    const system = createSystem()
    system.mount(coreTaskPlugin)
    const tasks = system.getService<TaskService>(TASK)
    expect(tasks.create('putaway', {}, 'op-1').status).toBe('created')
    system.unmount('core-task')
    expect(() => system.getService(TASK)).toThrow(/不存在/)
    system.mount(coreTaskPlugin)
    expect(system.getService<TaskService>(TASK).list()).toHaveLength(0) // 全新实例：可逆
  })

  it('事件接通内核总线', () => {
    const system = createSystem()
    const seen: TaskChanged[] = []
    system.mount(definePlugin({ name: 'probe', apply: (ctx) => ctx.on('task/changed', (c) => seen.push(c)) }))
    system.mount(coreTaskPlugin)
    system.getService<TaskService>(TASK).create('pick', {}, 'op-1')
    expect(seen).toHaveLength(1)
  })
})
