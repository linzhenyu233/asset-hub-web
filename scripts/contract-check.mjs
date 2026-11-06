/**
 * 前后端契约静态检查（不需要后端在线）。
 *
 * 数据来源：docs/openapi.json（后端导出的 OpenAPI 3.0.3）+ 前端源码
 * 四类检查：
 *   1) 前端调用的 path + method 是否在规范里存在
 *   2) query 参数名是否是后端认识的
 *   3) 请求体类型（types.ts 的 interface）字段是否与 schema 完全对齐（多余字段会被 400 拒绝）
 *   4) 页面里写死的枚举值（<option value="XXX">）是否是后端认可的枚举
 *
 * 用法：node scripts/contract-check.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const spec = JSON.parse(readFileSync(join(ROOT, 'docs/openapi.json'), 'utf8'))

const problems = []
const warnings = []
const add = (list, kind, detail) => list.push({ kind, detail })

function readText(path) {
  return readFileSync(path, 'utf8')
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(ts|vue)$/.test(name)) out.push(full)
  }
  return out
}

/* ---------- 1 & 2：api/index.ts 的调用点 ---------- */

const apiIndex = readText(join(ROOT, 'src/api/index.ts'))

// request<T>('/path', { method: 'POST', query: {...}, body: ... })
const callRe = /request<[^>]*>\(\s*(`[^`]*`|'[^']*')\s*,\s*(\{[\s\S]{0,400}?\})\s*\)/g
const calls = []
for (const m of apiIndex.matchAll(callRe)) {
  const raw = m[1].slice(1, -1).replace(/\$\{[^}]+\}/g, '{id}')
  const opts = m[2]
  const method = (opts.match(/method:\s*'([A-Z]+)'/) || [, 'GET'])[1]
  const queryBlock = opts.match(/query:\s*\{([\s\S]*?)\n\s*\}/)
  const queryKeys = queryBlock
    ? [...queryBlock[1].matchAll(/^\s*([A-Za-z0-9_]+):/gm)].map((q) => q[1])
    : []
  calls.push({ method, path: `/api${raw}`, queryKeys })
}

const specPaths = spec.paths
for (const call of calls) {
  const item = specPaths[call.path]
  if (!item) {
    add(problems, 'PATH_NOT_IN_SPEC', `${call.method} ${call.path}`)
    continue
  }
  const op = item[call.method.toLowerCase()]
  if (!op) {
    add(problems, 'METHOD_NOT_IN_SPEC', `${call.method} ${call.path}`)
    continue
  }
  const allowedQuery = new Set(
    (op.parameters || []).filter((p) => p.in === 'query').map((p) => p.name),
  )
  for (const key of call.queryKeys) {
    if (!allowedQuery.has(key)) add(problems, 'QUERY_NOT_IN_SPEC', `${call.method} ${call.path} -> ${key}`)
  }
}

/* ---------- 3：types.ts 请求体 interface 与 schema 对齐 ---------- */

const typesSrc = readText(join(ROOT, 'src/api/types.ts'))
const interfaces = new Map()
for (const m of typesSrc.matchAll(/export interface (\w+) \{([\s\S]*?)\n\}/g)) {
  const fields = [...m[2].matchAll(/^\s{2}([A-Za-z0-9_]+)(\??):/gm)].map((f) => ({
    name: f[1],
    optional: f[2] === '?',
  }))
  interfaces.set(m[1], fields)
}

/** 请求体类型 → OpenAPI：path + method */
const bodyTypes = [
  ['AdminLoginInput', '/api/auth/admin-login', 'post'],
  ['EmployeeLoginInput', '/api/auth/employee-login', 'post'],
  ['ChangePasswordInput', '/api/account/password', 'put'],
  ['AdminAccountInput', '/api/admin/accounts', 'post'],
  ['AdminAccountStatusInput', '/api/admin/accounts/{id}/status', 'put'],
  ['CreateAssetInput', '/api/admin/assets', 'post'],
  ['UploadInput', '/api/admin/upload-sessions', 'post'],
  ['TaskInput', '/api/admin/tasks', 'post'],
  ['DownloadInput', '/api/assets/{id}/download', 'post'],
  ['BatchDeleteInput', '/api/admin/assets/batch-delete', 'post'],
  ['BatchPreviewInput', '/api/admin/assets/previews', 'post'],
]

/**
 * 类型是否真的被前端使用。没人调用的类型（如只属于员工端的请求体）不参与对账，
 * 否则会把「前端本来就不该调这个接口」误报成契约问题。
 */
const srcFilesCache = []
function typeIsReferenced(typeName) {
  if (!srcFilesCache.length) srcFilesCache.push(...walk(join(ROOT, 'src')))
  const re = new RegExp(`\\b${typeName}\\b`)
  return srcFilesCache
    .filter((file) => !file.replace(/\\/g, '/').endsWith('/api/types.ts'))
    .some((file) => re.test(readText(file)))
}

function resolveSchema(schema, depth = 0) {
  if (!schema || depth > 5) return schema
  if (schema.$ref) {
    const path = schema.$ref.replace('#/', '').split('/')
    let node = spec
    for (const seg of path) node = node?.[seg]
    return resolveSchema(node, depth + 1)
  }
  return schema
}

for (const [typeName, path, method] of bodyTypes) {
  if (!typeIsReferenced(typeName)) continue
  const fields = interfaces.get(typeName)
  const op = specPaths[path]?.[method]
  if (!fields || !op) {
    add(problems, 'CHECK_INPUT_MISSING', `${typeName} -> ${method.toUpperCase()} ${path}`)
    continue
  }
  const schema = resolveSchema(op.requestBody?.content?.['application/json']?.schema) || {}
  const props = Object.keys(schema.properties || {})
  const required = schema.required || []
  const names = new Set(fields.map((f) => f.name))

  for (const name of names) {
    if (props.length && !props.includes(name)) {
      add(problems, 'BODY_FIELD_UNKNOWN', `${typeName}.${name} 不在 ${method.toUpperCase()} ${path} 的 schema 中（后端拒绝未知字段）`)
    }
  }
  for (const name of required) {
    if (!names.has(name)) {
      add(problems, 'BODY_FIELD_MISSING', `${typeName} 缺少必填字段 ${name}（${method.toUpperCase()} ${path}）`)
    }
  }
}

/* ---------- 4：页面里写死的枚举值 ---------- */

const enumValues = new Set()
/** 规范里出现过的所有字符串，用于兜底（后端部分枚举只写在描述里，没有 enum 列表） */
const knownStrings = new Set()
;(function collectEnums(node) {
  if (typeof node === 'string') {
    knownStrings.add(node)
    return
  }
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node)) {
    node.forEach(collectEnums)
    return
  }
  if (Array.isArray(node.enum)) node.enum.forEach((v) => enumValues.add(String(v)))
  for (const value of Object.values(node)) collectEnums(value)
})(spec)

const isKnown = (value) =>
  enumValues.has(value) ||
  [...knownStrings].some((text) => new RegExp(`\\b${value}\\b`).test(text))

const files = walk(join(ROOT, 'src'))
for (const file of files) {
  const text = readText(file)
  for (const m of text.matchAll(/<option value="([A-Z][A-Z0-9_]{2,})"/g)) {
    const value = m[1]
    if (!isKnown(value)) {
      add(problems, 'ENUM_VALUE_UNKNOWN', `${relative(ROOT, file)} -> option value="${value}"`)
    }
  }
  // 页面里以常量数组出现的筛选值（如 claimOptions）
  for (const m of text.matchAll(/\{\s*value:\s*'([A-Z][A-Z0-9_]{2,})',\s*label:/g)) {
    const value = m[1]
    if (!isKnown(value)) {
      add(problems, 'ENUM_VALUE_UNKNOWN', `${relative(ROOT, file)} -> 选项 value '${value}'`)
    }
  }
}

/* ---------- 输出 ---------- */

const group = (list, key) => {
  const map = new Map()
  for (const item of list) {
    if (!map.has(item.kind)) map.set(item.kind, [])
    map.get(item.kind).push(item.detail)
  }
  return map
}

const checkedBodyTypes = bodyTypes.filter(([typeName]) => typeIsReferenced(typeName)).length
console.log(`检查了 ${calls.length} 个调用点、${checkedBodyTypes} 个请求体类型、${files.length} 个前端文件`)
console.log(`规范版本 ${spec.info.version}\n`)

for (const [kind, details] of group(problems, 'problems')) {
  console.log(`[${kind}] ${details.length}`)
  for (const d of details) console.log(`  - ${d}`)
}
for (const [kind, details] of group(warnings, 'warnings')) {
  console.log(`[warn ${kind}] ${details.length}`)
  for (const d of details) console.log(`  - ${d}`)
}
console.log(`\n问题合计 ${problems.length}，告警 ${warnings.length}`)
process.exitCode = problems.length > 0 ? 1 : 0
