// 类型定义严格对应「图片视频素材中台 API」v2.9.0 OpenAPI 规范（40 个业务接口 + 1 个预览 HEAD）

export type AssetType = 'IMAGE' | 'VIDEO' | 'ARCHIVE'
export type CategoryCode = 'IMAGE' | 'VIDEO' | 'COMPANY' | 'CAMPAIGN'
export type AssetStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
/** 后端只有 OSS 一种存储（DINGDRIVE 已下线） */
export type StorageProvider = 'OSS'
export type Role = 'ADMIN' | 'EMPLOYEE'
export type SessionStatus = 'INIT' | 'UPLOADING' | 'FILE_READY' | 'COMMITTED' | 'FAILED'
export type UploadPurpose = 'MATERIAL' | 'TASK_PACKAGE'
export type OperationAction =
  | 'UPLOAD'
  | 'PUBLISH'
  | 'OFFLINE'
  | 'DELETE'
  | 'TASK_PUBLISH'
  | 'ACCOUNT_CREATE'
  | 'ACCOUNT_STATUS'
export type OperationResult = 'SUCCESS' | 'FAILED'
export type AdminAccountStatus = 'ACTIVE' | 'DISABLED'

export interface User {
  id: string
  displayName: string | null
  phone: string | null
  role: Role
  storeId: string | null
  storeName: string | null
  username: string | null
  /** 是否为唯一超级管理员（只有超管可创建管理子账号） */
  isSuperAdmin?: boolean
  /** 员工是否必须先修改初始密码；管理员恒为 false */
  mustChangePassword?: boolean
}

export interface Login {
  mode: 'FORMAL'
  token?: string
  expiresAt: string
  user: User
}

export interface AdminLoginInput {
  username: string
  password: string
}

/** 修改密码：首次强制改密与主动改密共用，不接受用户 ID */
export interface ChangePasswordInput {
  /** 当前密码；首次改密时为工号重复两次 */
  oldPassword: string
  /** 新密码：10-72 字节，需同时包含字母和数字，且不得与当前密码相同 */
  newPassword: string
}

/* ---------------- 管理子账号（仅超级管理员） ---------------- */

export interface AdminAccount {
  id: string
  username: string
  displayName: string
  status: AdminAccountStatus
  createdAt: string
}

export interface AdminAccountList {
  items: AdminAccount[]
}

export interface AdminAccountInput {
  username: string
  displayName: string
  password: string
}

export interface AdminAccountStatusInput {
  status: AdminAccountStatus
}

/* ---------------- 在线预览 ---------------- */

export interface PreviewResult {
  /** 短时预览票据相对地址，可直接用于 img / video 的 src */
  url: string
  expiresAt: string
  filename: string
  mimeType: string
  fileSize: number
}

/** 批量预览：一页列表的素材 ID（1-100 个，后端去重） */
export interface BatchPreviewInput {
  assetIds: string[]
}

export interface BatchPreviewSuccess extends PreviewResult {
  assetId: string
}

export interface BatchPreviewFailure {
  assetId: string
  /** ASSET_NOT_AVAILABLE / NOT_FOUND / PREVIEW_UNSUPPORTED / STORAGE_* / FILE_MISMATCH / INTERNAL_ERROR */
  error: { code: string; message: string }
}

export type BatchPreviewItem = BatchPreviewSuccess | BatchPreviewFailure

export interface BatchPreviewResult {
  items: BatchPreviewItem[]
}

/* ---------------- 删除素材 ---------------- */

export interface BatchDeleteInput {
  /** 1-100 个素材 ID，允许重复（后端去重） */
  assetIds: string[]
}

export interface BatchDeleteSuccess {
  assetId: string
  status: 'DELETED'
}

export interface BatchDeleteFailure {
  assetId: string
  /** ASSET_IN_USE / NOT_FOUND / STORAGE_* / DELETE_INCOMPLETE / INTERNAL_ERROR */
  error: { code: string; message: string }
}

export type BatchDeleteItem = BatchDeleteSuccess | BatchDeleteFailure

export interface BatchDeleteResult {
  items: BatchDeleteItem[]
  total: number
  successCount: number
  failedCount: number
}

export interface Category {
  id: string
  code: CategoryCode
  name: string
  allowedAssetTypes: AssetType[]
}

export interface CategoryResult {
  items: Category[]
}

