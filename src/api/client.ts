import type { ApiErrorBody } from './types'
import { mockRequest } from '../mock'

/**
 * 预览模式：登录接口尚未部署时使用内置演示数据，跳过登录。
 * 开发环境默认开启，生产构建默认关闭——漏配环境变量的线上包不能变成演示后台
 * （演示模式下登录是本地明文比对、写入只落内存）。两种情况都可用 VITE_PREVIEW 覆盖。
 */
export const PREVIEW =
  String(import.meta.env.VITE_PREVIEW ?? (import.meta.env.DEV ? 'true' : 'false')) !== 'false'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const RAW_BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() || ''

/** API 根地址。默认 /api（开发环境由 Vite 代理转发到后端）。 */
export const API_BASE = (RAW_BASE || '/api').replace(/\/+$/, '')

/** API 源站，用于拼接后端返回的相对地址（如下载票据 /api/files/{ticket}）。 */
export const API_ORIGIN = /^https?:\/\//i.test(API_BASE)
  ? new URL(API_BASE).origin
  : window.location.origin

/** 后端要求先改密时广播的事件名（403 PASSWORD_CHANGE_REQUIRED）。 */
export const PASSWORD_REQUIRED_EVENT = 'assethub:password-required'

/** 登录态被撤销或过期（业务接口返回 401）时广播的事件名。 */
export const SESSION_EXPIRED_EVENT = 'assethub:session-expired'

export class ApiError extends Error {
  readonly code: string
  readonly status: number

  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

let authToken: string | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
  if (token) localStorage.setItem('assethub_token', token)
  else localStorage.removeItem('assethub_token')
}

export function getAuthToken(): string | null {
  if (authToken) return authToken
  authToken = localStorage.getItem('assethub_token')
  return authToken
}

type QueryValue = string | number | boolean | null | undefined

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  query?: Record<string, QueryValue>
  body?: unknown
  headers?: Record<string, string>
  /** 默认 true，携带 assethub_session Cookie */
  credentials?: RequestCredentials
}

export function buildQuery(query?: Record<string, QueryValue>): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.append(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json', ...extra }
  const token = getAuthToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

/**
 * 会话被撤销或过期：清掉 localStorage 里的 Bearer token 并广播。
 * 不清 token 的话它会一直挂在后续每个请求上；不广播则页面只显示一句错误，停在打不开的页面上。
 */
function handleUnauthorized(): void {
  setAuthToken(null)
  window.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT))
}

async function parseError(res: Response): Promise<ApiError> {
  let code = `HTTP_${res.status}`
  let message = `请求失败（${res.status}）`
  try {
    const body = (await res.json()) as ApiErrorBody
    if (body?.error?.code) code = body.error.code
    if (body?.error?.message) message = body.error.message
  } catch {
    // 非 JSON 错误体，保留默认文案
  }
  if (res.status === 401) {
    message = message || '登录状态已失效，请重新登录'
    handleUnauthorized()
  }
  // 员工未改初始密码时后端会拒绝业务接口，通知应用弹出强制改密
  if (res.status === 403 && code === 'PASSWORD_CHANGE_REQUIRED') {
    window.dispatchEvent(new CustomEvent(PASSWORD_REQUIRED_EVENT))
  }
  return new ApiError(message, code, res.status)
}

/** 单个请求的超时（毫秒）：避免后端卡住时页面一直转圈没有任何反馈 */
const REQUEST_TIMEOUT = 20_000

/** 统一请求方法。成功返回 JSON（204 返回 undefined）。 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, headers, credentials = 'include' } = options

  if (PREVIEW) {
    await sleep(240)
    return mockRequest<T>(path, { method, query, body })
  }

  const finalHeaders = buildHeaders(headers)
  let payload: BodyInit | undefined

  if (body !== undefined) {
    if (body instanceof FormData || body instanceof Blob) {
      payload = body
    } else {
      finalHeaders['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
  }

  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}${buildQuery(query)}`, {
      method,
      headers: finalHeaders,
      body: payload,
      credentials,
      signal: controller.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(`请求超时（${REQUEST_TIMEOUT / 1000} 秒），请稍后重试`, 'TIMEOUT', 0)
    }
    throw new ApiError('网络异常，无法连接服务器', 'NETWORK_ERROR', 0)
  } finally {
    window.clearTimeout(timer)
  }

  if (res.status === 204) return undefined as T

  if (!res.ok) throw await parseError(res)

  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return (await res.json()) as T
  return (await res.text()) as unknown as T
}

/** 当前 API 根的路径部分（不含结尾斜杠）：`/api`，或直连时的 `/go/api` */
const API_PATH = (/^https?:\/\//i.test(API_BASE) ? new URL(API_BASE).pathname : API_BASE).replace(
  /\/+$/,
  '',
)
/** API 根里 `/api` 之前的部署前缀：`''` 或 `/go`（后端 APP_BASE_PATH） */
const API_PREFIX = API_PATH.replace(/\/api$/, '')

