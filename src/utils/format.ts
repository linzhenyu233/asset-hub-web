export const ASSET_TYPE_LABEL: Record<string, string> = {
  IMAGE: '图片',
  VIDEO: '视频',
  ARCHIVE: 'ZIP 包',
}

export const CATEGORY_LABEL: Record<string, string> = {
  IMAGE: '图片素材',
  VIDEO: '视频素材',
  COMPANY: '公司素材',
  CAMPAIGN: '活动素材',
}

/** 与后端 OperationAction 枚举一一对应（UPLOAD/PUBLISH/OFFLINE/DELETE/TASK_PUBLISH/ACCOUNT_CREATE/ACCOUNT_STATUS） */
export const ACTION_LABEL: Record<string, string> = {
  UPLOAD: '上传',
  PUBLISH: '上架',
  OFFLINE: '下架',
  DELETE: '删除素材',
  TASK_PUBLISH: '发布任务',
  TASK_DEADLINE: '修改截止时间',
  ACCOUNT_CREATE: '新建子账号',
  ACCOUNT_STATUS: '启停子账号',
}

export function assetTypeLabel(value: string): string {
  return ASSET_TYPE_LABEL[value] ?? value
}

export function categoryLabel(value: string, dict?: Record<string, string>): string {
  return dict?.[value] ?? CATEGORY_LABEL[value] ?? value
}

export function actionLabel(value: string): string {
  return ACTION_LABEL[value] ?? value
}

/**
 * 操作日志的对象类型（后端枚举 ASSET / TASK / UPLOAD_SESSION / ADMIN_ACCOUNT）。
 * UPLOAD_SESSION 是「一次上传过程」，对使用者来说就是素材文件，统一显示为素材。
 */
export const TARGET_TYPE_LABEL: Record<string, string> = {
  ASSET: '素材',
  UPLOAD_SESSION: '素材',
  TASK: '任务素材',
  ADMIN_ACCOUNT: '子账号',
}

export function targetTypeLabel(value: string): string {
  return TARGET_TYPE_LABEL[value] ?? value
}

/**
 * datetime-local 的 `YYYY-MM-DDTHH:mm` 转后端要的北京时间 `YYYY-MM-DD HH:mm:ss`。
 * 已经是后端格式或空值时原样返回。
 */
export function toApiDateTime(value: string): string {
  if (!value) return ''
  const normalized = value.replace('T', ' ')
  return normalized.length === 16 ? `${normalized}:00` : normalized
}

/** 后端时间字符串转 datetime-local 需要的值 */
export function toInputDateTime(value: string | null | undefined): string {
  if (!value) return ''
  return value.replace(' ', 'T').slice(0, 16)
}

export function formatBytes(bytes?: number | null): string {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  const digits = value >= 100 || exponent === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(digits)} ${units[exponent]}`
}

/** 后端业务时间为北京时间字符串，原样展示即可，仅做空值兜底。 */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  return value.replace('T', ' ').replace(/\.\d+Z?$/, '').replace(/Z$/, '')
}

/**
 * 日期筛选的结束时间：后端 `to` 是开区间（`< to`），传当天 23:59:59 会漏掉最后一秒，
 * 所以统一传「次日 00:00:00」。入参为 `YYYY-MM-DD`。
 */
export function nextDayStart(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  // 认不出的日期返回空串：调用方会跳过该参数，比把畸形值发给后端（400 无提示）好
  if (!year || !month || !day) return ''
  const next = new Date(Date.UTC(year, month - 1, day + 1))
  const y = next.getUTCFullYear()
  const m = String(next.getUTCMonth() + 1).padStart(2, '0')
  const d = String(next.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d} 00:00:00`
}

export function formatPhone(value?: string | null): string {
  if (!value) return '—'
  const digits = value.replace(/\D/g, '').replace(/^86/, '')
  if (digits.length === 11) return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`
  return value
}

export function shortId(value?: string | null): string {
  if (!value) return '—'
  return `#${value}`
}
