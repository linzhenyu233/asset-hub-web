<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminAssetApi, adminTaskApi, categoryApi } from '../../api'
import type { AssetType, Category, CategoryCode } from '../../api/types'
import { makeRequestId, runUpload } from '../../composables/useUpload'
import { useToast } from '../../composables/useToast'
import { formatBytes } from '../../utils/format'
import { inspectFile, mimeLabel, type FileTypeInspection } from '../../utils/fileType'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'

type Mode = 'material' | 'task'

const route = useRoute()
const router = useRouter()
const { success } = useToast()

const mode = ref<Mode>('material')
const categories = ref<Category[]>([])
const submitting = ref(false)
const progress = ref<number | null>(null)
const errorMessage = ref('')

const fileInput = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const dragging = ref(false)
/** 文件真实类型识别结果（后端会校验声明与字节是否一致） */
const inspection = ref<FileTypeInspection | null>(null)
const inspecting = ref(false)
let inspectSeq = 0

const material = reactive({
  name: '',
  categoryCode: '' as CategoryCode | '',
  assetType: 'IMAGE' as AssetType,
})

const task = reactive({
  title: '',
  content: '',
})

const allowedTypes = computed<AssetType[]>(() => {
  const category = categories.value.find((item) => item.code === material.categoryCode)
  return category?.allowedAssetTypes ?? ['IMAGE', 'VIDEO', 'ARCHIVE']
})

/** 优先按真实字节判断类型，读不到再退回浏览器声明的类型 */
const effectiveMime = computed(
  () => inspection.value?.mimeType || selectedFile.value?.type || '',
)

const guessedType = computed<AssetType>(() => {
  if (!selectedFile.value) return material.assetType
  if (effectiveMime.value.startsWith('image/')) return 'IMAGE'
  if (effectiveMime.value.startsWith('video/')) return 'VIDEO'
  return 'ARCHIVE'
})

const typeMismatch = computed(
  () => mode.value === 'material' && selectedFile.value !== null && !allowedTypes.value.includes(guessedType.value),
)

/**
 * 任务包在后端固定按 CAMPAIGN + ARCHIVE 落库（见 task_publish 校验），
 * 只接受 ZIP；这里按真实字节判断，避免扩展名骗过后端报「分类与文件类型不匹配」。
 */
const isZipPackage = computed(() => {
  const file = selectedFile.value
  if (!file) return false
  const inspected = inspection.value
  if (inspected?.actual) return inspected.actual === 'application/zip'
  const mime = inspected?.mimeType || file.type
  return mime === 'application/zip' || /\.zip$/i.test(file.name)
})

const taskTypeMismatch = computed(
  () => mode.value === 'task' && selectedFile.value !== null && !isZipPackage.value,
)

/** 两种模式的不匹配都直接挡住提交 */
const blockingMismatch = computed(() => typeMismatch.value || taskTypeMismatch.value)

/** 文件选择框的可选类型：任务包只放 ZIP，素材按当前分类放开 */
const acceptTypes = computed(() => {
  if (mode.value === 'task') return '.zip,application/zip'
  const accepts: string[] = []
  if (allowedTypes.value.includes('IMAGE')) accepts.push('image/*')
  if (allowedTypes.value.includes('VIDEO')) accepts.push('video/*')
  if (allowedTypes.value.includes('ARCHIVE')) accepts.push('.zip,application/zip')
  return accepts.join(',')
})

const progressLabel = computed(() => {
  if (progress.value === null) return ''
  return progress.value >= 100 ? '文件已上传，正在校验…' : `正在上传 ${progress.value}%`
})

/** 超过 50MB 的文件更容易触发网关超时，提前提示 */
const LARGE_FILE_BYTES = 50 * 1024 * 1024
const isLargeFile = computed(() => (selectedFile.value?.size ?? 0) > LARGE_FILE_BYTES)

function guessFromFile(file: File): AssetType {
  const mime = inspection.value?.mimeType || file.type
  if (mime.startsWith('image/')) return 'IMAGE'
  if (mime.startsWith('video/')) return 'VIDEO'
  return 'ARCHIVE'
}

function syncMaterialType() {
  const fallback = allowedTypes.value[0] ?? 'IMAGE'
  if (selectedFile.value) {
    const guess = guessFromFile(selectedFile.value)
    material.assetType = allowedTypes.value.includes(guess) ? guess : fallback
  } else {
    material.assetType = allowedTypes.value.includes(material.assetType) ? material.assetType : fallback
  }
}

