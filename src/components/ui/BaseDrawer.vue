<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { closeOverlay, isTopOverlay, nextOverlayId, openOverlay, trapTab } from '../../utils/overlay'
import BaseIcon from './BaseIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    width?: number
  }>(),
  { width: 520 },
)

const emit = defineEmits<{ (e: 'close'): void }>()

const overlayId = nextOverlayId()
const titleId = `drawer-title-${overlayId}`
const panelEl = ref<HTMLElement | null>(null)
/** 关闭后把焦点还给打开它的按钮，键盘用户不会掉回页首 */
let focusBack: HTMLElement | null = null

function onKeydown(event: KeyboardEvent) {
  if (!isTopOverlay(overlayId)) return
  if (event.key === 'Escape') emit('close')
  else trapTab(event, panelEl.value)
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      openOverlay(overlayId)
      window.addEventListener('keydown', onKeydown)
      focusBack = document.activeElement instanceof HTMLElement ? document.activeElement : null
      await nextTick()
      panelEl.value?.focus()
      return
    }
    closeOverlay(overlayId)
    window.removeEventListener('keydown', onKeydown)
    focusBack?.focus()
    focusBack = null
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  closeOverlay(overlayId)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-base ease-standard"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-fast ease-exit"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-drawer">
        <div class="absolute inset-0 bg-neutral-900/30" @click="emit('close')" />
        <aside
          ref="panelEl"
          class="absolute right-0 top-0 h-full w-full bg-neutral-0 shadow-drawer-left flex flex-col animate-drawer-in focus:outline-none"
          :style="{ maxWidth: `${width}px` }"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          tabindex="-1"
        >
          <header class="flex items-center justify-between gap-4 px-6 h-topbar border-b border-neutral-100">
            <h2 :id="titleId" class="text-[17px] font-bold text-neutral-900">{{ title }}</h2>
            <button
              type="button"
              class="w-8 h-8 inline-flex items-center justify-center rounded-control bg-neutral-100 text-neutral-600
                transition-colors duration-fast hover:bg-neutral-200"
              aria-label="关闭"
              @click="emit('close')"
            >
              <BaseIcon name="close" :size="16" />
            </button>
          </header>

          <div class="flex-1 overflow-y-auto px-6 py-5">
            <slot />
          </div>

          <footer v-if="$slots.footer" class="border-t border-neutral-200 px-6 py-4 flex items-center justify-end gap-2">
            <slot name="footer" />
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
