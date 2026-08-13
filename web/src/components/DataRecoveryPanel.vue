<template>
  <section v-if="store.recoveryRequired || message" id="data-recovery" class="recovery-card" :class="{ compact, recovered: !store.recoveryRequired }" role="alert">
    <div class="recovery-mark" aria-hidden="true">
      <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
    </div>
    <div class="recovery-copy">
      <strong>{{ store.recoveryRequired ? '本地数据等待恢复' : '本地数据已恢复' }}</strong>
      <p>{{ store.recoveryRequired ? reasonText + ' 为防止错误数据覆盖原记录，修改和删除功能已暂时停用。' : '原始记录已重新载入，现在可以正常新增、修改和删除。' }}</p>
      <template v-if="!compact">
        <div class="recovery-meta">
          <span>原始备份</span><b>{{ status.backupAvailable ? '已保留，可验证恢复' : '未检测到迁移备份' }}</b>
          <span>备份时间</span><b>{{ backupTime }}</b>
          <span>备份大小</span><b>{{ backupSize }}</b>
        </div>
        <ol>
          <li>保持本页面打开，不要清除应用数据</li>
          <li>点击“验证并恢复”，应用会读取未覆盖的原始备份</li>
          <li>看到“恢复完成”后，即可正常新增、修改和删除</li>
        </ol>
      </template>
      <div class="recovery-actions">
        <button v-if="store.recoveryRequired" class="recovery-primary" type="button" :disabled="recovering || !status.backupAvailable" @click="recover">
          {{ recovering ? '正在验证…' : status.backupAvailable ? '验证并恢复' : '暂无可恢复备份' }}
        </button>
        <router-link v-if="compact" to="/settings#data-recovery">查看原因和操作路径</router-link>
      </div>
      <div v-if="message" class="recovery-message" :class="{ bad: failed }" aria-live="polite">{{ message }}</div>
      <div v-if="failed" class="recovery-route" role="status">
        <strong>接下来这样操作</strong>
        <span>1. 不要卸载应用、不要清除应用数据，原始备份仍保留在本机。</span>
        <span>2. 先记下错误码 {{ latestErrorCode }}，再重新打开“设置 → 本地数据等待恢复”。</span>
        <span>3. 若仍失败，在另一台设备打开“设置 → 设备直连 → 发送本机记录”，本机选择接收。</span>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { localRecoveryStatus, retryLocalRecovery } from '../api/sync';
import { useAppStore } from '../stores/app';

defineProps<{ compact?: boolean }>();

const store = useAppStore();
const recovering = ref(false);
const message = ref('');
const failed = ref(false);
const status = reactive(localRecoveryStatus());

const ERROR_COPY: Record<string, string> = {
  MIGRATION_SOURCE_CHANGED: '检测到升级期间的数据来源发生变化。',
  MIGRATION_FAILED: '旧版数据升级时校验未通过。',
  INVALID_REPOSITORY: '本地数据文件完整性校验未通过。',
  INVALID_MIGRATION_LOCK: '数据恢复标记不完整。',
  BACKUP_WRITE_FAILED: '创建升级备份时存储空间不足。',
};

