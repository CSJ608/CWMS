import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  configField,
  createSystem,
  defineConfigSchema,
  definePlugin,
  resolveConfig,
  type Plugin,
} from '@cwms/kernel'

const schema = defineConfigSchema({
  threshold: configField.int(100, { min: 1 }),
  mode: configField.string('standard'),
  enabled: configField.bool(false),
  fastZones: configField.stringArray(['A']),
  zonePriority: configField.recordOfInt({ A: 1, B: 2, C: 3 }),
})

describe('配置解析：简单场景免费（ADR-0002/0007）', () => {
  it('零配置返回全默认', () => {
    expect(resolveConfig(schema)).toEqual({
      threshold: 100,
      mode: 'standard',
      enabled: false,
      fastZones: ['A'],
      zonePriority: { A: 1, B: 2, C: 3 },
    })
  })

  it('record 深合并：只加一个键，缺省表保留', () => {
    const resolved = resolveConfig(schema, { zonePriority: { S: 0 } })
    expect(resolved.zonePriority).toEqual({ A: 1, B: 2, C: 3, S: 0 })
    expect(resolved.mode).toBe('standard') // 未触碰的字段保持默认
  })

  it('标量与数组整体替换', () => {
    const resolved = resolveConfig(schema, { mode: 'cold', fastZones: ['S', 'C'], threshold: 5 })
    expect(resolved.mode).toBe('cold')
    expect(resolved.fastZones).toEqual(['S', 'C'])
    expect(resolved.zonePriority).toEqual({ A: 1, B: 2, C: 3 })
  })

  it('未知配置项报错而不是静默失效（配置预算制）', () => {
    try {
      resolveConfig(schema, { zonePriorty: { S: 0 } }) // 拼写错误
      expect.unreachable('应当抛出 ConfigError')
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError)
      expect((error as ConfigError).violations.some((v) => v.includes('zonePriorty'))).toBe(true)
    }
  })

  it('约束与类型违约一起聚合报出', () => {
    try {
      resolveConfig(schema, { threshold: 0, mode: 42, enabled: 'yes', fastZones: 'A', zonePriority: { S: 'x' } })
      expect.unreachable('应当抛出 ConfigError')
    } catch (error) {
      const violations = (error as ConfigError).violations
      expect(violations).toHaveLength(5)
      expect(violations).toEqual([
        'threshold: 不能小于 1',
        'mode: 必须是字符串',
        'enabled: 必须是布尔值',
        'fastZones: 必须是字符串数组',
        'zonePriority.S: 必须是整数',
      ])
    }
  })
})

describe('配置解析：mount 集成（框架级设施）', () => {
  interface ZoneConfig {
    zonePriority: Record<string, number>
  }

  function zonePluginWithCaptured() {
    const seen: ZoneConfig[] = []
    const plugin: Plugin<ZoneConfig> = definePlugin<ZoneConfig>({
      name: 'zone',
      configSchema: defineConfigSchema<ZoneConfig>({
        zonePriority: configField.recordOfInt({ A: 1, B: 2 }),
      }),
      apply: (_ctx, config) => seen.push(config),
    })
    return { plugin, seen }
  }

  it('schema 插件零配置挂载，apply 收到解析后的完整默认', () => {
    const system = createSystem()
    const { plugin, seen } = zonePluginWithCaptured()
    system.mount(plugin)
    expect(seen).toEqual([{ zonePriority: { A: 1, B: 2 } }])
  })

  it('带 overlay 挂载，深合并后交付；reload 新配置非法时旧实例不受影响（原子 reload）', () => {
    const system = createSystem()
    const { plugin, seen } = zonePluginWithCaptured()
    system.mount(plugin, { zonePriority: { S: 0 } })
    expect(seen).toEqual([{ zonePriority: { A: 1, B: 2, S: 0 } }])
    const bad = { zonePriorty: {} } as Record<string, unknown> // 拼写错误
    expect(() => system.reload(plugin, bad as Partial<ZoneConfig>)).toThrow(ConfigError)
    expect(system.isMounted('zone')).toBe(true) // 旧实例仍在岗
    expect(seen).toHaveLength(1)
  })

  it('无 schema 插件保持透传（向后兼容）', () => {
    const system = createSystem()
    const seen: unknown[] = []
    system.mount(
      definePlugin<Record<string, unknown>>({
        name: 'raw',
        apply: (_ctx, config) => seen.push(config),
      }),
      { anything: [1, 2, 3] },
    )
    expect(seen).toEqual([{ anything: [1, 2, 3] }])
  })
})
