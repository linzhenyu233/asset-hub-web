import { uploadApi } from '../api'
import { ApiError } from '../api/client'
import type { AssetType, CategoryCode, Session, UploadPurpose } from '../api/types'

export interface UploadOptions {
  file: File
  purpose: UploadPurpose
  categoryCode: CategoryCode
  assetType: AssetType
  /** 按文件真实类型声明的 MIME（后端会校验字节，缺省时按扩展名推断） */
  mimeType?: string
  requestId?: string
  onProgress?: (percent: number) => void
}

function fallbackMime(assetType: AssetType, file: File): string {
  if (file.type) return file.type
  if (assetType === 'ARCHIVE') return 'application/zip'
  if (assetType === 'IMAGE') return 'image/jpeg'
  return 'video/mp4'
}

/** 生成符合后端规范的 requestId（8-64 位，允许字母数字及 : . _ -）。 */
export function makeRequestId(prefix: string): string {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `${prefix}:${uuid}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

const POLL_INTERVAL_MS = 700
const POLL_TIMEOUT_MS = 30000

/**
 * 上传二进制：大文件偶发网关中断（502/504）或网络抖动时重传一次，
 * 会话本身不变（后端按会话校验文件，不会串内容）。
 */
async function putWithRetry(
  url: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      await uploadApi.putContent(url, file, onProgress)
      return
    } catch (error) {
      const transient =
        error instanceof ApiError && (error.status === 0 || [502, 503, 504].includes(error.status))
      if (!transient || attempt >= 1) throw error
      await sleep(1500)
    }
  }
}

/**
 * 提交校验（后端校验 OSS 定位/大小/MIME/SHA256 后将会话置为 FILE_READY）。
 * 传输尚未落盘时后端返回 409，此时等待后重试；期间会话失败则直接返回，
 * 由调用方抛出后端给出的失败原因。
 */
async function commitWithRetry(id: string): Promise<Session> {
  const deadline = Date.now() + POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const current = await uploadApi.getSession(id)
    if (current.status === 'FAILED') return current
    if (current.status === 'COMMITTED' || current.status === 'FILE_READY') return current

    try {
      return await uploadApi.complete(id)
    } catch (error) {
      // 409 = 后端还在接收/转存文件；502/503/504 = 网关或后端在处理大文件时短暂中断
      const transient =
        error instanceof ApiError && [409, 502, 503, 504].includes(error.status)
      if (!transient) throw error
      await sleep(POLL_INTERVAL_MS)
    }
  }

  throw new ApiError(
    '文件校验超时，请稍后重试（后端仍在处理该文件）',
    'UPLOAD_COMMIT_TIMEOUT',
    0,
  )
}

/**
 * 完整上传编排：创建会话 → 传二进制 → 轮询阶段 → 提交校验。
 * 会话若已处于 FILE_READY / COMMITTED（requestId 复用）会自动跳过重复传输。
 */
export async function runUpload(options: UploadOptions): Promise<Session> {
  const requestId = options.requestId ?? makeRequestId('upload')

  let session = await uploadApi.createSession({
    requestId,
    purpose: options.purpose,
    categoryCode: options.categoryCode,
    assetType: options.assetType,
    filename: options.file.name,
    mimeType: options.mimeType || fallbackMime(options.assetType, options.file),
    fileSize: options.file.size,
  })

  if (session.status === 'FAILED') {
    throw new ApiError(
      session.errorMessage || '无法开始上传，请重试',
      session.errorCode || 'UPLOAD_SESSION_FAILED',
      0,
    )
  }

  if (session.status === 'INIT' || session.status === 'UPLOADING') {
    const url = session.transfer?.url
    if (!url) throw new ApiError('后端未返回上传地址，请重试', 'UPLOAD_URL_MISSING', 0)
    await putWithRetry(url, options.file, options.onProgress)
    session = await uploadApi.getSession(session.id)
  }

  if (session.status === 'FAILED') {
    throw new ApiError(
      session.errorMessage || '文件校验失败，请重试',
      session.errorCode || 'UPLOAD_FAILED',
      0,
    )
  }

  if (session.status !== 'COMMITTED' && session.status !== 'FILE_READY') {
    // FILE_READY 只能由 complete 置位：传输落盘完成前 complete 返回 409，重试等待
    session = await commitWithRetry(session.id)
  }

  if (session.status === 'FAILED') {
    throw new ApiError(
      session.errorMessage || '文件校验失败，请重试',
      session.errorCode || 'UPLOAD_FAILED',
      0,
    )
  }

  if (session.status !== 'COMMITTED' && session.status !== 'FILE_READY') {
    throw new ApiError('文件尚未就绪，请稍后重试', 'UPLOAD_NOT_READY', 0)
  }

  return session
}