const reasonText = computed(() => ERROR_COPY[status.errorCode] || '应用在版本升级时未能确认本地数据完整性。');
const latestErrorCode = computed(() => status.errorCode || 'RECOVERY_FAILED');
const backupTime = computed(() => status.backupCreatedAt
  ? new Date(status.backupCreatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '未记录');
const backupSize = computed(() => status.sourceBytes > 0 ? formatBytes(status.sourceBytes) : '未记录');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

async function recover() {
  if (recovering.value || !status.backupAvailable) return;
  recovering.value = true;
  failed.value = false;
  message.value = '正在校验原始备份并重建本地索引…';
  try {
    const report = await retryLocalRecovery();
    const repaired = report.repairedCount > 0
      ? ` 已修复 ${report.repairedCount} 个历史项目关联，相关记录完整保留在统计和历史中。`
      : '';
    message.value = `恢复完成，原始记录已重新载入，修改和删除功能已恢复。${repaired}`;
  } catch (error) {
    failed.value = true;
    Object.assign(status, localRecoveryStatus());
    const errorCode = error instanceof Error
      ? (('code' in error && typeof error.code === 'string') ? error.code : error.message)
      : 'RECOVERY_FAILED';
    message.value = errorCode === 'MIGRATION_BACKUP_MISSING'
      ? '未找到原始备份，请不要清除应用数据，先使用另一台设备的“发送记录”恢复。'
      : `恢复未通过校验（错误码：${status.errorCode || errorCode || 'RECOVERY_FAILED'}）。原始数据和备份均未覆盖。`;
  } finally {
    recovering.value = false;
  }
}
</script>

<style scoped>
.recovery-card{display:grid;grid-template-columns:40px minmax(0,1fr);gap:12px;margin:10px 0 16px;padding:15px;border:1px solid color-mix(in srgb,var(--danger) 38%,var(--card-border));border-radius:8px;background:color-mix(in srgb,var(--danger) 7%,var(--card));color:var(--text)}.recovery-card.recovered{border-color:color-mix(in srgb,var(--accent-solid) 38%,var(--card-border));background:var(--accent-soft)}.recovered .recovery-mark{color:var(--accent-solid)}.recovered .recovery-mark span:nth-child(1),.recovered .recovery-mark span:nth-child(3),.recovered .recovery-mark span:nth-child(7),.recovered .recovery-mark span:nth-child(9){opacity:.18}.recovered .recovery-mark span:nth-child(5){opacity:1}
.recovery-mark{width:36px;height:36px;display:grid;grid-template-columns:repeat(3,1fr);gap:3px;color:var(--danger)}.recovery-mark span{border-radius:2px;background:currentColor;opacity:.18}.recovery-mark span:nth-child(1),.recovery-mark span:nth-child(3),.recovery-mark span:nth-child(5),.recovery-mark span:nth-child(7),.recovery-mark span:nth-child(9){opacity:1}
.recovery-copy{min-width:0}.recovery-copy>strong{font-size:15px}.recovery-copy>p{margin:5px 0 0;color:var(--text-2);font-size:12px;line-height:1.65}.recovery-meta{display:grid;grid-template-columns:76px minmax(0,1fr);gap:7px 10px;margin-top:12px;padding:11px;border-radius:7px;background:var(--bg-elev);font-size:11px}.recovery-meta span{color:var(--text-3)}.recovery-meta b{font-weight:700}.recovery-copy ol{margin:12px 0 0;padding-left:20px;color:var(--text-2);font-size:12px;line-height:1.8}.recovery-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:12px}.recovery-primary{min-height:44px;border:0;border-radius:8px;padding:0 15px;background:var(--danger);color:#fff;font-size:13px;font-weight:800}.recovery-primary:disabled{opacity:.48}.recovery-actions a{min-height:44px;display:inline-flex;align-items:center;color:var(--danger);font-size:12px;font-weight:750;text-decoration:none}.recovery-message{margin-top:9px;color:var(--accent-solid);font-size:11px;line-height:1.55}.recovery-message.bad{color:var(--danger)}
.recovery-route{display:grid;gap:5px;margin-top:10px;padding:10px 11px;border-radius:7px;background:var(--bg-elev);color:var(--text-2);font-size:11px;line-height:1.55}.recovery-route strong{color:var(--text);font-size:12px}.recovery-route span{display:block}
.recovery-card.compact{grid-template-columns:32px minmax(0,1fr);padding:13px}.compact .recovery-mark{width:30px;height:30px}.compact .recovery-actions{margin-top:9px}.compact .recovery-primary{min-height:40px}
@media(max-width:360px){.recovery-actions{display:grid}.recovery-primary,.recovery-actions a{width:100%;justify-content:center}}
</style>
