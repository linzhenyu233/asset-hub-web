import { request, putBinary } from './client'
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
  Login,
  OperationLogFilters,
  OperationPage,
  PreviewResult,
  Session,
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

/* ---------------- 固定分类 ---------------- */
export const categoryApi = {
  list: () => request<CategoryResult>('/asset-categories'),
}

/* ---------------- 素材下载 ---------------- */
/**
 * 后端只有 `POST /api/assets/{id}/download`（只校验登录态、不区分角色），
 * 管理端活动包内的素材下载也走这里，并会计入下载记录。
 */
export const assetApi = {
  download: (id: string, input: DownloadInput) =>
    request<DownloadResult>(`/assets/${id}/download`, { method: 'POST', body: input }),
}

/* ---------------- 管理员素材管理 ---------------- */
export const adminAssetApi = {
  list: (filters: AdminAssetFilters = {}) =>
    request<AdminAssetPage>('/admin/assets', {
      query: {
        page: filters.page ?? 1,
        pageSize: filters.pageSize ?? 20,
        keyword: filters.keyword,
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
