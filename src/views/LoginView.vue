<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from '../stores/session'
import { ApiError } from '../api/client'
import BaseIcon from '../components/ui/BaseIcon.vue'
import BrandMark from '../components/ui/BrandMark.vue'

const router = useRouter()
const route = useRoute()
const { loginAdmin, isPreview } = useSession()

const loading = ref(false)
const errorMessage = ref('')

const username = ref(isPreview ? 'admin' : '')
const password = ref(isPreview ? 'admin123' : '')
const showPassword = ref(false)

const submitLabel = computed(() => '登录管理后台')

function fillAdmin() {
  username.value = 'admin'
  password.value = 'admin123'
  errorMessage.value = ''
}

function normalizeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'ORIGIN_NOT_ALLOWED') {
      return '请求来源未被后端允许，请检查代理 Origin 或后端 CORS_ALLOWED_ORIGIN'
    }
    if (error.status === 0) return '网络异常，请检查后端服务是否可达'
    if (error.status === 401) return '账号或密码不正确，请重新输入'
    if (error.status === 403) return '当前账号无管理端权限，请联系超级管理员'
    return error.message
  }
  if (error instanceof Error && error.message) return error.message
  return '登录失败，请稍后重试'
}

async function submit() {
  if (loading.value) return
  errorMessage.value = ''

  if (!username.value.trim() || !password.value) {
    errorMessage.value = '请输入管理员账号与密码'
    return
  }

  loading.value = true
  try {
    await loginAdmin(username.value.trim(), password.value)
    redirectAfterLogin()
  } catch (error) {
    errorMessage.value = normalizeError(error)
  } finally {
    loading.value = false
  }
}

function redirectAfterLogin() {
  const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : ''
  if (redirect && redirect !== '/login') {
    router.replace(redirect)
    return
  }
  router.replace('/admin')
}
</script>

<template>
  <div class="min-h-screen flex bg-neutral-0">
    <!-- 品牌栏（560px） -->
    <section class="hidden lg:flex w-[560px] shrink-0 relative overflow-hidden bg-brand-panel">
      <div class="absolute -top-24 -right-16 w-[360px] h-[360px] rounded-full border border-white/10" />
      <div class="absolute top-24 -right-32 w-[520px] h-[520px] rounded-full border border-white/10" />
      <div class="absolute -bottom-40 -left-24 w-[420px] h-[420px] rounded-full border border-white/10" />
      <div class="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_20%_20%,#fff_0,transparent_45%)]" />

      <div class="relative z-10 flex flex-col justify-between w-full px-12 py-12">
        <div class="flex items-center gap-3">
          <span class="w-9 h-9 rounded-pill bg-white/15 flex items-center justify-center">
            <BrandMark variant="white" :size="24" />
          </span>
          <div>
            <p class="text-white text-body font-medium leading-tight">钻石世家</p>
            <p class="text-white/70 text-micro">SHINING HOUSE</p>
          </div>
        </div>

        <div class="pb-8">
          <h1 class="text-[32px] leading-[40px] font-bold text-white">
            让每一份素材<br />在正确的节点抵达门店
          </h1>
          <p class="mt-4 text-body text-white/85 leading-[24px] max-w-[380px]">
            统一管理图片、视频与活动包，按角色与门店精准分发，下载全程可追溯。
          </p>

          <div class="mt-8 flex items-center gap-3">
            <span class="h-px w-8 bg-white/40" />
            <p class="text-caption text-white/70">图片 · 视频 · 活动包 · 统一授权</p>
          </div>
        </div>

        <div class="flex items-center justify-between text-caption text-white/60">
          <span>© 2026 钻石世家 云素材中台</span>
          <span>内部系统 · 请勿外发</span>
        </div>
      </div>
    </section>

    <!-- 表单栏 -->
    <section class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-[420px]">
        <div class="lg:hidden flex items-center gap-2.5 mb-8">
          <BrandMark variant="dark" :size="28" />
          <span class="text-h3 font-bold text-neutral-900">云素材中台</span>
        </div>

        <h2 class="text-h1 font-bold text-neutral-900">登录管理中台</h2>
        <p class="mt-1 text-caption text-neutral-500">仅限总部管理账号登录</p>

        <div v-if="isPreview" class="mt-4 space-y-3">
          <div
            role="status"
            class="flex items-start gap-2 rounded-control bg-feedback-info-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-info"
          >
            <BaseIcon name="info" :size="18" class="mt-px" />
            <span>预览模式 · 使用本地演示账号校验，仅管理员可进入管理后台。</span>
          </div>

          <div class="rounded-control border border-neutral-200 bg-neutral-25 p-3">
            <p class="text-micro text-neutral-500">点击填入演示账号</p>
            <div class="mt-2 flex flex-wrap gap-2">
              <button type="button" class="chip" @click="fillAdmin">管理员 admin / admin123</button>
            </div>
          </div>
        </div>

        <form class="mt-6" novalidate @submit.prevent="submit">
          <!-- 错误提示条 -->
          <div
            v-if="errorMessage"
            role="alert"
            class="mb-4 flex items-start gap-2 rounded-control bg-feedback-danger-bg px-3.5 py-3 text-[13px] leading-[19px] text-feedback-on-danger"
          >
            <BaseIcon name="alert" :size="18" class="mt-px" />
            <span>{{ errorMessage }}</span>
          </div>

          <div class="space-y-5">
            <div>
              <label class="label" for="username">管理员账号</label>
              <input
                id="username"
                v-model="username"
                class="input"
                type="text"
                autocomplete="username"
                placeholder="请输入账号"
              />
            </div>

            <div>
              <label class="label" for="password">账号密码</label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  class="input pr-11"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                />
                <button
                  type="button"
                  class="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-neutral-400 hover:text-neutral-600"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <BaseIcon :name="showPassword ? 'eye-off' : 'eye'" :size="16" />
                </button>
              </div>
            </div>
          </div>

          <button type="submit" class="btn btn-primary btn-lg w-full mt-6" :disabled="loading">
            <svg
              v-if="loading"
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
            {{ loading ? '登录中…' : submitLabel }}
          </button>
        </form>

        <p class="mt-6 text-center text-micro text-neutral-400">
          登录即表示同意遵守公司素材使用与保密规范
        </p>
      </div>
    </section>
  </div>
</template>
