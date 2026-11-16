<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { adminTaskApi } from '../../api'
import { ApiError } from '../../api/client'
import type { Asset, Claim, TaskDetail } from '../../api/types'
import { useBatchPreviews } from '../../composables/useBatchPreviews'
import { useToast } from '../../composables/useToast'
import { THUMB_AUTO_MAX_BYTES } from '../../utils/asset'
import {
  assetTypeLabel,
  formatBytes,
  formatDateTime,
  formatPhone,
  toApiDateTime,
  toInputDateTime,
} from '../../utils/format'
import BaseIcon from '../../components/ui/BaseIcon.vue'
import BaseModal from '../../components/ui/BaseModal.vue'
import EmptyState from '../../components/ui/EmptyState.vue'
import PaginationBar from '../../components/ui/PaginationBar.vue'

const route = useRoute()
const router = useRouter()

const task = ref<TaskDetail | null>(null)
const loading = ref(true)
const errorMessage = ref('')

const claims = ref<Claim[]>([])
const claimTotal = ref(0)
const claimPage = ref(1)
const claimPageSize = ref(10)
const claimLoading = ref(true)
const claimError = ref('')
const claimKeyword = ref('')

const taskId = String(route.params.id)

const contentLines = computed(() => (task.value?.content ? task.value.content.split('\n') : []))
/** 任务素材解压出的子素材数量（未解包时为 0） */
const childCount = computed(() => task.value?.activityAsset.children?.length ?? 0)

/** 任务素材封面与包内素材缩略图共用一份票据状态 */
const {
  thumbs,
  frames,
  load: loadThumbs,
  loadOne: loadThumbOne,
  reset: resetThumbs,
  markBroken,
  kindOf,
  revealFrame,
  markLoaded,
  isLoaded,
  showPlaceholder,
} = useBatchPreviews()

/** 右栏展示的前 4 个包内素材 */
const childSamples = computed(() => (task.value?.activityAsset.children ?? []).slice(0, 4))
const extraChildren = computed(() => Math.max(0, childCount.value - childSamples.value.length))

function ensureThumb(child: Asset) {
  if (thumbs.value[child.id]) return
  if (child.assetType === 'VIDEO' || child.fileSize > THUMB_AUTO_MAX_BYTES) {
    void loadThumbOne(child)
  }
}

/* ---------------- 领取截止时间 ---------------- */
const { success, error: toastError } = useToast()
const deadlineOpen = ref(false)
const deadlineInput = ref('')
const deadlineSubmitting = ref(false)

function openDeadline() {
  if (!task.value) return
  deadlineInput.value = toInputDateTime(task.value.deadlineAt)
  deadlineOpen.value = true
}

async function saveDeadline(value: string | null) {
  if (!task.value || deadlineSubmitting.value) return
  deadlineSubmitting.value = true
  try {
    const res = await adminTaskApi.setDeadline(taskId, value)
    task.value = { ...task.value, ...res }
    deadlineOpen.value = false
    success(value ? '领取截止时间已更新' : '已取消截止时间')
  } catch (error) {
    toastError(error instanceof Error ? error.message : '截止时间保存失败')
  } finally {
    deadlineSubmitting.value = false
  }
}

let keywordTimer: number | undefined
let claimSeq = 0

/** 关键词一变就回第 1 页重查：已在第 1 页才直接查，否则交给 claimPage 的 watcher，避免同一组参数发两次 */
function restartClaims() {
  if (claimPage.value === 1) loadClaims()
  else claimPage.value = 1
}

watch(claimKeyword, () => {
  window.clearTimeout(keywordTimer)
  keywordTimer = window.setTimeout(restartClaims, 380)
})

watch(claimPage, () => loadClaims())

async function loadTask() {
  loading.value = true
  errorMessage.value = ''
  try {
    task.value = await adminTaskApi.detail(taskId)
    // 一次请求同时拿封面与包内素材缩略图（任务素材本身是 ZIP，封面取包内第一个可见媒体）
    if (task.value?.activityAsset) {
      const asset = task.value.activityAsset
      loadThumbs([asset, ...(asset.children ?? [])])
    } else {
      resetThumbs()
    }
  } catch (error) {
    task.value = null
    resetThumbs()
    if (error instanceof ApiError && error.status === 404) errorMessage.value = '任务不存在'
    else errorMessage.value = error instanceof Error ? error.message : '任务详情加载失败'
  } finally {
    loading.value = false
  }
}

