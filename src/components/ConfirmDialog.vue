<script setup>
import { onMounted, onBeforeUnmount } from 'vue'
import { confirmState, answerConfirm } from '../ui'

// 确认框打开时按 Esc = 取消，且不触发下层弹窗的 Esc 逻辑
function onEsc(e) {
  if (confirmState.open && e.key === 'Escape') {
    e.stopPropagation()
    answerConfirm(false)
  }
}
onMounted(() => window.addEventListener('keydown', onEsc, true))
onBeforeUnmount(() => window.removeEventListener('keydown', onEsc, true))
</script>

<template>
  <div v-if="confirmState.open" class="modal-mask confirm-mask" @click.self="answerConfirm(false)">
    <div class="modal confirm-modal">
      <h2>确认操作</h2>
      <p class="confirm-message">{{ confirmState.message }}</p>
      <footer>
        <span class="spacer"></span>
        <button type="button" class="btn ghost" @click="answerConfirm(false)">取消</button>
        <button type="button" class="btn primary" @click="answerConfirm(true)">确定</button>
      </footer>
    </div>
  </div>
</template>
