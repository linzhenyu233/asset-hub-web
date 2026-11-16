/**
 * 文件真实类型识别（读文件头魔数）。
 * 后端会嗅探字节并与上传时声明的 mimeType 比对，不一致直接返回「文件实际类型与声明不符」，
 * 因此上传前必须按真实类型声明，而不是只信浏览器按扩展名给出的 file.type。
 */

/** 后端允许存储/预览的类型 */
export const SUPPORTED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'application/zip',
]

export const MIME_LABEL: Record<string, string> = {
  'image/jpeg': 'JPEG 图片',
  'image/png': 'PNG 图片',
  'image/webp': 'WebP 图片',
  'image/gif': 'GIF 图片',
  'image/svg+xml': 'SVG 矢量图',
  'image/heic': 'HEIC 图片',
  'image/avif': 'AVIF 图片',
  'image/bmp': 'BMP 图片',
  'video/mp4': 'MP4 视频',
  'video/quicktime': 'MOV 视频',
  'video/webm': 'WebM 视频',
  'video/x-msvideo': 'AVI 视频',
  'application/zip': 'ZIP 压缩包',
  'application/pdf': 'PDF 文档',
}

export function mimeLabel(mime: string): string {
  return MIME_LABEL[mime] ?? mime
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end))
}

/** 从文件头字节推断 MIME；无法识别返回 null */
export function sniffMimeType(head: Uint8Array): string | null {
  if (head.length < 4) return null

  // JPEG: FF D8 FF
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    head[0] === 0x89 &&
    head[1] === 0x50 &&
    head[2] === 0x4e &&
    head[3] === 0x47 &&
    head[4] === 0x0d &&
    head[5] === 0x0a &&
    head[6] === 0x1a &&
    head[7] === 0x0a
  ) {
    return 'image/png'
  }

  // GIF: GIF87a / GIF89a
  if (ascii(head, 0, 3) === 'GIF') return 'image/gif'

  // WEBP: RIFF....WEBP
  if (ascii(head, 0, 4) === 'RIFF' && head.length >= 12 && ascii(head, 8, 12) === 'WEBP') {
    return 'image/webp'
  }

  // BMP: BM
  if (head[0] === 0x42 && head[1] === 0x4d) return 'image/bmp'

  // ZIP: PK\x03\x04（含空包/分卷）
  if (head[0] === 0x50 && head[1] === 0x4b && (head[2] === 3 || head[2] === 5 || head[2] === 7)) {
    return 'application/zip'
  }

  // PDF: %PDF
  if (ascii(head, 0, 4) === '%PDF') return 'application/pdf'

  // ISO BMFF（mp4 / mov / heic / avif）：偏移 4 处为 ftyp
  if (head.length >= 12 && ascii(head, 4, 8) === 'ftyp') {
    const brand = ascii(head, 8, 12).trim().toLowerCase()
    if (['heic', 'heix', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) return 'image/heic'
    if (['avif', 'avis'].includes(brand)) return 'image/avif'
    if (brand === 'qt') return 'video/quicktime'
    return 'video/mp4'
  }

  // Matroska / WebM: 1A 45 DF A3
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
    return 'video/webm'
  }

  // AVI: RIFF....AVI
  if (ascii(head, 0, 4) === 'RIFF' && head.length >= 12 && ascii(head, 8, 11) === 'AVI') {
    return 'video/x-msvideo'
  }

  // SVG / XML 文本
  const text = ascii(head, 0, Math.min(head.length, 120)).trimStart().toLowerCase()
  if (text.startsWith('<svg') || (text.startsWith('<?xml') && text.includes('<svg'))) {
    return 'image/svg+xml'
  }

  return null
}

export interface FileTypeInspection {
  /** 声明的类型（浏览器按扩展名给出，可能为空或不准） */
  declared: string
  /** 文件头识别出的真实类型，无法识别为 null */
  actual: string | null
  /** 最终用于上传声明的类型 */
  mimeType: string
  /** 真实类型不受后端支持 */
  unsupported: boolean
  /** 声明与真实类型不一致（需提示用户） */
  mismatched: boolean
}

/** 读取文件头识别真实类型，并给出上传时应声明的 MIME */
export async function inspectFile(file: File, fallback: string): Promise<FileTypeInspection> {
  let actual: string | null = null
  try {
    const buffer = await file.slice(0, 64).arrayBuffer()
    actual = sniffMimeType(new Uint8Array(buffer))
  } catch {
    actual = null
  }

  const declared = file.type || ''
  // 浏览器给不出类型时 declared 是空串，?? 不会兜底（'' 不是 null），用 || 才会落到 fallback
  const mimeType = actual ?? (declared || fallback)
  return {
    declared,
    actual,
    mimeType,
    unsupported: actual !== null && !SUPPORTED_MIME.includes(actual),
    mismatched: actual !== null && declared !== '' && actual !== declared,
  }
}
