<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PickerOption } from './picker'
import BaseIcon from './BaseIcon.vue'

/**
 * 按名称搜索并选择一条记录，对外只给选中的 ID。
 * 用于「员工 / 素材」这类后端只认 ID、但使用者只记得名字的筛选。
 */
const props = withDefaults(
  defineProps<{
    modelValue: PickerOption | null
    /** 按关键词查候选项（只在输入了关键词后才调用） */
    search: (keyword: string) => Promise<PickerOption[]>
    placeholder?: string
    ariaLabel?: string
    /** 还没输入时下拉里的提示，说明该搜什么 */
    emptyHint?: string
  }>(),
  { placeholder: '输入名称搜索', ariaLabel: '搜索并选择', emptyHint: '输入关键词后显示候选' },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: PickerOption | null): void }>()

/** 一次只展示几条：候选多了反而不好点，继续输入能缩小范围 */
const MAX_OPTIONS = 8

const keyword = ref('')
const options = ref<PickerOption[]>([])
const open = ref(false)
const loading = ref(false)
const errorMessage = ref('')
/** 键盘上下键的当前项，Enter 直接选它 */
const activeIndex = ref(-1)
let timer: number | undefined
let blurTimer: number | undefined
let seq = 0

async function runSearch(): Promise<void> {
  const current = ++seq
  loading.value = true
  errorMessage.value = ''
  try {
    const items = await props.search(keyword.value.trim())
    if (current !== seq) return
    options.value = items.slice(0, MAX_OPTIONS)
    activeIndex.value = options.value.length > 0 ? 0 : -1
  } catch (error) {
    if (current !== seq) return
    options.value = []
    activeIndex.value = -1
    errorMessage.value = error instanceof Error ? error.message : '搜索失败，请重试'
  } finally {
    if (current === seq) loading.value = false
  }
}

/** 只展开空面板，不预取候选：没输入就列一堆东西既没用又像 bug */
function onFocus(): void {
  // 清掉上一次失焦的收起定时器，否则点回来 150ms 后又被关掉，接着打字也搜不出来
  window.clearTimeout(blurTimer)
  open.value = true
}

/** 失焦后延迟收起：点候选项时 blur 先于 click 触发，不延迟会把这次点击吞掉 */
function onBlur(): void {
  blurTimer = window.setTimeout(() => {
    open.value = false
  }, 150)
}

function pick(option: PickerOption): void {
  emit('update:modelValue', option)
  keyword.value = ''
  options.value = []
  open.value = false
}

function clear(): void {
  emit('update:modelValue', null)
  keyword.value = ''
  options.value = []
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  if (!open.value || options.value.length === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % options.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + options.value.length) % options.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const option = options.value[activeIndex.value]
    if (option) pick(option)
  }
}

watch(keyword, () => {
  window.clearTimeout(timer)
  // 关键词一变就先清掉旧候选，避免防抖窗口里看着像「搜过了」
  options.value = []
  activeIndex.value = -1
  if (keyword.value.trim() === '') {
    loading.value = false
    return
  }
  if (!open.value) return
  loading.value = true
  timer = window.setTimeout(() => void runSearch(), 300)
})
</script>

<template>
  <div class="relative">
    <!-- 已选中：显示名称，ID 不露给使用者 -->
    <div
      v-if="modelValue"
      class="flex h-10 items-center gap-2 rounded-control border border-brand-200 bg-brand-50 px-3"
    >
      <span class="min-w-0 flex-1 truncate text-caption text-brand-700" :title="modelValue.label">
        {{ modelValue.label }}
      </span>
      <button
        type="button"
        class="shrink-0 text-brand-500 transition-colors hover:text-brand-700"
        aria-label="清除选择"
        @click="clear"
      >
        <BaseIcon name="close" :size="14" />
      </button>
    </div>

    <template v-else>
      <div class="relative">
        <BaseIcon name="search" :size="16" class="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          v-model="keyword"
          class="input pl-9"
          type="search"
          role="combobox"
          autocomplete="off"
          :aria-label="ariaLabel"
          :aria-expanded="open"
          :placeholder="placeholder"
          @focus="onFocus"
          @blur="onBlur"
          @keydown="onKeydown"
        />
      </div>

      <div
        v-if="open"
        class="absolute z-dropdown mt-1 max-h-64 w-full overflow-y-auto rounded-control border border-neutral-200 bg-neutral-0 shadow-e2"
      >
        <p v-if="loading" class="px-3 py-2 text-micro text-neutral-500">搜索中…</p>
        <p v-else-if="errorMessage" class="px-3 py-2 text-micro text-feedback-danger">{{ errorMessage }}</p>
        <p v-else-if="!keyword.trim()" class="px-3 py-2 text-micro text-neutral-500">{{ emptyHint }}</p>
        <p v-else-if="options.length === 0" class="px-3 py-2 text-micro text-neutral-500">
          没有匹配项，换个关键词试试
        </p>
        <template v-else>
          <button
            v-for="(option, index) in options"
            :key="option.id"
            type="button"
            class="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left transition-colors"
            :class="index === activeIndex ? 'bg-brand-50' : 'hover:bg-neutral-50'"
            @mouseenter="activeIndex = index"
            @mousedown.prevent="pick(option)"
          >
            <span class="min-w-0 truncate text-caption text-neutral-900">{{ option.label }}</span>
            <span v-if="option.hint" class="shrink-0 text-micro text-neutral-400">{{ option.hint }}</span>
          </button>
        </template>
      </div>
    </template>
  </div>
</template>
