<script setup lang="ts">
import { useRouter } from 'vue-router'
import BrandMark from '../components/ui/BrandMark.vue'
import BaseIcon from '../components/ui/BaseIcon.vue'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-6 bg-neutral-50">
    <div class="w-full max-w-md text-center">
      <div class="flex items-center justify-center gap-2.5 mb-8">
        <BrandMark variant="dark" :size="28" />
        <span class="text-h3 font-bold text-neutral-900">素材中心</span>
      </div>

      <p class="data-num text-[64px] leading-none text-brand-500">404</p>
      <h1 class="mt-4 text-h1 font-bold text-neutral-900">页面不存在</h1>
      <p class="mt-2 text-body text-neutral-500">
        链接可能已失效或素材已下架。请返回上一页，或回到工作台继续浏览。
      </p>

      <div class="mt-6 flex items-center justify-center gap-2">
        <button type="button" class="btn btn-secondary" @click="router.back()">
          <BaseIcon name="arrow-left" :size="16" />
          返回上一页
        </button>
        <button type="button" class="btn btn-primary" @click="router.push('/')">
          <BaseIcon name="dashboard" :size="16" />
          回到工作台
        </button>
      </div>
    </div>
  </div>
</template>