/**
 * 把后端返回的地址对齐到当前配置的 API 前缀。
 *
 * 后端返回的票据/上传地址会带部署前缀（如 `/go/api/previews/xxx`）：
 * - 前端走 `/api` 代理（API_PREFIX 为空）→ 剥掉 `/go`，避免 `/api/go/api` 双前缀
 * - 前端直连 `/go/api`（API_PREFIX 为 `/go`）→ 保留 `/go`，否则会打到没有代理的路径
 */
function alignBackendPath(path: string): string {
  const matched = path.match(/^(.*?)(\/api(?:\/.*)?)$/i)
  if (!matched) return path
  return `${API_PREFIX}${matched[2]}`
}

/**
 * 把上传会话返回的 transfer.url / 下载票据 url 转成可直接请求的绝对地址。
 * 支持三种形态：绝对 URL、/api/... 源站路径、相对 API 根路径。
 */
export function resolveApiUrl(path: string): string {
  if (!path) return path
  if (/^(https?:\/\/|data:|blob:)/i.test(path)) return path
  const absolutePath = path.startsWith('/') ? path : `/${path}`
  // 不含 /api 段的相对地址，仍按 API 根拼接
  if (!/\/api(?:\/|$)/i.test(absolutePath)) return `${API_BASE}${absolutePath}`
  return `${API_ORIGIN}${alignBackendPath(absolutePath)}`
}

/** 下载 / 预览票据地址（后端返回 /api/files/{ticket}、/api/previews/{ticket}）。 */
export function resolveFileUrl(path: string): string {
  if (!path) return path
  if (/^(https?:\/\/|data:|blob:)/i.test(path)) return path
  const absolutePath = path.startsWith('/') ? path : `/${path}`
  return `${API_ORIGIN}${alignBackendPath(absolutePath)}`
}

/** 二进制上传（支持进度回调，便于展示上传百分比）。 */
export function putBinary(
  url: string,
  file: Blob,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const absolute = resolveApiUrl(url)

  if (PREVIEW) {
    return (async () => {
      for (const value of [18, 42, 67, 88, 100]) {
        await sleep(160)
        onProgress?.(value)
      }
    })()
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', absolute, true)
    xhr.withCredentials = true
    xhr.setRequestHeader('Content-Type', 'application/octet-stream')

    const token = getAuthToken()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100)
        resolve()
        return
      }
      let code = `HTTP_${xhr.status}`
      let message = `文件上传失败（${xhr.status}）`
      try {
        const parsed = JSON.parse(xhr.responseText) as ApiErrorBody
        if (parsed?.error?.code) code = parsed.error.code
        if (parsed?.error?.message) message = parsed.error.message
      } catch {
        // 忽略非 JSON 响应（如 nginx 的 HTML 错误页）
      }
      if (code === `HTTP_${xhr.status}`) {
        if (xhr.status === 413) {
          message = '文件超过服务端允许的上传体积，请压缩后重试或联系管理员调整限制'
        } else if (xhr.status === 502 || xhr.status === 504) {
          message = `文件传输被网关中断（${xhr.status}）：常见原因是文件过大导致超时或后端处理中断，请压缩文件后重试`
        }
      }
      // 上传途中会话被撤销也要走统一登出，否则大文件传完才发现白传
      if (xhr.status === 401) handleUnauthorized()
      reject(new ApiError(message, code, xhr.status))
    }

    xhr.onerror = () => reject(new ApiError('文件上传网络异常，请重试', 'NETWORK_ERROR', 0))
    xhr.onabort = () => reject(new ApiError('上传已取消', 'ABORTED', 0))
    xhr.send(file)
  })
}

/** 触发浏览器下载（票据为短时地址，直接导航由浏览器保存文件）。 */
export function triggerDownload(url: string, filename?: string): void {
  if (PREVIEW) {
    // 预览模式没有真实文件，生成一个占位文本，验证下载交互链路
    const blob = new Blob(
      [`预览模式演示文件\n文件名：${filename || '素材'}\n接入后端并关闭 VITE_PREVIEW 后即可下载真实文件。`],
      { type: 'text/plain;charset=utf-8' },
    )
    const objectUrl = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filename || 'preview.txt'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(objectUrl)
    return
  }

  const anchor = document.createElement('a')
  anchor.href = resolveFileUrl(url)
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
