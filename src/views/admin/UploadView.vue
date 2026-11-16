<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminAssetApi, adminTaskApi, categoryApi } from '../../api'
import type { AssetType, Category, CategoryCode } from '../../api/types'
import { makeRequestId, runUpload } from '../../composables/useUpload'
import { useToast } from '../../composables/useToast'
import { formatBytes, toApiDateTime } from '../../utils/format'
import { inspectFile, mimeLabel, type FileTypeInspection } from '../../utils/fileType'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import PageHeader from '../../components/ui/PageHeader.vue'

type Mode = 'material' | 'task'

/** 一次最多入库的素材数量：超出会让后端排队过久，也容易误选整个目录 */
const MAX_MATERIAL_FILES = 30
/** 超过 50MB 的文件更容易触发网关超时，提前提示 */
const LARGE_FILE_BYTES = 50 * 1024 * 1024

type EntryStatus = 'idle' | 'inspecting' | 'uploading' | 'done' | 'failed'

interface PickedFile {
  /** 本地去重键：同名同大小同修改时间视为同一个文件 */
  key: string
  file: File
  /** 素材名称，默认取文件名（去掉扩展名），可逐条修改 */
  name: string
  /** 文件头识别结果 */
  inspection: FileTypeInspection | null
  inspecting: boolean
  /** 本次上传使用的素材类型：按真实字节识别 */
  type: AssetType
  /** 不能开始上传的原因（格式不支持 / 分类不允许），会禁用提交按钮 */
  error: string
  /** 上一次上传失败的原因：只用于展示，修正后可以直接重试 */
  failure: string
  /** 本地预览地址（图片/视频用于清单缩略图，ZIP 为空） */
  previewUrl: string
  /** 缩略图无法解码时退回类型图标 */
  thumbBroken: boolean
  /** 缩略图解码完成：用于淡入，避免列表一出现就「啪」地跳图 */
  thumbLoaded: boolean
  /** 队列状态：决定清单行的底色与状态文案 */
  status: EntryStatus
  /** 当前文件的上传百分比 */
  percent: number
}

const route = useRoute()
const router = useRouter()
const { success } = useToast()

const mode = ref<Mode>('material')
const categories = ref<Category[]>([])
/** 分类接口加载中：用于显示骨架，避免加载中被当成失败 */
const categoriesLoading = ref(true)
/** 分类加载失败的具体原因 */
const categoryError = ref('')
const submitting = ref(false)
const errorMessage = ref('')
/** 上一批上传结果的提示（成功后留在本页继续上传） */
const resultMessage = ref('')
/**
 * 入库后立即上架：创建草稿接口（POST /admin/assets）不接收状态，
 * 只能是「先建草稿、再逐个调 publish」，这里统一编排，省去入库后再去素材库一个个点。
 * 默认关闭：上架后小程序立刻可见，属于对外动作，需要显式勾选。
 */
const publishAfterUpload = ref(false)
/** 结果条右侧的去处（素材库 / 任务管理），随模式变化 */
const resultLink = ref<{ label: string; to: string } | null>(null)
/** 中性提示（例如自动忽略的文件夹条目） */
const noticeMessage = ref('')

const fileInput = ref<HTMLInputElement | null>(null)
const folderInput = ref<HTMLInputElement | null>(null)
const files = ref<PickedFile[]>([])
const dragging = ref(false)
/** 正在就地修改的素材名称（点击文件名进入编辑） */
const editingKey = ref('')

function startRename(item: PickedFile) {
  if (mode.value !== 'material' || submitting.value) return
  editingKey.value = item.key
}

function focusRename(el: unknown) {
  if (!(el instanceof HTMLInputElement)) return
  el.focus()
  el.select()
}

function finishRename() {
  editingKey.value = ''
}

const material = reactive({
  categoryCode: '' as CategoryCode | '',
})

const task = reactive({
  title: '',
  content: '',
  /** 领取截止时间（datetime-local），留空表示长期有效 */
  deadlineAt: '',
})

const allowedTypes = computed<AssetType[]>(() => {
  const category = categories.value.find((item) => item.code === material.categoryCode)
  return category?.allowedAssetTypes ?? ['IMAGE', 'VIDEO', 'ARCHIVE']
})

/** ARCHIVE 在素材模式是「ZIP 素材包」，在任务模式才是「活动包」 */
function typeLabel(type: AssetType): string {
  if (type === 'IMAGE') return '图片'
  if (type === 'VIDEO') return '视频'
  return mode.value === 'task' ? '活动包' : 'ZIP 素材包'
}

const allowedTypeNames = computed(() => allowedTypes.value.map((type) => typeLabel(type)).join(' / '))
const iconOfType = (type: AssetType) => (type === 'IMAGE' ? 'image' : type === 'VIDEO' ? 'video' : 'folder')

/** 分类按钮图标：四类分类与图标一一对应，未知分类退化为文件夹 */
const categoryIcon = (code: CategoryCode) =>
  code === 'IMAGE' ? 'image' : code === 'VIDEO' ? 'video' : code === 'COMPANY' ? 'building' : 'clipboard'

/** 分类按钮副标题：该分类允许上传的素材类型 */
const categoryTypesText = (category: Category) =>
  category.allowedAssetTypes.map((type) => typeLabel(type)).join(' · ')