async function loadClaims() {
  const current = ++claimSeq
  claimLoading.value = true
  claimError.value = ''
  try {
    const res = await adminTaskApi.claims(taskId, {
      page: claimPage.value,
      pageSize: claimPageSize.value,
      keyword: claimKeyword.value.trim() || undefined,
    })
    if (current !== claimSeq) return
    claims.value = res.items
    claimTotal.value = res.total
  } catch (error) {
    if (current !== claimSeq) return
    claims.value = []
    claimTotal.value = 0
    claimError.value = error instanceof Error ? error.message : '领取明细加载失败'
  } finally {
    if (current === claimSeq) claimLoading.value = false
  }
}

onMounted(() => {
  loadTask()
  loadClaims()
})
</script>

<template>
  <!-- 内容宽度由路由 meta.wide 经 AppShell 统一控制，这里不要再加 mx-auto max-w -->
  <div class="animate-fade-up">
    <div class="flex items-center justify-between gap-3 mb-5">
      <button type="button" class="btn btn-secondary btn-sm" @click="router.push('/admin/tasks')">
        <BaseIcon name="arrow-left" :size="16" />
        返回任务管理
      </button>
      <button type="button" class="btn btn-secondary btn-sm" @click="loadTask(); loadClaims()">
        <BaseIcon name="refresh" :size="16" />
        刷新
      </button>
    </div>

    <div v-if="loading" class="space-y-4">
      <div class="card p-6 space-y-3">
        <div class="skeleton h-6 w-1/2" />
        <div class="skeleton h-3 w-1/3" />
        <div class="skeleton h-3 w-full" />
        <div class="skeleton h-3 w-full" />
      </div>
      <div class="card p-4 space-y-3">
        <div v-for="index in 4" :key="index" class="skeleton h-3 w-full" />
      </div>
    </div>

    <div v-else-if="!task" class="card">
      <EmptyState icon="alert" title="无法打开任务" :description="errorMessage">
        <template #action>
          <button type="button" class="btn btn-primary" @click="loadTask">重试</button>
        </template>
      </EmptyState>
    </div>

    <!-- 主内容 + 右侧任务素材：领取明细并入左栏，避免左短右长产生大片留白 -->
    <div
      v-else
      class="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px] items-start"
    >
      <div class="min-w-0 space-y-5">
        <section class="card p-6">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="badge badge-brand">#{{ task.id }}</span>
            <span class="badge badge-claimed">{{ task.claimCount }} 人已领取</span>
          </div>
          <h1 class="mt-3 text-h1 font-bold text-neutral-900">{{ task.title }}</h1>

          <!-- 元信息：把发布时间、领取人数、素材规模、分发状态摊开，避免标题下大片空白 -->
          <div class="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div class="rounded-control bg-neutral-25 px-3 py-2.5">
              <p class="text-micro text-neutral-400">发布时间</p>
              <p class="mt-0.5 truncate text-caption text-neutral-900">{{ formatDateTime(task.publishedAt) }}</p>
            </div>
            <div class="rounded-control bg-neutral-25 px-3 py-2.5">
              <p class="text-micro text-neutral-400">已领取</p>
              <p class="mt-0.5 text-caption text-neutral-900">{{ task.claimCount }} 人</p>
            </div>
            <div class="rounded-control bg-neutral-25 px-3 py-2.5">
              <p class="text-micro text-neutral-400">活动包</p>
              <p class="mt-0.5 truncate text-caption text-neutral-900">
                {{ childCount }} 个素材 · {{ formatBytes(task.activityAsset.fileSize) }}
              </p>
            </div>
            <div class="rounded-control bg-neutral-25 px-3 py-2.5">
              <p class="text-micro text-neutral-400">分发状态</p>
              <p
                class="mt-0.5 text-caption"
                :class="task.activityAsset.available ? 'text-feedback-success' : 'text-neutral-500'"
              >
                {{ task.activityAsset.available ? '可下载' : '已下架' }}
              </p>
            </div>
            <div class="col-span-2 rounded-control bg-neutral-25 px-3 py-2.5">
              <div class="flex items-center justify-between gap-2">
                <p class="text-micro text-neutral-400">截止时间</p>
                <button
                  type="button"
                  class="text-micro text-brand-600 transition-colors hover:text-brand-700"
                  @click="openDeadline"
                >
                  设置
                </button>
              </div>
              <p
                class="mt-0.5 truncate text-caption"
                :class="task.expired ? 'text-feedback-danger' : 'text-neutral-900'"
              >
                {{ task.deadlineAt ? formatDateTime(task.deadlineAt) : '长期有效' }}
                <span v-if="task.expired" class="ml-1 text-micro">（已截止）</span>
              </p>
            </div>
          </div>

          <div class="mt-5 border-t border-neutral-100 pt-5">
            <h2 class="section-title">任务内容</h2>
            <p
              v-if="contentLines.length"
              class="mt-3 text-body text-neutral-700 leading-[24px] whitespace-pre-line"
            >
              {{ contentLines.join('\n') }}
            </p>
            <div
              v-else
              class="mt-3 rounded-control border border-dashed border-neutral-200 bg-neutral-25 px-4 py-3"
            >
              <p class="text-caption text-neutral-500">该任务没有填写说明，员工端只显示标题与素材包。</p>
            </div>
          </div>
        </section>

        <!-- 领取明细 -->
        <section class="card p-5">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 class="section-title">领取明细</h2>
              <p class="mt-1 text-caption text-neutral-500">共 {{ claimTotal }} 条领取记录</p>
            </div>
            <div class="relative w-full sm:w-64">
              <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input v-model="claimKeyword" class="input pl-9" type="search" placeholder="搜索员工 / 门店" aria-label="搜索领取记录" />
            </div>
          </div>

          <div v-if="claimLoading" class="mt-4 space-y-3">
            <div v-for="index in 4" :key="index" class="skeleton h-3 w-full" />
          </div>

          <div v-else-if="claimError" class="mt-4">
            <EmptyState icon="alert" title="领取明细加载失败" :description="claimError">
              <template #action>
                <button type="button" class="btn btn-secondary btn-sm" @click="loadClaims">重试</button>
              </template>
            </EmptyState>
          </div>

          <div v-else-if="claims.length === 0" class="mt-4">
            <EmptyState
              icon="users"
              title="暂无领取记录"
              description="员工在小程序里领取任务后，这里会显示员工、门店与领取时间。"
            />
          </div>

          <template v-else>
            <div class="mt-4 table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>员工</th>
                    <th>手机号</th>
                    <th>门店</th>
                    <th>领取时间</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="claim in claims" :key="`${claim.taskId}-${claim.userId}`">
                    <td>
                      <div class="flex items-center gap-2">
                        <span class="w-7 h-7 rounded-pill bg-brand-100 text-brand-600 text-micro font-medium flex items-center justify-center">
                          {{ (claim.displayName || '未').charAt(0) }}
                        </span>
                        <span class="text-body text-neutral-900">{{ claim.displayName || '未命名' }}</span>
                      </div>
                    </td>
                    <td class="text-caption">{{ formatPhone(claim.phone) }}</td>
                    <td class="text-caption">{{ claim.storeName || '—' }}</td>
                    <td class="text-caption whitespace-nowrap">{{ formatDateTime(claim.claimedAt) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <PaginationBar
              :page="claimPage"
              :page-size="claimPageSize"
              :total="claimTotal"
              @update:page="(value) => (claimPage = value)"
            />
          </template>
        </section>
      </div>

      <!-- 右侧：本次任务素材（滚动时吸顶） -->
      <aside class="card p-5 lg:sticky lg:top-[84px]">
        <h2 class="section-title">本次任务素材</h2>
        <div class="mt-3 rounded-card border border-neutral-100 overflow-hidden">
          <div
            class="relative aspect-[16/9] flex items-center justify-center overflow-hidden text-white/85"
            :class="task.activityAsset.assetType === 'IMAGE' ? 'bg-thumb-rose' : 'bg-thumb-gold'"
          >
            <BaseIcon
              v-if="showPlaceholder(task.activityAsset.id, kindOf(task.activityAsset))"
              :name="task.activityAsset.assetType === 'IMAGE' ? 'image' : task.activityAsset.assetType === 'VIDEO' ? 'video' : 'folder'"
              :size="40"
              :stroke-width="1.2"
            />
            <img
              v-if="thumbs[task.activityAsset.id] && kindOf(task.activityAsset) === 'IMAGE'"
              :src="thumbs[task.activityAsset.id]"
              :alt="task.activityAsset.name"
              class="absolute inset-0 w-full h-full object-contain bg-white"
              :class="isLoaded(task.activityAsset.id) ? 'animate-fade-in' : 'opacity-0'"
              @load="markLoaded(task.activityAsset.id)"
              @error="markBroken(task.activityAsset.id)"
            />
            <video
              v-else-if="thumbs[task.activityAsset.id] && kindOf(task.activityAsset) === 'VIDEO'"
              :src="thumbs[task.activityAsset.id]"
              class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
              :class="frames[task.activityAsset.id] ? 'opacity-100' : 'opacity-0'"
              muted
              playsinline
              preload="metadata"
              @loadeddata="revealFrame(task.activityAsset.id, $event)"
              @error="markBroken(task.activityAsset.id)"
            />
          </div>
          <div class="p-3">
            <p class="text-[13px] font-medium text-neutral-900 truncate">{{ task.activityAsset.name }}</p>
            <p class="mt-1 text-micro text-neutral-500">
              {{ assetTypeLabel(task.activityAsset.assetType) }} · {{ formatBytes(task.activityAsset.fileSize) }}
            </p>
            <div class="mt-2 flex items-center gap-2">
              <span class="badge" :class="task.activityAsset.available ? 'badge-claimed' : 'badge-offline'">
                {{ task.activityAsset.available ? '可下载' : '已下架' }}
              </span>
              <span class="badge badge-neutral">#{{ task.activityAsset.id }}</span>
              <span v-if="childCount > 0" class="badge badge-brand">包内 {{ childCount }} 个素材</span>
            </div>
          </div>
        </div>

        <!-- 包内素材：让右栏的「包内 N 个素材」可点开看，也把卡片撑起来 -->
        <div v-if="childSamples.length > 0" class="mt-4">
          <div class="flex items-center justify-between">
            <h3 class="text-caption font-medium text-neutral-700">包内素材</h3>
            <span class="text-micro text-neutral-400">共 {{ childCount }} 个</span>
          </div>
          <div class="mt-2 grid grid-cols-3 gap-2">
            <button
              v-for="child in childSamples"
              :key="child.id"
              type="button"
              class="relative aspect-[4/3] overflow-hidden rounded-sm border border-neutral-100 bg-neutral-25
                flex items-center justify-center transition-colors hover:border-brand-200"
              :title="`查看 ${child.name}`"
              @click="router.push(`/admin/assets/${child.id}`)"
              @mouseenter="ensureThumb(child)"
            >
              <BaseIcon
                v-if="showPlaceholder(child.id, kindOf(child))"
                :name="child.assetType === 'VIDEO' ? 'video' : 'image'"
                :size="16"
                class="text-neutral-300"
              />
              <img
                v-if="thumbs[child.id] && kindOf(child) === 'IMAGE'"
                :src="thumbs[child.id]"
                :alt="child.name"
                class="absolute inset-0 w-full h-full object-cover bg-white"
                :class="isLoaded(child.id) ? 'animate-fade-in' : 'opacity-0'"
                loading="lazy"
                decoding="async"
                @load="markLoaded(child.id)"
                @error="markBroken(child.id)"
              />
              <video
                v-else-if="thumbs[child.id] && kindOf(child) === 'VIDEO'"
                :src="thumbs[child.id]"
                class="absolute inset-0 w-full h-full object-cover bg-neutral-900 transition-opacity duration-200"
                :class="frames[child.id] ? 'opacity-100' : 'opacity-0'"
                muted
                playsinline
                preload="metadata"
                @loadeddata="revealFrame(child.id, $event)"
                @error="markBroken(child.id)"
              />
              <span
                v-if="child.assetType === 'VIDEO'"
                class="absolute bottom-1 left-1 rounded-pill bg-neutral-900/60 px-1.5 py-0.5 text-[10px] leading-[12px] text-white"
              >
                视频
              </span>
            </button>
          </div>
          <p v-if="extraChildren > 0" class="mt-2 text-micro text-neutral-400">
            还有 {{ extraChildren }} 个素材，点下方「管理包内素材」查看
          </p>
        </div>

        <button
          type="button"
          class="btn btn-secondary w-full mt-3"
          @click="router.push(`/admin/assets/${task.activityAsset.id}`)"
        >
          <BaseIcon name="external" :size="16" />
          管理包内素材
        </button>
      </aside>
    </div>

    <!-- 领取截止时间 -->
    <BaseModal
      :open="deadlineOpen"
      title="设置领取截止时间"
      description="到期后员工无法再领取；已领取的员工仍可下载已上架素材。"
      :width="440"
      @close="deadlineOpen = false"
    >
      <label class="label" for="task-deadline">截止时间</label>
      <input id="task-deadline" v-model="deadlineInput" class="input" type="datetime-local" />
      <p class="help-text">
        留空表示长期有效；也可以设为过去时间，立即结束该任务。
      </p>

      <template #footer>
        <button type="button" class="btn btn-secondary btn-sm" :disabled="deadlineSubmitting" @click="deadlineOpen = false">
          关闭
        </button>
        <button
          v-if="task?.deadlineAt"
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="deadlineSubmitting"
          @click="saveDeadline(null)"
        >
          取消截止
        </button>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          :disabled="deadlineSubmitting || !deadlineInput"
          @click="saveDeadline(toApiDateTime(deadlineInput))"
        >
          {{ deadlineSubmitting ? '保存中…' : '保存' }}
        </button>
      </template>
    </BaseModal>
  </div>
</template>
