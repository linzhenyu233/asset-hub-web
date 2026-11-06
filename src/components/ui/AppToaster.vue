<script setup lang="ts">
import { toastState, dismissToast } from '../../composables/useToast'
import BaseIcon from './BaseIcon.vue'

const styleMap = {
  success: { cls: 'bg-feedback-success-bg text-feedback-on-success', icon: 'check' },
  error: { cls: 'bg-feedback-danger-bg text-feedback-on-danger', icon: 'alert' },
  info: { cls: 'bg-feedback-info-bg text-feedback-info', icon: 'info' },
} as const
</script>

<template>
  <Teleport to="body">
    <div class="fixed top-4 right-4 z-toast flex flex-col gap-2 w-[360px] max-w-[calc(100vw-32px)]">
      <TransitionGroup
        enter-active-class="transition duration-base ease-standard"
        enter-from-class="opacity-0 translate-y-[-6px]"
        leave-active-class="transition duration-fast ease-exit"
        leave-to-class="opacity-0"
      >
        <div
          v-for="item in toastState.items"
          :key="item.id"
          role="alert"
          class="flex items-start gap-2 px-4 py-3 rounded-control shadow-e3"
          :class="styleMap[item.type].cls"
        >
          <BaseIcon :name="styleMap[item.type].icon" :size="20" />
          <p class="text-[13px] leading-[19px] flex-1">{{ item.message }}</p>
          <button
            type="button"
            class="opacity-60 hover:opacity-100 transition-opacity"
            aria-label="关闭提示"
            @click="dismissToast(item.id)"
          >
            <BaseIcon name="close" :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