/** 文件选择框的可选类型：任务包只放 ZIP，素材按当前分类放开 */
const acceptTypes = computed(() => {
  if (mode.value === 'task') return '.zip,application/zip'
  const accepts: string[] = []
  if (allowedTypes.value.includes('IMAGE')) accepts.push('image/*')
  if (allowedTypes.value.includes('VIDEO')) accepts.push('video/*')
  if (allowedTypes.value.includes('ARCHIVE')) accepts.push('.zip,application/zip')
  return accepts.join(',')
})

const fileLimit = computed(() => (mode.value === 'task' ? 1 : MAX_MATERIAL_FILES))
const inspectingAny = computed(() => files.value.some((item) => item.inspecting))
const hasFileError = computed(() => files.value.some((item) => Boolean(item.error)))
const totalBytes = computed(() => files.value.reduce((sum, item) => sum + item.file.size, 0))

/** 清单行底色：上传中浅粉、成功白底带描边、警告浅黄、失败浅红 */
function rowClass(item: PickedFile): string {
  if (item.status === 'failed') return 'bg-feedback-danger-bg/60'
  if (item.error) return 'bg-feedback-warning-bg/70'
  if (item.status === 'uploading') return 'bg-brand-50'
  if (item.status === 'done') return 'bg-neutral-0 border border-neutral-100'
  return 'bg-neutral-25'
}

/** 第二行「大小 · 状态」里的状态文案 */
function statusText(item: PickedFile): string {
  // 前置校验错误优先生效：它会把提交按钮禁用，行内必须说明原因
  if (item.error) return item.error
  if (item.status === 'failed') return item.failure || '上传失败'
  if (item.status === 'uploading') return item.percent >= 100 ? '正在校验…' : `上传中 ${item.percent}%`
  if (item.status === 'done') return '上传完成'
  if (item.status === 'inspecting' || item.inspecting) return '识别中…'
  return '待上传'
}

function statusClass(item: PickedFile): string {
  if (item.status === 'failed') return 'text-feedback-danger'
  if (item.error) return 'text-feedback-warning'
  if (item.status === 'uploading') return 'text-brand-600'
  if (item.status === 'done') return 'text-feedback-success'
  return 'text-neutral-500'
}

/**
 * 第二行中间的文件类型：图片/视频显示具体格式（JPEG 图片），
 * ZIP 统一用素材类型名（素材模式「ZIP 素材包」/ 任务模式「活动包」）。
 */
function fileTypeText(item: PickedFile): string {
  if (item.type === 'ARCHIVE') return typeLabel('ARCHIVE')
  const actual = item.inspection?.actual
  if (actual) return mimeLabel(actual)
  return typeLabel(item.type)
}

/** 素材与活动包允许的扩展名 */
const SUPPORTED_EXT = /\.(jpe?g|png|webp|gif|bmp|heic|avif|svg|mp4|mov|webm|avi|mkv|zip)$/i

/**
 * 拖拽目录时浏览器会把文件夹本身也作为一个 File 抛出（无扩展名、无 MIME、
 * size 等于整个文件夹大小），这类条目无法上传，直接过滤。
 */
function isDirectoryLike(file: File): boolean {
  return file.type === '' && !SUPPORTED_EXT.test(file.name)
}

function mimeGuessType(mime: string, filename: string): AssetType {
  if (mime.startsWith('image/')) return 'IMAGE'
  if (mime.startsWith('video/')) return 'VIDEO'
  if (mime === 'application/zip') return 'ARCHIVE'
  if (/\.(jpe?g|png|webp|gif|bmp|heic|avif|svg)$/i.test(filename)) return 'IMAGE'
  if (/\.(mp4|mov|webm|avi|mkv)$/i.test(filename)) return 'VIDEO'
  return 'ARCHIVE'
}

function fallbackMimeOf(type: AssetType): string {
  if (type === 'IMAGE') return 'image/jpeg'
  if (type === 'VIDEO') return 'video/mp4'
  return 'application/zip'
}

/** 逐文件重新校验：格式是否受后端支持、分类是否允许该类型 */
function validateEntry(entry: PickedFile) {
  entry.error = ''
  if (entry.inspecting) return
  if (entry.inspection?.unsupported) {
    entry.error = `暂不支持 ${mimeLabel(entry.inspection.actual as string)} 格式，请转为 JPG / PNG / WebP / MP4 / MOV / WebM 或 ZIP`
    return
  }
  if (mode.value === 'material' && !allowedTypes.value.includes(entry.type)) {
    entry.error = `当前分类不支持${typeLabel(entry.type)}，请更换分类或移除该文件`
    return
  }
  if (mode.value === 'task' && entry.type !== 'ARCHIVE') {
    entry.error = '活动包必须是 ZIP 压缩包（.zip），请重新选择文件'
  }
}

function revalidateAll() {
  files.value.forEach((entry) => validateEntry(entry))
}

watch([() => material.categoryCode, mode], () => revalidateAll())

async function inspectEntry(key: string) {
  const entry = files.value.find((item) => item.key === key)
  if (!entry) return
  const fallbackType = mimeGuessType(entry.file.type, entry.file.name)
  entry.type = fallbackType
  const result = await inspectFile(entry.file, fallbackMimeOf(fallbackType))
  const target = files.value.find((item) => item.key === key)
  if (!target) return
  target.inspection = result
  target.type = mimeGuessType(result.mimeType, target.file.name)
  target.inspecting = false
  validateEntry(target)
  // 识别完成后回到待上传（失败项重试前也走这里）
  if (target.status === 'inspecting') target.status = 'idle'
}

