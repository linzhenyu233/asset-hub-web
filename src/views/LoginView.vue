<script setup lang="ts">
import { ref } from 'vue'
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
    // 后端对"账号不存在"和"密码错误"都只回 401，这里不区分，统一把开通入口说出来
    if (error.status === 401) return '账号或密码不正确；如果还没有账号，请联系超级管理员添加'
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
  router.replace('/portal')
}
</script>

<template>
  <div class="min-h-screen flex bg-neutral-0">
    <!-- 品牌栏（560px，对齐 ardot A7 品牌區 5:2） -->
    <section
      class="hidden lg:flex w-[560px] shrink-0 relative overflow-hidden bg-[linear-gradient(225deg,#F2789F_0%,#E85E8F_32%,#B93B6C_68%,#7E2148_100%)] shadow-[inset_0_0_140px_rgba(60,6,26,0.35)]"
    >
      <!-- 景深：上右高光 / 左下暗部 / 颗粒 -->
      <div class="pointer-events-none absolute -top-[220px] -right-[180px] w-[560px] h-[560px] rounded-full bg-white/20 blur-[150px]" />
      <div class="pointer-events-none absolute -bottom-[240px] -left-[200px] w-[640px] h-[640px] rounded-full bg-[#5A0E2D]/50 blur-[170px]" />
      <svg
        class="pointer-events-none absolute inset-0 w-full h-full opacity-[0.12] mix-blend-soft-light"
        aria-hidden="true"
      >
        <filter id="login-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" />
        </filter>
        <rect width="100%" height="100%" filter="url(#login-grain)" />
      </svg>

      <div class="absolute -top-20 -right-20 w-[340px] h-[340px] rounded-full border border-white/10" />
      <!-- 标识区背后：柔光 + 同心细环，避免大片纯色发平 -->
      <div
        class="pointer-events-none absolute left-1/2 top-[300px] w-[420px] h-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/10 blur-[120px]"
      />
      <svg
        class="pointer-events-none absolute left-1/2 top-[300px] -translate-x-1/2 -translate-y-1/2"
        width="720"
        height="720"
        viewBox="0 0 720 720"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="360" cy="360" r="200" stroke="#FFFFFF" stroke-opacity="0.1" />
        <circle cx="360" cy="360" r="280" stroke="#FFFFFF" stroke-opacity="0.07" />
        <circle cx="360" cy="360" r="356" stroke="#FFFFFF" stroke-opacity="0.05" />
      </svg>

      <div class="relative z-10 flex flex-col w-full px-12 py-12">
        <div class="flex items-center gap-3">
          <BrandMark variant="white" :size="34" />
          <p class="text-white text-h3 font-medium">钻石世家云素材中心</p>
        </div>

        <!-- 标识与标语整体下移，在剩余空间内垂直居中 -->
        <div class="my-auto">
          <!--
            原图底部自带「KEEP LOVING KEEP SHINING」标语：容器保持原图高度（440×176），
            logo 部分裁到 148px 去掉旧标语，新标语绝对定位回原位置，整体占位与下方间距都不变。
            设计提供纯 logo 图后可直接去掉这层裁切与绝对定位。
          -->
          <div class="relative w-[440px] max-w-full" style="height: 176px">
            <div class="overflow-hidden" style="height: 148px">
              <img
                src="/brand/logo-full-white-v2.png"
                alt="SHINING HOUSE"
                width="440"
                height="181"
                class="w-[440px] max-w-full"
              />
            </div>
            <!-- 字体栈显式指定 Times New Roman：默认 font-serif 在 Windows 会落到 Georgia，笔画比原图粗 -->
            <p
              class="absolute inset-x-0 bottom-[6px] text-center text-[12px] leading-none uppercase tracking-[0.3em] text-white/85"
              style="font-family: 'Times New Roman', Times, serif"
            >
              Keep Chasing Keep Shining
            </p>
          </div>

          <h1 class="mt-7 text-[20px] leading-[38px] font-bold text-white">欢迎使用钻石世家云素材中心</h1>

          <!-- 三条能力，填空但只陈述真实范围 -->
          <div class="mt-8 w-[440px] border-t border-white/15">
            <div class="flex items-baseline gap-4 border-b border-white/15 py-3.5">
              <span class="w-[76px] shrink-0 text-[12px] text-white/55">素材管理</span>
              <span class="text-[13px] leading-[20px] text-white/90">图片、视频、任务素材统一入库</span>
            </div>
            <div class="flex items-baseline gap-4 border-b border-white/15 py-3.5">
              <span class="w-[76px] shrink-0 text-[12px] text-white/55">精准分发</span>
              <span class="text-[13px] leading-[20px] text-white/90">按角色与门店授权可见范围</span>
            </div>
            <div class="flex items-baseline gap-4 py-3.5">
              <span class="w-[76px] shrink-0 text-[12px] text-white/55">下载追溯</span>
              <span class="text-[13px] leading-[20px] text-white/90">谁在何时下载了什么，全程留痕</span>
            </div>
          </div>
        </div>

        <div class="mt-8 text-caption text-white/60">
          <div class="flex items-center justify-between gap-4">
            <span>© 2026 钻石世家 素材中心</span>
            <span>内部系统 · 请勿外发</span>
          </div>
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="mt-1 inline-block text-micro text-white/45 transition-colors hover:text-white/80"
          >
            粤ICP备14072589号-4
          </a>
        </div>
      </div>
    </section>

    <!-- 表单栏 -->
    <section class="flex-1 flex items-center justify-center px-6 py-12">
      <div class="w-full max-w-[420px]">
        <div class="lg:hidden flex items-center gap-2.5 mb-8">
          <BrandMark variant="dark" :size="28" />
          <span class="text-h3 font-bold text-neutral-900">素材中心</span>
        </div>

        <h2 class="text-h1 font-bold text-neutral-900">登录素材管理中心</h2>

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
              <label class="label" for="password">密码</label>
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
            {{ loading ? '登录中…' : '登录' }}
          </button>
        </form>

        <p class="mt-6 text-center text-micro text-neutral-400">
          登录即表示同意遵守公司素材使用与保密规范
        </p>
        <p class="mt-3 text-center text-micro text-neutral-400 lg:hidden">
          <a
            href="https://beian.miit.gov.cn/"
            target="_blank"
            rel="noopener noreferrer"
            class="transition-colors hover:text-neutral-600"
          >
            粤ICP备14072589号-4
          </a>
        </p>
      </div>
    </section>
  </div>
</template>
