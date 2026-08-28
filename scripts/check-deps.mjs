#!/usr/bin/env node
/**
 * 依赖方向守卫（ADR-0003 铁律的 CI 化，ADR-0008）。
 *
 * 角色 → 允许的 @cwms 依赖：
 *   packages/kernel            （内核机制）      → 不准依赖任何 @cwms/* 包
 *   packages/contracts         （契约词汇表）    → 只准 @cwms/kernel
 *   packages/core-*            （内核基础设施）  → 只准 contracts + kernel
 *   packages/plugins/*         （策略与校验缝）  → 只准 contracts + kernel
 *   packages/features/*        （功能纵切片）    → 只准 contracts + kernel
 *   apps/*                     （组合根）        → 豁免（组装系统是它的职责）
 *
 * 检查两处：
 *   1. package.json 的 dependencies（声明图）
 *   2. src 下全部 .ts 的 import 语句（实际图）；相对导入不得越出包根
 * tests/ 豁免——测试组合真实提供者是正当行为。
 *
 * 违规即退出码 1，并逐条打印 文件:行号。
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, relative, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const ALLOW_BASE = new Set(['@cwms/contracts', '@cwms/kernel'])
const violations = []

function* walkTs(dir) {
  if (!existsSync(dir)) return
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walkTs(full)
    else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) yield full
  }
}

function roleOf(relDir) {
  if (relDir === 'packages/kernel') return 'kernel'
  if (relDir === 'packages/contracts') return 'contracts'
  if (/^packages\/core-/.test(relDir)) return 'core'
  if (/^packages\/(plugins|features)\//.test(relDir)) return 'plugin'
  if (/^apps\//.test(relDir)) return 'app'
  return null
}

function allowedDeps(role) {
  if (role === 'kernel') return new Set()
  if (role === 'contracts') return new Set(['@cwms/kernel'])
  if (role === 'core' || role === 'plugin') return ALLOW_BASE
  return null // app：豁免
}

// 发现所有包
const packages = []
for (const top of ['packages', 'apps']) {
  const topDir = join(root, top)
  if (!existsSync(topDir)) continue
  for (const entry of readdirSync(topDir)) {
    const dir = join(topDir, entry)
    const rel = relative(root, dir).replaceAll('\\', '/')
    if (roleOf(rel) === 'kernel' || roleOf(rel) === 'contracts' || roleOf(rel) === 'core') {
      packages.push({ dir, rel })
      continue
    }
    if (existsSync(join(dir, 'package.json'))) {
      packages.push({ dir, rel })
      continue
    }
    // 分组目录（plugins/、features/）再进一层
    if (statSync(dir).isDirectory()) {
      for (const sub of readdirSync(dir)) {
        const subDir = join(dir, sub)
        if (existsSync(join(subDir, 'package.json'))) {
          packages.push({ dir: subDir, rel: relative(root, subDir).replaceAll('\\', '/') })
        }
      }
    }
  }
}

for (const { dir, rel } of packages) {
  const role = roleOf(rel)
  if (!role || role === 'app') continue
  const allowed = allowedDeps(role)
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const declared = Object.keys(pkg.dependencies ?? {}).filter((d) => d.startsWith('@cwms/'))

  // 1) 声明图
  for (const dep of declared) {
    if (!allowed.has(dep)) {
      violations.push(`${rel}/package.json: [${role}] 依赖了 ${dep}——角色只准依赖 ${[...allowed].join('、') || '（无）'}`)
    }
  }

  // 2) 实际图（src/ 的 import）
  const srcDir = join(dir, 'src')
  for (const file of walkTs(srcDir)) {
    const code = readFileSync(file, 'utf8')
    const lines = code.split('\n')
    lines.forEach((line, i) => {
      const m = line.match(/from\s+['"]([^'"]+)['"]/) ?? line.match(/^import\s+['"]([^'"]+)['"]/)
      if (!m) return
      const spec = m[1]
      if (spec.startsWith('@cwms/')) {
        if (!allowed.has(spec)) {
          violations.push(
            `${relative(root, file)}:${i + 1}: [${role}] import 了 ${spec}——角色只准 import ${[...allowed].join('、') || '（无）'}`,
          )
        }
      } else if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec)
        if (!target.startsWith(dir)) {
          violations.push(`${relative(root, file)}:${i + 1}: 相对导入越出包根 → ${spec}（跨包只准走 @cwms 包名）`)
        }
      }
    })
  }
}

if (violations.length > 0) {
  console.error(`依赖方向守卫：发现 ${violations.length} 处违规（ADR-0003）\n`)
  for (const v of violations) console.error(`  ✗ ${v}`)
  process.exit(1)
}
console.log(`依赖方向守卫：${packages.length} 个包全部合规（ADR-0003）`)