function addFiles(list: File[]) {
  if (submitting.value || list.length === 0) return
  errorMessage.value = ''
  resultMessage.value = ''
  resultLink.value = null
  noticeMessage.value = ''

  // 拖拽文件夹时浏览器可能把文件夹本身也塞进来（无扩展名、无 MIME），直接过滤掉
  const usable = list.filter((file) => !isDirectoryLike(file))
  const skipped = list.length - usable.length
  if (skipped > 0) {
    noticeMessage.value = `已自动忽略 ${skipped} 个文件夹条目，只处理其中的图片、视频与 ZIP`
  }
  if (usable.length === 0) {
    noticeMessage.value = '拖入的是文件夹，但没有读到可上传的文件，可以改用「选择文件夹」再试一次'
    return
  }

  if (mode.value === 'task' && usable.length > 1) {
    errorMessage.value = '活动包一次只能上传一个 ZIP，已保留第一个文件'
  }

  const limit = fileLimit.value
  const accepted: File[] = []
  for (const file of usable) {
    if (files.value.length + accepted.length >= limit) {
      errorMessage.value = `单次最多上传 ${limit} 个文件，多余的已忽略`
      break
    }
    const key = `${file.name}:${file.size}:${file.lastModified}`
    if (files.value.some((item) => item.key === key)) continue
    if (accepted.some((item) => `${item.name}:${item.size}:${item.lastModified}` === key)) continue
    accepted.push(file)
  }
  if (accepted.length === 0) return

  const entries: PickedFile[] = accepted.map((file) => ({
    key: `${file.name}:${file.size}:${file.lastModified}`,
    file,
    name: file.name.replace(/\.[^.]+$/, ''),
    inspection: null,
    inspecting: true,
    type: mimeGuessType(file.type, file.name),
    error: '',
    failure: '',
    previewUrl: createPreviewUrl(file),
    thumbBroken: false,
    thumbLoaded: false,
    status: 'inspecting',
    percent: 0,
  }))
  files.value = [...files.value, ...entries]
  entries.forEach((entry) => void inspectEntry(entry.key))
}

/** 图片/视频用本地 blob 直接出缩略图，ZIP 只显示类型图标 */
function createPreviewUrl(file: File): string {
  if (file.type === 'application/zip' || /\.zip$/i.test(file.name)) return ''
  return URL.createObjectURL(file)
}

function releasePreview(entry: PickedFile) {
  if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
}

/** 视频缩略图取首帧：blob 地址支持 Range，seek 后浏览器才会绘制画面 */
function seekThumb(event: Event) {
  const video = event.target as HTMLVideoElement
  if (video.dataset.seeked) return
  video.dataset.seeked = '1'
  try {
    video.currentTime = Math.min(0.2, (video.duration || 0) / 10)
  } catch {
    /* 忽略：无法 seek 时保留浏览器已解码的帧 */
  }
}

function pickFile() {
  if (submitting.value) return
  fileInput.value?.click()
}

function pickFolder() {
  if (submitting.value) return
  folderInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles([...(input.files ?? [])])
  input.value = ''
}

/** 拖入目录时最多扫描的文件数，避免误拖巨大文件夹把页面卡住 */
const MAX_SCAN_FILES = 200

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve) => {
    const all: FileSystemEntry[] = []
    const read = () => {
      reader.readEntries(
        (batch) => {
          if (batch.length === 0) {
            resolve(all)
            return
          }
          all.push(...batch)
          read()
        },
        () => resolve(all),
      )
    }
    read()
  })
}

async function walkEntry(
  entry: FileSystemEntry,
  out: Array<{ file: File; path: string }>,
  counter: { scanned: number },
): Promise<void> {
  if (counter.scanned >= MAX_SCAN_FILES || out.length >= MAX_SCAN_FILES) return

  if (entry.isFile) {
    counter.scanned += 1
    const file = await new Promise<File | null>((resolve) => {
      ;(entry as FileSystemFileEntry).file(
        (result) => resolve(result),
        () => resolve(null),
      )
    })
    if (file) out.push({ file, path: entry.fullPath || file.name })
    return
  }

  // 目录最多展开 4 层，够覆盖「活动包/分类/日期/文件」这类常见结构
  if (!entry.isDirectory || entry.fullPath.split('/').filter(Boolean).length > 4) return
  const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader())
  for (const child of children) await walkEntry(child, out, counter)
}

/** 从拖拽数据取文件：拖入文件夹时递归读取其中的文件，并按路径顺序排好 */
async function filesFromDrop(dt: DataTransfer): Promise<{ files: File[]; scanned: number }> {
  const entries = [...dt.items]
    .map((item) => (item.kind === 'file' ? (item.webkitGetAsEntry?.() ?? null) : null))
    .filter((entry): entry is FileSystemEntry => entry !== null)

  if (entries.length === 0) return { files: [...dt.files], scanned: dt.files.length }

  const collected: Array<{ file: File; path: string }> = []
  const counter = { scanned: 0 }
  for (const entry of entries) await walkEntry(entry, collected, counter)
  collected.sort((a, b) => a.path.localeCompare(b.path, 'zh-Hans-CN', { numeric: true }))
  return { files: collected.map((item) => item.file), scanned: counter.scanned }
}

