// 类型定义严格对应「图片视频素材中台 API」v2.11.0 OpenAPI 规范（42 个业务接口 + 1 个预览 HEAD）

export type AssetType = 'IMAGE' | 'VIDEO' | 'ARCHIVE'
export type CategoryCode = 'IMAGE' | 'VIDEO' | 'COMPANY' | 'CAMPAIGN'
export type AssetStatus = 'DRAFT' | 'PUBLISHED' | 'OFFLINE'
/** 后端只有 OSS 一种存储（DINGDRIVE 已下线） */
export type StorageProvider = 'OSS'
/**
 * REVIEW 是独立审核账号（v2.11.0）：只读身份、固定分类与空列表，
 * 不能预览 / 下载 / 领取 / 改密，也不能访问任何管理接口。
 */
export type Role = 'ADMIN' | 'EMPLOYEE' | 'REVIEW'
export type SessionStatus = 'INIT' | 'UPLOADING' | 'FILE_READY' | 'COMMITTED' | 'FAILED'
export type UploadPurpose = 'MATERIAL' | 'TASK_PACKAGE'
export type OperationAction =
  | 'UPLOAD'
  | 'PUBLISH'
  | 'OFFLINE'
  | 'DELETE'
  | 'TASK_PUBLISH'
  | 'TASK_DEADLINE'
  | 'ACCOUNT_CREATE'
  | 'ACCOUNT_STATUS'
export type OperationResult = 'SUCCESS' | 'FAILED'
export type AdminAccountStatus = 'ACTIVE' | 'DISABLED'

export interface User {
  /** 用户唯一对外编号（v3.0.0）：11 位大写字母+数字，虚拟预览身份为 REVIEW */
  userId: string
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
  /** 用户唯一对外编号（v3.0.0），启停接口使用此字段 */
  userId: string
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

/* ---------------- 员工账号（v2.12.0，管理员可查询与启停） ---------------- */

export type EmployeeAccountStatus = 'ACTIVE' | 'DISABLED'

/**
 * 本系统已建档员工的基本信息。
 * 不含密码、门店、建档时间与 ERP 快照；姓名 / 工号 / 手机号 / 最近登录时间缺失时为 null。
 */
export interface EmployeeAccount {
  /** 用户唯一对外编号（v3.0.0），详情与启停接口使用此字段 */
  userId: string
  /** ERP 工号，历史资料缺失时为 null */
  employeeId: string | null
  displayName: string | null
  /** 规范手机号 */
  phone: string | null
  status: EmployeeAccountStatus
  /** 是否尚未完成首次改密（初始密码为工号重复两次） */
  mustChangePassword: boolean
  /** 最近成功登录时间，从未登录为 null */
  lastLoginAt: string | null
}

export interface EmployeeAccountPage {
  items: EmployeeAccount[]
  total: number
  page: number
  pageSize: number
}

export interface EmployeeAccountFilters {
  page?: number
  pageSize?: number
  /** 工号、姓名、手机号或门店关键词 */
  keyword?: string
  /** 不传则返回启用及停用员工 */
  status?: EmployeeAccountStatus | ''
}

export interface EmployeeAccountStatusInput {
  status: EmployeeAccountStatus
}

/* ---------------- 在线预览 ---------------- */

export interface PreviewResult {
  /** 短时预览票据相对地址，可直接用于 img / video 的 src */
  url: string
  /**
   * 240px 缩略图地址（v2.11.0 起）：图片缩略图或视频首帧，统一是 JPEG，
   * 沿用同一票据与到期时间。列表缩略图优先用它，避免下载几 MB 原图。
   */
  thumbnailUrl?: string
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
  /** 素材唯一对外编号（v3.0.0）：ZSSJ + 13 位数字 */
  assetId: string
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
   * ZIP 子素材所属素材包/活动包 ID（顶层素材省略）。
   * 子素材独立走预览/下载接口，但不在素材列表中重复展示。
   */
  parentId?: string
  /**
   * ZIP 素材包或活动包详情中解压出的图片、视频（按 ZIP 顺序）。
   * 图片包只含图片、视频包只含视频、公司包可混合；
   * 旧包未解包时省略，可调用 `POST /admin/assets/{id}/unpack` 补解包。
   */
  children?: Asset[]
  /**
   * ZIP 素材包/活动包（列表与详情）的第一项可见图片或视频（v2.10.1），
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
  /** 领取截止时间（北京时间）；null 表示长期有效 */
  deadlineAt?: string | null
  /** 服务端判定是否已过截止时间；已领取的任务也可能为 true */
  expired?: boolean
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
  /** 可选领取截止时间；省略或 null 表示无截止时间 */
  deadlineAt?: string | null
}

export interface TaskResult {
  taskId: string
  activityAssetId: string
  publishedAt: string
  deadlineAt?: string | null
  expired?: boolean
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
  /** 完整公开素材编号精确筛选（v3.0.0），与 keyword 二选一使用 */
  assetId?: string
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
