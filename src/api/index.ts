import { request, putBinary, PREVIEW } from './client'
import type {
  AdminAccount,
  AdminAccountInput,
  AdminAccountList,
  AdminAccountStatus,
  AdminAccountStatusInput,
  AdminAsset,
  AdminAssetFilters,
  AdminAssetPage,
  AdminLoginInput,
  AssetResult,
  BatchDeleteInput,
  BatchDeleteResult,
  BatchPreviewInput,
  BatchPreviewResult,
  Category,
  CategoryResult,
  ChangePasswordInput,
  ClaimFilters,
  ClaimPage,
  CreateAssetInput,
  Dashboard,
  DownloadInput,
  DownloadResult,
  DownloadLogFilters,
  DownloadLogPage,
  EmployeeAccount,
  EmployeeAccountFilters,
  EmployeeAccountPage,
  EmployeeAccountStatus,
  EmployeeAccountStatusInput,
  Login,
  OperationLogFilters,
  OperationPage,
  PreviewResult,
  Session,
  Task,
  TaskDetail,
  TaskInput,
  TaskPage,
  TaskResult,
  UploadInput,
  User,
} from './types'

/* ---------------- 认证与身份 ---------------- */
export const authApi = {
  adminLogin: (input: AdminLoginInput) =>
    request<Login>('/auth/admin-login', { method: 'POST', body: input }),

  logout: () => request<void>('/auth/logout', { method: 'POST' }),

  me: () => request<User>('/account/me'),

  /** 修改密码：首次强制改密与主动改密共用；成功返回与正式登录相同的新凭证 */
  changePassword: (input: ChangePasswordInput) =>
    request<Login>('/account/password', { method: 'PUT', body: input }),
}

/* ---------------- 管理子账号（仅超级管理员） ---------------- */
export const accountApi = {
  list: () => request<AdminAccountList>('/admin/accounts'),

  create: (input: AdminAccountInput) =>
    request<AdminAccount>('/admin/accounts', { method: 'POST', body: input }),

  setStatus: (id: string, status: AdminAccountStatus) =>
    request<AdminAccount>(`/admin/accounts/${id}/status`, {
      method: 'PUT',
      body: { status } satisfies AdminAccountStatusInput,
    }),
}

/* ---------------- 员工账号（v2.12.0，管理员可查询与启停） ---------------- */
export const employeeApi = {
  /** 分页查询已建档员工，keyword 匹配工号 / 姓名 / 手机号 / 门店 */
  list: (filters: EmployeeAccountFilters = {}) =>
    request<EmployeeAccountPage>('/admin/employees', {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        keyword: filters.keyword?.trim() || undefined,
        status: filters.status || undefined,
      },
    }),

  detail: (id: string) => request<EmployeeAccount>(`/admin/employees/${id}`),

  /** 启用或停用：停用后该员工的登录态与未过期票据立即失效 */
  setStatus: (id: string, status: EmployeeAccountStatus) =>
    request<EmployeeAccount>(`/admin/employees/${id}/status`, {
      method: 'PUT',
      body: { status } satisfies EmployeeAccountStatusInput,
    }),
}

/* ---------------- 固定分类 ---------------- */
const CATEGORY_CACHE_KEY = 'assethub_categories_v1'
/** 固定分类几乎不变，缓存 24 小时；后端调完分类最多一天自动生效 */
const CATEGORY_CACHE_TTL = 24 * 60 * 60 * 1000

function readCategoryCache(): CategoryResult | null {
  try {
    const raw = localStorage.getItem(CATEGORY_CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; items?: Category[] }
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) return null
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at > CATEGORY_CACHE_TTL) return null
    return { items: parsed.items }
  } catch {
    return null
  }
}

export const categoryApi = {
  /**
   * 固定分类：优先读本地缓存（24 小时），进上传页不用再等一次接口；
   * 传 force 可跳过缓存强制刷新。
   */
  list: async (options: { force?: boolean } = {}): Promise<CategoryResult> => {
    if (!PREVIEW && !options.force) {
      const cached = readCategoryCache()
      if (cached) return cached
    }
    const res = await request<CategoryResult>('/asset-categories')
    try {
      localStorage.setItem(CATEGORY_CACHE_KEY, JSON.stringify({ at: Date.now(), items: res.items }))
    } catch {
      // 浏览器隐私模式禁止写 localStorage，忽略即可
    }
    return res
  },
}

/* ---------------- 素材下载 ---------------- */
/**
 * 后端只有 `POST /api/assets/{id}/download`（只校验登录态、不区分角色），
 * 管理端任务素材内的素材下载也走这里，并会计入下载记录。
 */
export const assetApi = {
  download: (id: string, input: DownloadInput) =>
    request<DownloadResult>(`/assets/${id}/download`, { method: 'POST', body: input }),
}

/* ---------------- 管理员素材管理 ---------------- */

/** 完整素材编号：ZSSJ + 13 位数字（v3.0.0） */
const ASSET_ID_EXACT = /^ZSSJ\d{13}$/i

/**
 * 搜索词恰好是完整素材编号时改用 v3.0.0 的 assetId 精确筛选：
 * 粘一整串编号来找某个素材是最常见的用法，精确参数比 keyword 模糊匹配更可靠
 * （两者是 AND 关系，所以只传其一）。
 */