async function onDrop(event: DragEvent) {
  dragging.value = false
  if (!event.dataTransfer || submitting.value) return

  try {
    const { files: dropped, scanned } = await filesFromDrop(event.dataTransfer)
    if (dropped.length === 0) {
      errorMessage.value = '没有从拖入内容里读到可上传的文件，试试用「选择文件 / 选择文件夹」'
      return
    }
    addFiles(dropped)

    if (scanned >= MAX_SCAN_FILES) {
      const note = `文件夹内容较多，本次只读取了前 ${MAX_SCAN_FILES} 个文件`
      errorMessage.value = errorMessage.value ? `${errorMessage.value}；${note}` : note
    }
  } catch {
    errorMessage.value = '读取拖入内容失败，请改用「选择文件 / 选择文件夹」'
  }
}

function removeFile(key: string) {
  const target = files.value.find((item) => item.key === key)
  if (target) releasePreview(target)
  files.value = files.value.filter((item) => item.key !== key)
}

function clearFiles() {
  files.value.forEach(releasePreview)
  files.value = []
  errorMessage.value = ''
}

function switchMode(next: Mode) {
  if (mode.value === next || submitting.value) return
  mode.value = next
  errorMessage.value = ''
  resultMessage.value = ''
  resultLink.value = null
  noticeMessage.value = ''
  // 任务包只接受单个 ZIP，切换模式时清掉素材清单避免误上传
  clearFiles()
}

onBeforeUnmount(() => files.value.forEach(releasePreview))

const largeFiles = computed(() => files.value.filter((item) => item.file.size > LARGE_FILE_BYTES))

function validate(): string {
  if (files.value.length === 0) return mode.value === 'task' ? '请选择活动包 ZIP 文件' : '请选择要上传的文件'
  if (inspectingAny.value) return '正在识别文件类型，请稍候'
  const broken = files.value.find((item) => item.error)
  if (broken) return broken.error
  if (mode.value === 'material') {
    if (!material.categoryCode) return '请选择素材分类'
    if (files.value.some((item) => !item.name.trim())) return '请为每个素材填写名称'
    if (files.value.length > MAX_MATERIAL_FILES) return `单次最多上传 ${MAX_MATERIAL_FILES} 个素材`
  } else {
    if (files.value.length > 1) return '活动包一次只能上传一个 ZIP'
    if (!task.title.trim()) return '请填写任务标题'
    if (!task.content.trim()) return '请填写任务内容'
  }
  return ''
}

const canSubmit = computed(() => {
  if (submitting.value || files.value.length === 0) return false
  if (inspectingAny.value || hasFileError.value) return false
  if (mode.value === 'material') {
    return Boolean(material.categoryCode) && files.value.every((item) => item.name.trim().length > 0)
  }
  return files.value.length === 1 && Boolean(task.title.trim()) && Boolean(task.content.trim())
})

const submitLabel = computed(() => {
  if (submitting.value) {
    if (mode.value === 'task') return '发布中…'
    return publishAfterUpload.value ? '上传并上架中…' : '入库中…'
  }
  if (mode.value === 'task') return '上传并发布任务'
  const verb = publishAfterUpload.value ? '上架小程序' : '入库'
  return files.value.length > 1 ? `上传并${verb}（${files.value.length}）` : `上传并${verb}`
})

async function submitMaterial() {
  errorMessage.value = validate()
  if (errorMessage.value) return

  const targets = [...files.value]
  submitting.value = true
  let done = 0
  let published = 0
  /** 已入库但上架失败的名字：不能进失败重试，否则会重复入库 */
  const publishFailed: string[] = []
  const failedKeys: string[] = []

  // 重试前清掉上一次的失败标记
  targets.forEach((item) => {
    item.error = ''
    item.failure = ''
    item.status = 'idle'
    item.percent = 0
  })

  for (let index = 0; index < targets.length; index += 1) {
    const entry = targets[index]
    entry.status = 'uploading'
    entry.percent = 0
    try {
      const session = await runUpload({
        file: entry.file,
        purpose: 'MATERIAL',
        categoryCode: material.categoryCode as CategoryCode,
        assetType: entry.type,
        mimeType: entry.inspection?.mimeType,
        onProgress: (value) => {
          entry.percent = value
        },
      })
      const created = await adminAssetApi.create({
        name: entry.name.trim(),
        uploadSessionId: session.id,
      })
      if (publishAfterUpload.value) {
        try {
          await adminAssetApi.publish(created.assetId)
          published += 1
        } catch {
          // 素材已入库，只是上架没成功：不计入失败重试，否则重试会重复入库
          publishFailed.push(entry.name.trim())
        }
      }
      entry.status = 'done'
      entry.percent = 100
      done += 1
    } catch (error) {
      entry.status = 'failed'
      entry.percent = 0
      // 不写进 error：那是不允许上传的前置校验，会把提交按钮永久禁用、退不掉
      entry.failure = error instanceof Error ? error.message : '入库失败，请重试'
      failedKeys.push(entry.key)
    }
  }

  submitting.value = false

  if (failedKeys.length > 0) {
    // 只留失败项继续重试，已成功项的本地预览地址要释放，否则每批都在漏 blob
    const failed = files.value.filter((item) => failedKeys.includes(item.key))
    files.value.forEach((item) => {
      if (!failedKeys.includes(item.key)) releasePreview(item)
    })
    files.value = failed
    errorMessage.value = `${done} 个素材已入库，${failedKeys.length} 个失败（原因见对应文件行），修正后可直接重试`
    noticeMessage.value =
      publishFailed.length > 0
        ? `另有 ${publishFailed.length} 个素材已入库但上架失败（${publishFailed.join('、')}），请到素材库手动上架`
        : ''
    resultMessage.value = ''
    return
  }

  // 成功后留在本页：清空已入库的清单，方便接着选下一批
  clearFiles()
  resultLink.value = { label: '查看素材库', to: '/admin/assets' }
  if (publishAfterUpload.value) {
    resultMessage.value =
      publishFailed.length > 0
        ? `已入库 ${done} 个素材，其中 ${published} 个已上架；${publishFailed.length} 个上架失败（${publishFailed.join('、')}），请到素材库手动上架`
        : `已入库并上架 ${done} 个素材，小程序现在就能看到`
    success(publishFailed.length > 0 ? `已入库 ${done} 个素材，${published} 个已上架` : `已入库并上架 ${done} 个素材`)
  } else {
    resultMessage.value = `已入库 ${done} 个素材，可继续上传，或前往素材库上架`
    success(`已入库 ${done} 个素材`)
  }
}

