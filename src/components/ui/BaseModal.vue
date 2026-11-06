<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import BaseIcon from './BaseIcon.vue'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    width?: number
    closeOnBackdrop?: boolean
    /** 为 false 时隐藏右上角关闭按钮（如强制改密等不可跳过流程） */
    closable?: boolean
  }>(),
  { width: 480, closeOnBackdrop: true, closable: true },
)

const emit = defineEmits<{ (e: 'close'): void }>()

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
)

onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-base ease-standard"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-fast ease-exit"
      leave-to-class="opacity-0"
    >
      <div v-if="open" class="fixed inset-0 z-modal flex items-center justify-center p-4">
        <div
          class="absolute inset-0 bg-neutral-900/40 backdrop-blur-[2px]"
          @click="closeOnBackdrop && emit('close')"
        />
        <div
          class="relative w-full bg-neutral-0 rounded-xl shadow-e3 p-6 animate-fade-up"
          :style="{ maxWidth: `${width}px` }"
          role="dialog"
          aria-modal="true"
          @click.stop
        >
          <div class="flex items-start justify-between gap-4">
            <div>
              <h2 class="text-h3 font-bold text-neutral-900">{{ title }}</h2>
              <p v-if="description" class="mt-1 text-[13px] leading-5 text-neutral-600">{{ description }}</p>
            </div>
            <button
              v-if="closable"
              type="button"
              class="w-8 h-8 -mr-1 -mt-1 inline-flex items-center justify-center rounded-control bg-neutral-100 text-neutral-600
                transition-colors duration-fast hover:bg-neutral-200"
              aria-label="关闭"
              @click="emit('close')"
            >
              <BaseIcon name="close" :size="16" />
            </button>
          </div>

          <div class="mt-5">
            <slot />
          </div>

          <div v-if="$slots.footer" class="mt-6 flex items-center justify-end gap-2">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