watch(
  () => material.categoryCode,
  () => syncMaterialType(),
)

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  applyFile(file)
  input.value = ''
}

async function applyFile(file: File | null) {
  selectedFile.value = file
  errorMessage.value = ''
  inspection.value = null
  const seq = ++inspectSeq

  if (!file) {
    inspecting.value = false
    return
  }

  if (mode.value === 'material' && !material.name.trim()) {
    material.name = file.name.replace(/\.[^.]+$/, '')
  }

  inspecting.value = true
  const fallback = mode.value === 'task' ? 'application/zip' : 'image/jpeg'
  const result = await inspectFile(file, fallback)
  if (seq !== inspectSeq) return

  inspection.value = result
  inspecting.value = false
  if (mode.value === 'material') syncMaterialType()
}

function onDrop(event: DragEvent) {
  dragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) applyFile(file)
}

function clearFile() {
  selectedFile.value = null
  inspection.value = null
  inspecting.value = false
  inspectSeq += 1
}

function switchMode(next: Mode) {
  if (mode.value === next) return
  mode.value = next
  errorMessage.value = ''
}

function validate(): string {
  if (!selectedFile.value) return '请先选择要上传的文件'
  if (inspection.value?.unsupported) {
    return `暂不支持 ${mimeLabel(inspection.value.actual as string)} 格式，请转为 JPG / PNG / WebP 图片、MP4 / MOV / WebM 视频或 ZIP 压缩包后再上传`
  }
  if (mode.value === 'material') {
    if (!material.name.trim()) return '请填写素材名称'
    if (!material.categoryCode) return '请选择素材分类'
    if (!allowedTypes.value.includes(material.assetType)) return '当前分类不支持该文件类型'
  } else {
    if (!isZipPackage.value) return '活动包必须是 ZIP 压缩包（.zip），请重新选择文件'
    if (!task.title.trim()) return '请填写任务标题'
    if (!task.content.trim()) return '请填写任务内容'
  }
  return ''
}

async function submitMaterial() {
  errorMessage.value = validate()
  if (errorMessage.value || !selectedFile.value) return

  submitting.value = true
  progress.value = 0
  try {
    const session = await runUpload({
      file: selectedFile.value,
      purpose: 'MATERIAL',
      categoryCode: material.categoryCode as CategoryCode,
      assetType: material.assetType,
      mimeType: inspection.value?.mimeType,
      onProgress: (value) => (progress.value = value),
    })

    const result = await adminAssetApi.create({
      name: material.name.trim(),
      uploadSessionId: session.id,
    })

    success('素材已入库，可在素材管理中上架')
    router.push(`/admin/assets/${result.assetId}`)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '素材入库失败，请重试'
  } finally {
    submitting.value = false
    progress.value = null
  }
}

async function submitTask() {
  errorMessage.value = validate()
  if (errorMessage.value || !selectedFile.value) return

  submitting.value = true
  progress.value = 0
  try {
    const session = await runUpload({
      file: selectedFile.value,
      purpose: 'TASK_PACKAGE',
      categoryCode: 'CAMPAIGN',
      // 后端要求任务包固定为 CAMPAIGN + ARCHIVE
      assetType: 'ARCHIVE',
      mimeType: inspection.value?.mimeType,
      onProgress: (value) => (progress.value = value),
    })

    const result = await adminTaskApi.create({
      requestId: makeRequestId('task'),
      title: task.title.trim(),
      content: task.content.trim(),
      uploadSessionId: session.id,
    })

    success('任务已发布')
    router.push(`/admin/tasks/${result.taskId}`)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '任务发布失败，请重试'
  } finally {
    submitting.value = false
    progress.value = null
  }
}

function submit() {
  if (mode.value === 'material') submitMaterial()
  else submitTask()
}

async function loadCategories() {
  try {
    const res = await categoryApi.list()
    categories.value = res.items
    if (!material.categoryCode && res.items.length > 0) {
      material.categoryCode = res.items[0].code
      syncMaterialType()
    }
  } catch {
    categories.value = []
  }
}