async function submitTask() {
  errorMessage.value = validate()
  const file = files.value[0]
  if (errorMessage.value || !file) return

  submitting.value = true
  file.status = 'uploading'
  file.percent = 0
  try {
    const session = await runUpload({
      file: file.file,
      purpose: 'TASK_PACKAGE',
      categoryCode: 'CAMPAIGN',
      // 后端要求任务包固定为 CAMPAIGN + ARCHIVE
      assetType: 'ARCHIVE',
      mimeType: file.inspection?.mimeType,
      onProgress: (value) => {
        file.percent = value
      },
    })

    const result = await adminTaskApi.create({
      requestId: makeRequestId('task'),
      title: task.title.trim(),
      content: task.content.trim(),
      uploadSessionId: session.id,
      deadlineAt: task.deadlineAt ? toApiDateTime(task.deadlineAt) : undefined,
    })

    file.status = 'done'
    file.percent = 100
    success('任务已发布')
    // 与素材入库一致：留在本页，清空表单方便接着发布下一个活动包
    clearFiles()
    task.title = ''
    task.content = ''
    task.deadlineAt = ''
    resultMessage.value = '任务已发布，可继续发布下一个活动包，或前往任务管理查看领取情况'
    resultLink.value = { label: '查看任务', to: `/admin/tasks/${result.taskId}` }
  } catch (error) {
    file.status = 'failed'
    file.percent = 0
    errorMessage.value = error instanceof Error ? error.message : '任务发布失败，请重试'
  } finally {
    submitting.value = false
  }
}

function submit() {
  if (mode.value === 'material') submitMaterial()
  else submitTask()
}

async function loadCategories(force = false) {
  categoriesLoading.value = true
  categoryError.value = ''
  try {
    const res = await categoryApi.list({ force })
    categories.value = res.items
    if (res.items.length === 0) categoryError.value = '后端没有返回可用分类，请联系管理员'
    // 不再默认选中第一个分类：分类必须由用户显式点选，避免沿用默认值把视频/公司素材传错分类
    if (material.categoryCode && !res.items.some((item) => item.code === material.categoryCode)) {
      material.categoryCode = ''
    }
  } catch (error) {
    categories.value = []
    // 把真实原因透出来（超时 / 401 / 502），否则只能盲猜
    categoryError.value = error instanceof Error ? error.message : '分类加载失败，请重试'
  } finally {
    categoriesLoading.value = false
  }
}

onMounted(() => {
  if (route.query.mode === 'task') mode.value = 'task'
  loadCategories()
})
</script>

