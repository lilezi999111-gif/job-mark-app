<script setup>
import { reactive, ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { STATUSES, STATUS_MAP, END_REASONS, CHANNELS } from '../constants'
import { addApplication, updateApplication, removeApplication, clearStatusHistory } from '../store'
import { COMPANY_TYPES } from '../constants'
import { appConfirm } from '../ui'
import { fmtDate, todayStr } from '../utils'

const props = defineProps({ app: { type: Object, default: null } })
const emit = defineEmits(['close'])

const isEdit = computed(() => !!props.app)
const form = reactive({
  company: props.app?.company || '',
  position: props.app?.position || '',
  channel: props.app?.channel || '',
  city: props.app?.city || '',
  branch: props.app?.branch || '',
  department: props.app?.department || '',
  companyTypes: Array.isArray(props.app?.companyTypes) ? [...props.app.companyTypes] : [],
  salary: props.app?.salary || '',
  appliedDate: props.app?.appliedDate || todayStr(),
  status: props.app?.status || 'applied',
  endReason: props.app?.endReason || '',
  url: props.app?.url || '',
  interviewUrl: props.app?.interviewUrl || '',
  notes: props.app?.notes || '',
})

const error = ref('')
const companyInput = ref(null)

function onKeydown(e) {
  if (e.key === 'Escape') emit('close')
}
onMounted(() => {
  nextTick(() => companyInput.value && companyInput.value.focus())
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

function save() {
  if (!form.company.trim() || !form.position.trim()) {
    error.value = '「公司」和「岗位」是必填项'
    return
  }
  if (isEdit.value) updateApplication(props.app.id, { ...form })
  else addApplication({ ...form })
  emit('close')
}

async function remove() {
  const ok = await appConfirm(`确定删除「${props.app.company} - ${props.app.position}」吗？删除后不可恢复。`)
  if (ok) {
    removeApplication(props.app.id)
    emit('close')
  }
}

async function clearHistory() {
  const ok = await appConfirm('确定清除状态流转历史吗？将只保留当前状态，统计里的各环节到达数也会随之减少。')
  if (ok) {
    clearStatusHistory(props.app.id)
  }
}

function toggleType(t) {
  const i = form.companyTypes.indexOf(t)
  if (i >= 0) form.companyTypes.splice(i, 1)
  else form.companyTypes.push(t)
}

const history = computed(() => {
  const h = props.app && props.app.statusHistory
  return h
    ? [...h].reverse().map((x) => ({ label: (STATUS_MAP[x.status] || {}).label || x.status, date: fmtDate(x.at) }))
    : []
})
</script>

<template>
  <div class="modal-mask" @click.self="emit('close')">
    <div class="modal">
      <header>
        <h2>{{ isEdit ? '编辑投递' : '添加投递' }}</h2>
        <button class="btn icon" title="关闭 (Esc)" @click="emit('close')">✕</button>
      </header>
      <form @submit.prevent="save">
        <div class="form-grid">
          <label class="field">
            <span>公司 *</span>
            <input ref="companyInput" v-model="form.company" placeholder="公司名称" />
          </label>
          <label class="field">
            <span>岗位 *</span>
            <input v-model="form.position" placeholder="如：前端开发工程师" />
          </label>
          <label class="field">
            <span>投递渠道</span>
            <input v-model="form.channel" list="channel-list" placeholder="选择或自由输入" />
            <datalist id="channel-list">
              <option v-for="c in CHANNELS" :key="c" :value="c" />
            </datalist>
          </label>
          <label class="field">
            <span>城市</span>
            <input v-model="form.city" placeholder="如：北京" />
          </label>
          <label class="field">
            <span>分部</span>
            <input v-model="form.branch" placeholder="如：肇庆分公司" />
          </label>
          <label class="field">
            <span>部门</span>
            <input v-model="form.department" placeholder="如：系统开发与运维" />
          </label>
          <label class="field">
            <span>薪资范围</span>
            <input v-model="form.salary" placeholder="如：25-40k·15薪" />
          </label>
          <label class="field">
            <span>投递日期</span>
            <input v-model="form.appliedDate" type="date" />
          </label>
          <label class="field full">
            <span>企业属性（可多选）</span>
            <div class="type-chips">
              <button
                v-for="t in COMPANY_TYPES"
                :key="t"
                type="button"
                class="type-chip"
                :class="{ on: form.companyTypes.includes(t) }"
                @click="toggleType(t)"
              >
                {{ t }}
              </button>
            </div>
          </label>
          <label class="field">
            <span>当前状态</span>
            <select v-model="form.status">
              <option v-for="s in STATUSES" :key="s.key" :value="s.key">{{ s.label }}</option>
            </select>
          </label>
          <label v-if="form.status === 'closed'" class="field">
            <span>结束原因</span>
            <select v-model="form.endReason">
              <option v-for="r in END_REASONS" :key="r" :value="r">{{ r }}</option>
            </select>
          </label>
          <label class="field full">
            <span>JD 链接</span>
            <input v-model="form.url" placeholder="职位描述链接（可选）" />
          </label>
          <label class="field full">
            <span>面试链接</span>
            <input v-model="form.interviewUrl" placeholder="会议/面试间链接（可选）" />
          </label>
          <label class="field full">
            <span>备注</span>
            <textarea v-model="form.notes" rows="3" placeholder="面试要点、内推人、流水记录…"></textarea>
          </label>
        </div>

        <p v-if="error" class="error">{{ error }}</p>

        <div v-if="isEdit && history.length > 1" class="history">
          <span class="history-title">状态流转：</span>
          <span v-for="(h, i) in history" :key="i" class="history-item">
            {{ h.date }} {{ h.label }}<template v-if="i < history.length - 1"> →</template>
          </span>
          <button
            type="button"
            class="btn tiny danger-ghost history-clear"
            title="只保留当前状态；统计里的各环节到达数会随之减少"
            @click="clearHistory"
          >
            清除
          </button>
        </div>

        <footer>
          <button v-if="isEdit" type="button" class="btn danger-ghost" @click="remove">删除</button>
          <span class="spacer"></span>
          <button type="button" class="btn ghost" @click="emit('close')">取消</button>
          <button type="submit" class="btn primary">保存</button>
        </footer>
      </form>
    </div>
  </div>
</template>
