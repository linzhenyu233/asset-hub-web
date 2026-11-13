export const ASSET_TYPE_LABEL: Record<string, string> = {
  IMAGE: '图片',
  VIDEO: '视频',
  ARCHIVE: '活动包',
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
  if (!year || !month || !day) return date
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