<template>
  <div class="animate-fade-up">
    <PageHeader title="素材入库" subtitle="上传图片、视频、ZIP 素材包或活动包，文件由 OSS 托管并受控分发" />

    <!-- 模式切换 -->
    <div class="flex items-center gap-2 mb-5">
      <button
        type="button"
        class="flex items-center gap-2 h-11 px-5 rounded-control text-body font-medium transition-colors duration-fast"
        :class="mode === 'material' ? 'bg-brand-100 text-brand-600' : 'bg-neutral-0 text-neutral-600 border border-neutral-200 hover:bg-neutral-50'"
        @click="switchMode('material')"
      >
        <BaseIcon name="image" :size="16" />
        上传素材
      </button>
      <button
        type="button"
        class="flex items-center gap-2 h-11 px-5 rounded-control text-body font-medium transition-colors duration-fast"
        :class="mode === 'task' ? 'bg-brand-100 text-brand-600' : 'bg-neutral-0 text-neutral-600 border border-neutral-200 hover:bg-neutral-50'"
        @click="switchMode('task')"
      >
        <BaseIcon name="clipboard" :size="16" />
        上传活动包并发布任务
      </button>
    </div>

    <div
      class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]
        3xl:grid-cols-[minmax(0,1fr)_420px] items-start"
    >
      <!-- 表单 -->
      <form class="card p-6 sm:p-8" @submit.prevent="submit">
        <div v-if="errorMessage" role="alert" class="mb-4 flex items-start gap-2 rounded-control bg-feedback-danger-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-on-danger">
          <BaseIcon name="alert" :size="18" class="mt-px" />
          <span>{{ errorMessage }}</span>
        </div>

        <div
          v-if="noticeMessage"
          class="mb-4 flex items-start gap-2 rounded-control bg-feedback-info-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-info"
        >
          <BaseIcon name="info" :size="18" class="mt-px" />
          <span>{{ noticeMessage }}</span>
        </div>

        <div
          v-if="resultMessage"
          role="status"
          class="mb-4 flex items-center gap-2 rounded-control bg-feedback-success-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-success"
        >
          <BaseIcon name="check" :size="18" />
          <span class="flex-1">{{ resultMessage }}</span>
          <button
            type="button"
            class="btn btn-ghost btn-sm shrink-0 text-feedback-success hover:bg-neutral-0/60"
            @click="router.push(resultLink?.to ?? '/admin/assets')"
          >
            <BaseIcon name="arrow-right" :size="14" />
            {{ resultLink?.label ?? '查看素材库' }}
          </button>
        </div>

        <div v-if="mode === 'material'" class="space-y-6">
          <div>
            <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 class="section-title">基础信息</h2>
              <p class="text-micro text-neutral-400">分类决定可上传的文件类型，请先选择</p>
            </div>
            <div class="mt-4">
              <p class="label">素材分类</p>
              <div
                v-if="categories.length > 0"
                class="grid grid-cols-2 gap-2.5 xl:grid-cols-4"
                role="radiogroup"
                aria-label="素材分类"
              >
                <button
                  v-for="category in categories"
                  :key="category.code"
                  type="button"
                  role="radio"
                  :aria-checked="material.categoryCode === category.code"
                  class="flex items-center gap-3 rounded-control border px-4 py-3 text-left transition-all duration-fast"
                  :class="
                    material.categoryCode === category.code
                      ? 'border-brand-400 bg-brand-50 shadow-e1'
                      : 'border-neutral-200 bg-neutral-0 hover:border-brand-200 hover:bg-neutral-50'
                  "
                  @click="material.categoryCode = category.code"
                >
                  <span
                    class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control"
                    :class="
                      material.categoryCode === category.code
                        ? 'bg-brand-100 text-brand-600'
                        : 'bg-neutral-100 text-neutral-500'
                    "
                  >
                    <BaseIcon :name="categoryIcon(category.code)" :size="18" />
                  </span>
                  <span class="min-w-0 flex-1">
                    <span
                      class="block truncate text-caption font-medium"
                      :class="
                        material.categoryCode === category.code ? 'text-brand-700' : 'text-neutral-700'
                      "
                    >
                      {{ category.name }}
                    </span>
                    <span class="mt-0.5 block truncate text-micro text-neutral-400">
                      {{ categoryTypesText(category) }}
                    </span>
                  </span>
                  <BaseIcon
                    v-if="material.categoryCode === category.code"
                    name="check"
                    :size="14"
                    class="shrink-0 text-brand-600"
                  />
                </button>
              </div>
              <!-- 加载中：骨架占位，避免和「加载失败」混淆 -->
              <div v-else-if="categoriesLoading" class="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                <div
                  v-for="index in 4"
                  :key="index"
                  class="rounded-control border border-neutral-100 px-4 py-3"
                >
                  <div class="skeleton h-3.5 w-20" />
                  <div class="skeleton mt-2 h-3 w-28" />
                </div>
              </div>

              <div
                v-else
                class="flex flex-wrap items-center gap-3 rounded-control border border-feedback-danger/30 bg-feedback-danger-bg px-3.5 py-3"
              >
                <BaseIcon name="alert" :size="16" class="shrink-0 text-feedback-danger" />
                <p class="min-w-0 flex-1 text-micro leading-[16px] text-feedback-on-danger">
                  {{ categoryError || '分类加载失败，请重试' }}
                </p>
                <button type="button" class="btn-row is-danger shrink-0" @click="loadCategories(true)">
                  重试
                </button>
              </div>
              <p class="help-text">
                <template v-if="material.categoryCode">当前分类可上传：{{ allowedTypeNames }}；</template>
                <template v-else>请先选择素材分类；</template>
                文件类型按实际内容自动识别，一次最多 {{ MAX_MATERIAL_FILES }} 个。
              </p>
            </div>
          </div>

          <!-- 入库后是否立即上架：一次勾选整批处理，省去入库后再逐个上架 -->
          <div class="rounded-control border border-neutral-100 bg-neutral-25 px-4 py-3.5">
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0">
                <p class="text-body font-medium text-neutral-900">是否直接上架小程序</p>
                <p class="mt-1 text-micro leading-[16px] text-neutral-500">
                  开启：上传完成并上架，小程序立刻可见内容；关闭：先存为草稿，之后可在素材管理里手动上架。
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="publishAfterUpload"
                :title="publishAfterUpload ? '关闭后入库为草稿' : '开启后上传完成即上架小程序'"
                class="relative mt-0.5 h-6 w-11 shrink-0 rounded-pill transition-colors duration-fast ease-standard
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2"
                :class="publishAfterUpload ? 'bg-brand-500' : 'bg-neutral-300'"
                @click="publishAfterUpload = !publishAfterUpload"
              >
                <span class="sr-only">是否直接上架小程序</span>
                <span
                  class="absolute left-0.5 top-0.5 h-5 w-5 rounded-pill bg-white shadow-sm transition-transform duration-fast ease-standard"
                  :class="publishAfterUpload ? 'translate-x-5' : 'translate-x-0'"
                />
              </button>
            </div>
          </div>
        </div>

        <div v-else class="space-y-6">
          <h2 class="section-title">任务信息</h2>
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

          <div>
            <label class="label" for="task-deadline">领取截止时间（可选）</label>
            <input id="task-deadline" v-model="task.deadlineAt" class="input" type="datetime-local" />
            <p class="help-text">
              留空表示长期有效；到期后员工无法领取，已领取的员工仍可下载已上架素材。
            </p>
          </div>
        </div>

        <!-- 文件选择 -->
        <div class="mt-8 pt-6 border-t border-neutral-100">
          <div class="flex items-center justify-between gap-3">
            <h2 class="section-title">{{ mode === 'task' ? '活动包文件' : '文件清单' }}</h2>
            <div v-if="files.length > 0" class="flex items-center gap-3">
              <span class="text-micro text-neutral-500">
                已选文件 {{ files.length }} · 共 {{ formatBytes(totalBytes) }}
              </span>
              <button
                type="button"
                class="text-micro text-brand-600 transition-colors hover:text-brand-700 disabled:opacity-40"
                :disabled="submitting"
                @click="clearFiles"
              >
                清空列表
              </button>
            </div>
          </div>

          <div
            class="relative mt-4 rounded-card border-2 border-dashed px-5 text-center transition-colors cursor-pointer"
            :class="[
              dragging ? 'border-brand-400 bg-brand-50' : 'border-neutral-200 bg-neutral-25 hover:border-brand-300',
              files.length > 0 ? 'py-4' : 'py-14',
            ]"
            role="button"
            tabindex="0"
            @click="pickFile"
            @keydown.enter="pickFile"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop.prevent="onDrop"
          >
            <div v-if="files.length === 0" class="flex flex-col items-center gap-3 text-neutral-500">
              <div
                class="flex h-16 w-16 items-center justify-center rounded-2xl border border-neutral-100 bg-neutral-0 text-neutral-400 shadow-e1"
              >
                <BaseIcon name="upload" :size="26" />
              </div>
              <p class="text-body-lg text-neutral-700">点击选择文件，或拖拽到此处</p>
              <p class="max-w-[420px] text-caption text-neutral-400">
                {{
                  mode === 'task'
                    ? '活动包请压缩为 ZIP，发布后自动解压出包内图片与视频'
                    : '支持图片、视频与 ZIP 素材包，可多选，也可以把整个文件夹拖进来'
                }}
              </p>
              <button
                v-if="mode === 'material'"
                type="button"
                class="btn btn-secondary btn-sm mt-1"
                :disabled="submitting"
                @click.stop="pickFolder"
              >
                <BaseIcon name="folder" :size="14" />
                选择整个文件夹
              </button>
            </div>

            <div v-else class="flex flex-wrap items-center justify-center gap-3 text-neutral-500">
              <span class="inline-flex items-center gap-1.5">
                <BaseIcon name="plus" :size="14" />
                <span class="text-caption">{{ mode === 'task' ? '重新选择 ZIP' : '继续添加文件' }}</span>
              </span>
              <template v-if="mode === 'material'">
                <span class="h-3 w-px bg-neutral-200" />
                <button
                  type="button"
                  class="inline-flex items-center gap-1 text-caption text-brand-600 transition-colors hover:text-brand-700"
                  :disabled="submitting"
                  @click.stop="pickFolder"
                >
                  <BaseIcon name="folder" :size="13" />
                  选择文件夹
                </button>
              </template>
            </div>

          </div>

          <!-- 已选文件清单：一行一个文件，底色表达队列状态 -->
          <ul v-if="files.length > 0" class="mt-3 space-y-2">
            <li
              v-for="item in files"
              :key="item.key"
              class="group flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors"
              :class="rowClass(item)"
            >
              <div class="relative w-10 h-10 shrink-0 rounded-sm overflow-hidden border border-neutral-100/80 bg-white flex items-center justify-center">
                <BaseIcon
                  v-if="!item.previewUrl || item.thumbBroken"
                  :name="iconOfType(item.type)"
                  :size="16"
                  class="text-brand-400"
                />
                <img
                  v-if="item.previewUrl && !item.thumbBroken && item.type === 'IMAGE'"
                  :src="item.previewUrl"
                  alt=""
                  class="absolute inset-0 w-full h-full object-cover bg-white"
                  :class="item.thumbLoaded ? 'animate-fade-in' : 'opacity-0'"
                  @load="item.thumbLoaded = true"
                  @error="item.thumbBroken = true"
                />
                <video
                  v-else-if="item.previewUrl && !item.thumbBroken && item.type === 'VIDEO'"
                  :src="item.previewUrl"
                  class="absolute inset-0 w-full h-full object-cover bg-neutral-900"
                  muted
                  playsinline
                  preload="metadata"
                  @loadeddata="seekThumb($event)"
                  @error="item.thumbBroken = true"
                />
              </div>

              <div class="min-w-0 flex-1">
                <input
                  v-if="editingKey === item.key"
                  :ref="focusRename"
                  v-model="item.name"
                  class="w-full rounded-sm border border-brand-300 bg-neutral-0 px-1.5 py-0.5 text-caption text-neutral-900 focus:outline-none"
                  type="text"
                  maxlength="200"
                  :aria-label="`${item.file.name} 的素材名称`"
                  @blur="finishRename"
                  @keydown.enter.prevent="finishRename"
                  @keydown.esc.prevent="finishRename"
                />
                <p
                  v-else
                  class="truncate text-caption font-medium text-neutral-900"
                  :class="mode === 'material' ? 'cursor-text hover:text-brand-600' : ''"
                  :title="mode === 'material' ? `点击修改素材名称（原文件 ${item.file.name}）` : item.file.name"
                  @click="startRename(item)"
                >
                  {{ mode === 'material' ? item.name : item.file.name }}
                </p>
                <p class="mt-0.5 flex min-w-0 items-center gap-1 text-micro">
                  <span class="shrink-0 text-neutral-500">{{ formatBytes(item.file.size) }}</span>
                  <span class="shrink-0 text-neutral-300">·</span>
                  <span class="shrink-0 text-neutral-500">{{ fileTypeText(item) }}</span>
                  <span class="shrink-0 text-neutral-300">·</span>
                  <span
                    class="truncate"
                    :class="statusClass(item)"
                    :title="item.error || statusText(item)"
                  >
                    {{ statusText(item) }}
                  </span>
                </p>
              </div>

              <button
                type="button"
                class="w-7 h-7 shrink-0 inline-flex items-center justify-center rounded-sm text-neutral-400 opacity-0 transition-all
                  hover:bg-neutral-0/70 hover:text-feedback-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-30"
                :disabled="submitting"
                :title="`移除 ${item.file.name}`"
                @click="removeFile(item.key)"
              >
                <BaseIcon name="close" :size="14" />
              </button>
            </li>
          </ul>

          <p v-if="largeFiles.length > 0" class="help-text">
            {{ largeFiles.length }} 个文件超过 50MB，大文件传输受后端与网关超时配置影响；若反复失败请压缩后再上传。
          </p>
          <input
            ref="fileInput"
            type="file"
            class="hidden"
            :accept="acceptTypes"
            :multiple="mode === 'material'"
            @change="onFileChange"
          />
          <!-- 选择整个文件夹（仅素材模式，任务包只接受单个 ZIP） -->
          <input
            v-if="mode === 'material'"
            ref="folderInput"
            type="file"
            class="hidden"
            multiple
            webkitdirectory
            @change="onFileChange"
          />
        </div>

        <div class="mt-8 flex items-center justify-end gap-3">
          <button
            type="button"
            class="btn btn-secondary btn-lg px-6"
            :disabled="submitting"
            @click="router.push(mode === 'material' ? '/admin/assets' : '/admin/tasks')"
          >
            取消
          </button>
          <button type="submit" class="btn btn-primary btn-lg px-8" :disabled="!canSubmit">
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
            {{ submitLabel }}
          </button>
        </div>
      </form>

      <!-- 说明 -->
      <aside class="space-y-4 lg:sticky lg:top-[88px]">
        <div class="card p-6">
          <h2 class="section-title">{{ mode === 'material' ? '入库流程' : '发布流程' }}</h2>

          <ol v-if="mode === 'material'" class="mt-4 space-y-3.5 text-caption text-neutral-600 leading-[20px]">
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">1</span>
              <span>先选素材分类，再拖入或选取文件；也可以直接选整个文件夹批量导入。</span>
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">2</span>
              <span>系统自动识别格式与类型；点文件名可改小程序里看到的名字。</span>
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">3</span>
              <span>点「上传并上架小程序」，按清单顺序逐个上传，每行实时显示进度。</span>
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">4</span>
              <span>开启「是否直接上架小程序」时上传完成即上架；关闭则存为「草稿」，需到素材管理上架，小程序才能看到并下载。</span>
            </li>
          </ol>

          <ol v-else class="mt-4 space-y-3.5 text-caption text-neutral-600 leading-[20px]">
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">1</span>
              <span>填写任务标题与内容，可设置领取截止时间；小程序领取页看到的就是这两段文字。</span>
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">2</span>
              <span>上传活动包 ZIP，一次一个；包内放要分发的图片或视频。</span>
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">3</span>
              <span>点「上传并发布任务」，上传完成后自动创建任务，结果条里可直接进入任务详情。</span>
            </li>
            <li class="flex gap-3">
              <span class="w-5 h-5 shrink-0 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">4</span>
              <span>员工领取后可查看、下载包内素材；到期后无法领取，已领取的仍可下载。</span>
            </li>
          </ol>

          <p class="mt-4 border-t border-neutral-100 pt-3 text-micro text-neutral-400 leading-[18px]">
            <template v-if="mode === 'material'">
              单次最多 {{ MAX_MATERIAL_FILES }} 个文件；单个失败不影响其它文件，失败项会留在清单里，修正后可直接重试。
            </template>
            <template v-else>
              上传后自动归入「活动素材」分类；发布后可在任务管理查看领取人数与截止时间，下载明细见下载记录。
            </template>
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