onMounted(() => {
  if (route.query.mode === 'task') mode.value = 'task'
  loadCategories()
})
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="素材入库" subtitle="上传素材文件或活动包，文件由 OSS 托管并受控分发" />

    <!-- 模式切换 -->
    <div class="flex items-center gap-2 mb-5">
      <button
        type="button"
        class="flex items-center gap-2 h-10 px-4 rounded-control text-body font-medium transition-colors duration-fast"
        :class="mode === 'material' ? 'bg-brand-100 text-brand-600' : 'bg-neutral-0 text-neutral-600 border border-neutral-200 hover:bg-neutral-50'"
        @click="switchMode('material')"
      >
        <BaseIcon name="image" :size="16" />
        上传素材
      </button>
      <button
        type="button"
        class="flex items-center gap-2 h-10 px-4 rounded-control text-body font-medium transition-colors duration-fast"
        :class="mode === 'task' ? 'bg-brand-100 text-brand-600' : 'bg-neutral-0 text-neutral-600 border border-neutral-200 hover:bg-neutral-50'"
        @click="switchMode('task')"
      >
        <BaseIcon name="clipboard" :size="16" />
        上传活动包并发布任务
      </button>
    </div>

    <div class="grid gap-5 lg:grid-cols-[1fr_360px] items-start">
      <!-- 表单 -->
      <form class="card p-6" @submit.prevent="submit">
        <div v-if="errorMessage" role="alert" class="mb-4 flex items-start gap-2 rounded-control bg-feedback-danger-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-on-danger">
          <BaseIcon name="alert" :size="18" class="mt-px" />
          <span>{{ errorMessage }}</span>
        </div>

        <div v-if="mode === 'material'" class="space-y-5">
          <div>
            <label class="label" for="material-name">素材名称</label>
            <input id="material-name" v-model="material.name" class="input" type="text" placeholder="例如：2026 情人节主视觉" maxlength="200" />
          </div>

          <div class="grid gap-4 sm:grid-cols-2">
            <div>
              <label class="label" for="material-category">素材分类</label>
              <select id="material-category" v-model="material.categoryCode" class="select">
                <option value="" disabled>请选择分类</option>
                <option v-for="category in categories" :key="category.code" :value="category.code">
                  {{ category.name }}
                </option>
              </select>
            </div>

            <div>
              <label class="label" for="material-type">文件类型</label>
              <select id="material-type" v-model="material.assetType" class="select">
                <option v-for="type in allowedTypes" :key="type" :value="type">
                  {{ type === 'IMAGE' ? '图片' : type === 'VIDEO' ? '视频' : '活动包' }}
                </option>
              </select>
            </div>
          </div>
        </div>

        <div v-else class="space-y-5">
          <div>
            <label class="label" for="task-title">任务标题</label>
            <input id="task-title" v-model="task.title" class="input" type="text" placeholder="例如：情人节活动素材领取" maxlength="200" />
          </div>

          <div>
            <label class="label" for="task-content">任务内容</label>
            <textarea
              id="task-content"
              v-model="task.content"
              class="textarea min-h-[180px]"
              placeholder="说明活动规则、使用场景与注意事项；员工领取即完成。"
              maxlength="60000"
            />
            <p class="help-text">{{ task.content.length }} / 60000</p>
          </div>
        </div>

        <!-- 文件选择 -->
        <div class="mt-5">
          <span class="label">上传文件</span>
          <div
            class="rounded-card border-2 border-dashed px-5 py-8 text-center transition-colors cursor-pointer"
            :class="dragging ? 'border-brand-400 bg-brand-50' : 'border-neutral-200 bg-neutral-25 hover:border-brand-300'"
            role="button"
            tabindex="0"
            @click="pickFile"
            @keydown.enter="pickFile"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <div v-if="!selectedFile" class="flex flex-col items-center gap-2 text-neutral-500">
              <div class="w-12 h-12 rounded-2xl bg-neutral-0 border border-neutral-100 flex items-center justify-center text-neutral-400">
                <BaseIcon name="upload" :size="22" />
              </div>
              <p class="text-body text-neutral-700">点击选择文件，或拖拽到此处</p>
              <p class="text-micro text-neutral-400">
                {{ mode === 'task' ? '活动包是文件夹形式' : '支持图片、视频与活动包' }}
              </p>
            </div>

            <div v-else class="flex items-center justify-between gap-4 text-left">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-control bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                  <BaseIcon
                    :name="guessedType === 'IMAGE' ? 'image' : guessedType === 'VIDEO' ? 'video' : 'folder'"
                    :size="18"
                  />
                </div>
                <div class="min-w-0">
                  <p class="text-body font-medium text-neutral-900 truncate">{{ selectedFile.name }}</p>
                  <p class="text-micro text-neutral-500">
                    {{ formatBytes(selectedFile.size) }}
                    <template v-if="inspection?.actual"> · {{ mimeLabel(inspection.actual) }}</template>
                  </p>
                </div>
              </div>
              <button type="button" class="btn btn-secondary btn-sm shrink-0" @click.stop="clearFile">移除</button>
            </div>
          </div>

          <p v-if="inspecting" class="help-text">正在识别文件类型…</p>
          <p v-else-if="inspection?.unsupported" class="error-text">
            文件实际为 {{ mimeLabel(inspection.actual as string) }}，后台不支持该格式，请转换为 JPG / PNG / WebP / MP4 / MOV / WebM 或 ZIP 后再上传。
          </p>
          <p v-else-if="inspection?.mismatched" class="help-text">
            文件实际为 {{ mimeLabel(inspection.actual as string) }}，与扩展名声明的
            {{ inspection.declared }} 不一致：将按实际类型上传，避免后端校验失败。
          </p>

          <p v-if="isLargeFile" class="help-text">
            文件较大（{{ formatBytes(selectedFile?.size) }}），大文件传输受后端与网关超时配置影响；若反复失败请压缩后再上传。
          </p>

          <p v-if="typeMismatch" class="error-text">当前分类不支持该文件类型，请更换分类或文件。</p>
          <p v-else-if="taskTypeMismatch" class="error-text">
            活动包必须是 ZIP 压缩包，当前文件被识别为
            {{ mimeLabel(inspection?.actual || selectedFile?.type || '未知类型') }}。
          </p>
          <input ref="fileInput" type="file" class="hidden" :accept="acceptTypes" @change="onFileChange" />
        </div>

        <!-- 进度 -->
        <div v-if="submitting" class="mt-5">
          <div class="flex items-center justify-between text-caption text-neutral-600">
            <span>{{ progressLabel }}</span>
            <span class="font-medium text-brand-600">{{ progress ?? 0 }}%</span>
          </div>
          <div class="mt-2 h-1.5 rounded-sm bg-neutral-100 overflow-hidden">
            <div class="h-full bg-brand-500 rounded-sm transition-all duration-200" :style="{ width: `${progress ?? 0}%` }" />
          </div>
        </div>

        <div class="mt-6 flex items-center justify-end gap-2">
          <button type="button" class="btn btn-secondary" :disabled="submitting" @click="router.push(mode === 'material' ? '/admin/assets' : '/admin/tasks')">
            取消
          </button>
          <button
            type="submit"
            class="btn btn-primary"
            :disabled="submitting || blockingMismatch || inspecting || inspection?.unsupported === true"
          >
            <svg
              v-if="submitting"
              class="animate-spin"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.4"
              stroke-linecap="round"
            >
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            <BaseIcon v-else :name="mode === 'material' ? 'upload' : 'clipboard'" :size="16" />
            {{
              submitting
                ? mode === 'material'
                  ? '入库中…'
                  : '发布中…'
                : mode === 'material'
                  ? '上传并入库'
                  : '上传并发布任务'
            }}
          </button>
        </div>
      </form>

      <!-- 说明 -->
      <aside class="space-y-4">
        <div class="card p-5">
          <h2 class="section-title">上传流程</h2>
          <ol class="mt-3 space-y-3 text-caption text-neutral-600">
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">1</span>
              创建上传会话并获取传输地址
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">2</span>
              以二进制流上传文件，实时显示进度
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">3</span>
              提交校验文件完整性（大小与类型）
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">4</span>
              {{ mode === 'material' ? '创建素材草稿，随后可上架' : '创建任务与本次活动包' }}
            </li>
          </ol>
        </div>

        <div class="card p-5 bg-feedback-info-bg border-transparent">
          <div class="flex items-center gap-2 text-feedback-info">
            <BaseIcon name="shield" :size="16" />
            <span class="text-caption font-medium">存储说明</span>
          </div>
          <p class="mt-2 text-caption text-feedback-info/85 leading-[18px]">
            新文件统一存入 OSS；若 OSS 未配置，上传会返回 503，请联系运维检查存储配置。
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
