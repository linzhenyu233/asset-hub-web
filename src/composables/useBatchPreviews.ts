import { ref } from 'vue'
import { adminAssetApi } from '../api'
import { resolveFileUrl } from '../api/client'

export interface ThumbAsset {
  id: string
  assetType: string
}

/**
 * 列表页批量缩略图：一次请求拿整页素材的短时预览票据（后端上限 100 条）。
 * 活动包（ARCHIVE）不支持预览，直接跳过；失败项保留错误说明由页面兜底展示。
 */
export function useBatchPreviews() {
  const thumbs = ref<Record<string, string>>({})
  const failures = ref<Record<string, string>>({})
  let seq = 0

  async function load(assets: ThumbAsset[]): Promise<void> {
    const targets = assets.filter((asset) => asset.assetType !== 'ARCHIVE')
    const current = ++seq

    if (targets.length === 0) {
      thumbs.value = {}
      failures.value = {}
      return
    }

    try {
      const ids = targets.map((asset) => asset.id)
      const res = await adminAssetApi.previews(ids)
      if (current !== seq) return

      const nextThumbs: Record<string, string> = {}
      const nextFailures: Record<string, string> = {}
      for (const item of res.items) {
        if ('url' in item) nextThumbs[item.assetId] = resolveFileUrl(item.url)
        else nextFailures[item.assetId] = item.error.message
      }
      thumbs.value = nextThumbs
      failures.value = nextFailures
    } catch {
      if (current !== seq) return
      // 批量预览失败不影响列表本身，退回图标占位
      thumbs.value = {}
      failures.value = {}
    }
  }

  /** 缩略文件加载失败（如票据过期、图片解码失败）时退回图标占位 */
  function markBroken(id: string): void {
    if (!thumbs.value[id]) return
    const nextThumbs = { ...thumbs.value }
    delete nextThumbs[id]
    thumbs.value = nextThumbs
    failures.value = { ...failures.value, [id]: '缩略图加载失败' }
  }

  function reset(): void {
    seq += 1
    thumbs.value = {}
    failures.value = {}
  }

  return { thumbs, failures, load, reset, markBroken }
}