export interface Asset {
  id: string
  name: string
  assetType: AssetType
  categoryCode: string
  mimeType: string
  fileSize: number
  status: AssetStatus
  originalFilename: string
  publishedAt: string | null
  taskId: string
  /**
   * ZIP 子素材所属活动包 ID（顶层素材省略）。
   * 子素材独立走预览/下载接口，但不在素材列表中重复展示。
   */
  parentId?: string
  /**
   * 活动包详情中解压出的图片、视频子素材（按 ZIP 顺序）。
   * 旧活动包未解包或没有可预览文件时省略，此时可调用
   * `POST /admin/assets/{id}/unpack` 补解包。
   */
  children?: Asset[]
  /**
   * 活动包（列表与详情）的第一个可见图片/视频子素材（v2.10.1），
   * 字段与子素材一致，直接用它的 id 申请预览即可当封面；
   * 未解包或没有可见媒体时省略。员工只会拿到已上架子素材。
   */
  cover?: Asset
}

export interface Locator {
  bucket?: string
  corpId?: string
  fileId?: string
  mediaId?: string
  objectKey?: string
  spaceId?: string
}

export interface AdminAsset extends Asset {
  fileLocator: Locator
  storageProvider: StorageProvider
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export type AdminAssetPage = Page<AdminAsset>

export interface AssetResult {
  assetId: string
  status: string
}

export interface CreateAssetInput {
  name: string
  uploadSessionId: string
}

export interface UploadInput {
  requestId: string
  purpose: UploadPurpose
  categoryCode: CategoryCode
  assetType: AssetType
  filename: string
  mimeType: string
  fileSize: number
}

export interface UploadTransfer {
  url: string
  method: 'PUT'
}

export interface Session {
  id: string
  assetId?: string
  assetType: string
  categoryCode: string
  errorCode?: string
  errorMessage?: string
  expiresAt: string | null
  fileSize: number
  filename: string
  mimeType: string
  purpose: string
  requestId: string
  status: SessionStatus
  storageProvider: string
  taskId?: string
  transfer?: UploadTransfer
  uploadMode: 'PROXY'
}

export interface Task {
  id: string
  title: string
  content: string
  publishedAt: string
  claimCount: number
  claimed: boolean
  claimedAt: string | null
}

export interface TaskDetail extends Task {
  activityAsset: Asset & { available: boolean }
}

export type TaskPage = Page<Task>

export interface TaskInput {
  requestId: string
  title: string
  content: string
  uploadSessionId: string
}

export interface TaskResult {
  taskId: string
  activityAssetId: string
  publishedAt: string
}

export interface Claim {
  taskId: string
  userId: string
  displayName: string | null
  phone: string | null
  storeName: string | null
  claimedAt: string
}

export type ClaimPage = Page<Claim>

export interface ClaimResult {
  claimed: boolean
  claimedAt: string
  completed: boolean
  taskId: string
}

export interface DownloadInput {
  requestId: string
}

export interface DownloadResult {
  downloadMode: 'PROXY'
  url: string
  expiresAt: string
  fileSize: number
  filename: string
  mimeType: string
}

export interface DownloadLog {
  id: string
  assetId: string
  assetName: string
  createdAt: string
  displayName: string | null
  requestId: string
  storageProvider: string
  storeName: string | null
  userId: string
}

export type DownloadLogPage = Page<DownloadLog>

export interface Operation {
  id: string
  action: OperationAction
  afterState: string
  beforeState: string
  errorCode?: string
  errorMessage?: string
  fileLocatorSnapshot: Locator
  operatedAt: string
  operatorId: string
  operatorSnapshot: string
  requestId: string
  /** 平台侧请求标识（后端字段存在但目前恒为空，展示时兜底） */
  platformRequestId?: string
  result: OperationResult
  storageProvider: string
  targetId?: string
  targetNameSnapshot?: string
  targetType: string
}

export type OperationPage = Page<Operation>

export interface AssetCount {
  categoryCode: string
  status: string
  count: number
}

export interface Dashboard {
  asOf: string
  assetCounts: AssetCount[]
  claimCount: number
  downloadRequestCount: number
  employeeCount: number
  participantCount: number
  taskCount: number
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
  }
}

export interface AssetFilters {
  page?: number
  pageSize?: number
  keyword?: string
  categoryCode?: string
  assetType?: string
}

export interface AdminAssetFilters extends AssetFilters {
  status?: string
  storageProvider?: string
}

export interface TaskFilters {
  page?: number
  pageSize?: number
  keyword?: string
}

export interface ClaimFilters {
  page?: number
  pageSize?: number
  keyword?: string
}

export interface DownloadLogFilters {
  page?: number
  pageSize?: number
  userId?: string
  assetId?: string
  storageProvider?: string
  from?: string
  to?: string
}

export interface OperationLogFilters {
  page?: number
  pageSize?: number
  operatorId?: string
  action?: string
  targetType?: string
  targetId?: string
  storageProvider?: string
  result?: string
  from?: string
  to?: string
}
