// 状态流转定义：增删改这里，看板列、筛选、统计会跟着变
export const STATUSES = [
  { key: 'applied', label: '已投递', type: 'active' },
  { key: 'written', label: '笔试/测评', type: 'active' },
  { key: 'interview1', label: '一面', type: 'active' },
  { key: 'interview2', label: '二面', type: 'active' },
  { key: 'interview3', label: '三面/终面', type: 'active' },
  { key: 'hr', label: 'HR面', type: 'active' },
  { key: 'offer', label: 'Offer', type: 'success' },
  { key: 'closed', label: '流程结束', type: 'fail' },
]

export const STATUS_MAP = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

// 漏斗统计的环节顺序（不含“流程结束”）
export const FUNNEL = ['applied', 'written', 'interview1', 'interview2', 'interview3', 'hr', 'offer']

// 标记“流程结束”时可选择的原因
export const END_REASONS = ['无响应', '简历筛选未过', '面试未通过', '拒绝了 Offer', '其他']

// 企业属性（可多选）
export const COMPANY_TYPES = ['国企', '央企', '大厂', '私企', '上市', '外企', '合资', '独角兽', '创业公司']

// 常用投递渠道预设，表单里也可以自由输入其他渠道
export const CHANNELS = ['BOSS直聘', '智联招聘', '前程无忧', '拉勾', '猎聘', '内推', '官网']

// 超过多少天没有状态变化，就标记为“需跟进”
export const FOLLOW_UP_DAYS = 7
