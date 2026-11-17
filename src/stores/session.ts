import { computed, reactive } from 'vue'
import { authApi } from '../api'
import { PREVIEW, setAuthToken } from '../api/client'
import { findMockAccount } from '../mock/accounts'
import type { User } from '../api/types'

interface SessionState {
  user: User | null
  ready: boolean
  loading: boolean
}

const PREVIEW_USER_KEY = 'assethub_preview_user'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function readPreviewUser(): User | null {
  const raw = localStorage.getItem(PREVIEW_USER_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as User
    if (
      parsed &&
      typeof parsed.userId === 'string' &&
      (parsed.role === 'ADMIN' || parsed.role === 'EMPLOYEE' || parsed.role === 'REVIEW')
    ) {
      return parsed
    }
  } catch {
    // 损坏的本地登录态，直接丢弃
  }
  return null
}

function persistPreviewUser(user: User | null): void {
  if (user) localStorage.setItem(PREVIEW_USER_KEY, JSON.stringify(user))
  else localStorage.removeItem(PREVIEW_USER_KEY)
}

const state = reactive<SessionState>({
  user: null,
  ready: false,
  loading: false,
})

const isAdmin = computed(() => state.user?.role === 'ADMIN')
const isAuthenticated = computed(() => state.user !== null)
/** 只有唯一超级管理员可以管理子账号 */
const isSuperAdmin = computed(() => state.user?.isSuperAdmin === true)
/** 账号首次登录必须先改初始密码，期间业务接口返回 403 */
const mustChangePassword = computed(() => state.user?.mustChangePassword === true)

/** 应用启动时恢复会话（预览模式读取本地演示身份，正式模式读取 Cookie / Token）。 */
async function loadSession(): Promise<void> {
  if (PREVIEW) {
    state.user = readPreviewUser()
    state.ready = true
    return
  }
  if (state.ready) return

  state.loading = true
  try {
    state.user = await authApi.me()
  } catch {
    state.user = null
    setAuthToken(null)
  } finally {
    state.loading = false
    state.ready = true
  }
}

/**
 * 管理员登录（预览模式按本地账号目录校验）：
 * - 账号不存在或密码错误 → 账号或密码不正确
 * - 账号存在但不是管理员 → 明确提示无管理员权限
 */
async function loginAdmin(username: string, password: string): Promise<User> {
  if (PREVIEW) {
    await delay(320)
    const account = findMockAccount(username)
    if (!account) throw new Error('账号不存在，请联系超级管理员添加账号')
    if (account.password !== password) throw new Error('密码不正确，请重新输入')
    if (account.user.role !== 'ADMIN') {
      throw new Error('该账号没有管理员权限')
    }

    state.user = { ...account.user }
    persistPreviewUser(state.user)
    state.ready = true
    return state.user
  }

  const res = await authApi.adminLogin({ username, password })
  if (res.token) setAuthToken(res.token)
  state.user = res.user
  state.ready = true
  return res.user
}

/**
 * 修改自己的密码（首次强制改密与主动改密共用）。
 * 成功后后端会作废旧凭证并返回新凭证，这里同步替换本地登录态。
 */
async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  if (PREVIEW) {
    await delay(320)
    if (!state.user) throw new Error('登录状态已失效，请重新登录')
    state.user = { ...state.user, mustChangePassword: false }
    persistPreviewUser(state.user)
    return
  }

  const res = await authApi.changePassword({ oldPassword, newPassword })
  if (res.token) setAuthToken(res.token)
  state.user = res.user
  state.ready = true
}

/** 业务接口返回 PASSWORD_CHANGE_REQUIRED 时，把当前身份标记为待改密。 */
function markPasswordRequired(): void {
  if (!state.user || state.user.mustChangePassword) return
  state.user = { ...state.user, mustChangePassword: true }
  persistPreviewUser(state.user)
}

/**
 * 业务接口返回 401（会话撤销/过期）时清掉本地身份。
 * 必须真的清空 state.user：否则路由守卫会把已登录用户从 /login 弹回 /admin，
 * 每弹一次又发一轮请求，变成 401 循环。
 */
function clearSession(): void {
  setAuthToken(null)
  persistPreviewUser(null)
  state.user = null
  state.ready = true
}

async function logout(): Promise<void> {
  if (PREVIEW) {
    persistPreviewUser(null)
    state.user = null
    state.ready = true
    return
  }
  try {
    await authApi.logout()
  } finally {
    setAuthToken(null)
    state.user = null
    state.ready = true
  }
}

export function useSession() {
  return {
    state,
    isAdmin,
    isAuthenticated,
    isSuperAdmin,
    mustChangePassword,
    isPreview: PREVIEW,
    loadSession,
    loginAdmin,
    logout,
    changePassword,
    markPasswordRequired,
    clearSession,
  }
}