function assetKeywordQuery(filters: AdminAssetFilters): { keyword?: string; assetId?: string } {
  const keyword = filters.keyword?.trim() ?? ''
  const exact = filters.assetId || (ASSET_ID_EXACT.test(keyword) ? keyword.toUpperCase() : '')
  return exact ? { assetId: exact } : { keyword: keyword || undefined }
}

export const adminAssetApi = {
  list: (filters: AdminAssetFilters = {}) =>
    request<AdminAssetPage>('/admin/assets', {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        ...assetKeywordQuery(filters),
        categoryCode: filters.categoryCode,
        assetType: filters.assetType,
        status: filters.status,
        storageProvider: filters.storageProvider,
      },
    }),

  create: (input: CreateAssetInput) =>
    request<AssetResult>('/admin/assets', { method: 'POST', body: input }),

  detail: (id: string) => request<AdminAsset>(`/admin/assets/${id}`),

  publish: (id: string) =>
    request<AssetResult>(`/admin/assets/${id}/publish`, { method: 'POST', body: {} }),

  offline: (id: string) =>
    request<AssetResult>(`/admin/assets/${id}/offline`, { method: 'POST', body: {} }),

  /**
   * 解包已有任务素材（v2.10.0）：补充 ZIP 内图片、视频为独立子素材，返回带 children 的详情。
   * 幂等：已有子素材直接返回，不重复创建。
   */
  unpack: (id: string) =>
    request<AdminAsset>(`/admin/assets/${id}/unpack`, { method: 'POST', body: {} }),

  /** 管理员预览图片/视频（含草稿与已下架素材） */
  preview: (id: string) =>
    request<PreviewResult>(`/admin/assets/${id}/preview`, { method: 'POST', body: {} }),

  /** 管理员批量申请列表预览票据（含草稿与已下架素材） */
  previews: (assetIds: string[]) =>
    request<BatchPreviewResult>('/admin/assets/previews', {
      method: 'POST',
      body: { assetIds: assetIds.slice(0, 100) } satisfies BatchPreviewInput,
    }),

  /** 删除单个素材及 OSS 文件；已关联任务的素材返回 409 ASSET_IN_USE */
  remove: (id: string) => request<AssetResult>(`/admin/assets/${id}`, { method: 'DELETE' }),

  /** 批量删除（1-100 个）：HTTP 200 也要检查 failedCount 与 items[].error */
  batchDelete: (assetIds: string[]) =>
    request<BatchDeleteResult>('/admin/assets/batch-delete', {
      method: 'POST',
      body: { assetIds: assetIds.slice(0, 100) } satisfies BatchDeleteInput,
    }),
}

/* ---------------- 上传会话 ---------------- */
export const uploadApi = {
  createSession: (input: UploadInput) =>
    request<Session>('/admin/upload-sessions', { method: 'POST', body: input }),

  getSession: (id: string) => request<Session>(`/admin/upload-sessions/${id}`),

  complete: (id: string) =>
    request<Session>(`/admin/upload-sessions/${id}/complete`, { method: 'POST', body: {} }),

  retry: (id: string) =>
    request<Session>(`/admin/upload-sessions/${id}/retry`, { method: 'POST', body: {} }),

  /** 传输素材文件（原始二进制流） */
  putContent: (url: string, file: Blob, onProgress?: (percent: number) => void) =>
    putBinary(url, file, onProgress),
}

/* ---------------- 管理员任务 ---------------- */
export const adminTaskApi = {
  list: (filters: { page?: number; pageSize?: number; keyword?: string } = {}) =>
    request<TaskPage>('/admin/tasks', {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        keyword: filters.keyword,
      },
    }),

  create: (input: TaskInput) =>
    request<TaskResult>('/admin/tasks', { method: 'POST', body: input }),

  detail: (id: string) => request<TaskDetail>(`/admin/tasks/${id}`),

  /**
   * 设置或取消领取截止时间（v2.11.0）：deadlineAt 传 null 表示长期有效。
   * 截止时间须晚于发布时间，可设为过去时间以结束历史任务。
   */
  setDeadline: (id: string, deadlineAt: string | null) =>
    request<Task>(`/admin/tasks/${id}/deadline`, { method: 'PUT', body: { deadlineAt } }),

  claims: (id: string, filters: ClaimFilters = {}) =>
    request<ClaimPage>(`/admin/tasks/${id}/claims`, {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        keyword: filters.keyword,
      },
    }),
}

/* ---------------- 数据大屏 ---------------- */
export const dashboardApi = {
  get: () => request<Dashboard>('/admin/dashboard'),
}

/* ---------------- 日志 ---------------- */
export const logApi = {
  downloads: (filters: DownloadLogFilters = {}) =>
    request<DownloadLogPage>('/admin/download-logs', {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        userId: filters.userId,
        assetId: filters.assetId,
        storageProvider: filters.storageProvider,
        from: filters.from,
        to: filters.to,
      },
    }),

  operations: (filters: OperationLogFilters = {}) =>
    request<OperationPage>('/admin/operation-logs', {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        operatorId: filters.operatorId,
        action: filters.action,
        targetType: filters.targetType,
        targetId: filters.targetId,
        storageProvider: filters.storageProvider,
        result: filters.result,
        from: filters.from,
        to: filters.to,
      },
    }),
}

export type {
  AdminAsset,
  Asset,
  CategoryResult,
  Dashboard,
  DownloadLog,
  Operation,
  Session,
  Task,
  TaskDetail,
  User,
} from './types'
