import { ref } from 'vue'
import { adminAssetApi } from '../api'
import { ApiError } from '../api/client'
import type { PreviewResult } from '../api/types'

/**
 * 申请素材的短时预览票据。
 * 后端不返回图片直链（只有 fileLocator），详情页内联展示与放大预览都依赖这份票据。
 */
export function useAssetPreview(getId: () => string) {
  const preview = ref<PreviewResult | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')
  let seq = 0

  async function load(): Promise<void> {
    const id = getId()
    if (!id) return
    const current = ++seq
    loading.value = true
    errorMessage.value = ''
    try {
      const result = await adminAssetApi.preview(id)
      if (current !== seq) return
      preview.value = result
    } catch (error) {
      if (current !== seq) return
      preview.value = null
      if (error instanceof ApiError && error.status === 415) {
        errorMessage.value = '该文件类型不支持在线预览'
      } else if (error instanceof ApiError && error.status === 404) {
        errorMessage.value = '素材不存在或已被删除'
      } else {
        errorMessage.value = error instanceof Error ? error.message : '预览加载失败'
      }
    } finally {
      if (current === seq) loading.value = false
    }
  }

  function reset(): void {
    seq += 1
    preview.value = null
    loading.value = false
    errorMessage.value = ''
  }

  return { preview, loading, errorMessage, load, reset }
}
