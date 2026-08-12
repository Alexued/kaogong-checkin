<template>
  <section class="review-panel">
    <div class="card intro-card">
      <div>
        <div class="eyebrow">{{ selectedSkill.shortName }}方法复盘</div>
        <h2>先识别关系，再决定算多精</h2>
        <p>拍照、相册或手动输入均可；中文识别与讲题规则都在手机本地完成。</p>
      </div>
      <PixelGrid pattern="arrival" :size="58" decorative />
    </div>

    <div class="review-tools card">
      <label class="skill-field"><span>名师 Skills</span><select v-model="skillId" class="input"><option v-for="skill in skills" :key="skill.id" :value="skill.id" :disabled="skill.status !== 'available'">{{ skill.name }}{{ skill.status === 'coming' ? '（待接入）' : '' }}</option></select><small>{{ selectedSkill.description }}</small></label>
      <button class="bank-open" type="button" @click="questionBankOpen = true"><span>从题库选择</span><small>搜索 {{ bankCount }} 道资料分析题，自动带入材料与答案</small></button>
    </div>

    <div class="source-actions">
      <button class="source-btn" type="button" @click="cameraInput?.click()"><span>拍照识题</span><small>直接调用后置相机</small></button>
      <button class="source-btn" type="button" @click="galleryInput?.click()"><span>相册选题</span><small>支持截图与照片</small></button>
      <input ref="cameraInput" class="hidden-input" type="file" accept="image/*" capture="environment" @change="onImageSelected($event, 'camera')" />
      <input ref="galleryInput" class="hidden-input" type="file" accept="image/*" @change="onImageSelected($event, 'gallery')" />
    </div>

    <div v-if="imagePreview" class="card image-card">
      <img :src="imagePreview" alt="待识别的资料分析题目" />
      <div class="ocr-state">
        <PixelGrid v-if="ocrBusy" preset="wave" :size="32" label="正在识别题目" />
        <span>{{ ocrMessage }}</span>
      </div>
    </div>

    <div class="card input-card">
      <label for="question-text">题目与材料文字</label>
      <textarea id="question-text" v-model="questionText" class="input question-text" rows="9" placeholder="可以粘贴完整材料和题目。拍照识别后也建议在这里核对年份、单位和小数点。"></textarea>
      <div class="answer-grid">
        <label>我的答案<input v-model="userAnswer" class="input" placeholder="可选" /></label>
        <label>参考答案<input v-model="correctAnswer" class="input" placeholder="可选" /></label>
      </div>
      <button class="btn analyze-btn" type="button" :disabled="!questionText.trim() || ocrBusy" @click="runAnalysis">生成讲解与复盘</button>
    </div>

    <div v-if="result" class="result-stack">
      <div class="card result-heading">
        <PixelGrid pattern="confirm" :size="54" once label="讲解已生成" />
        <div><span>{{ selectedSkill.name }} · 识别题型</span><strong>{{ result.categoryLabel }}</strong></div>
      </div>
      <article v-for="(section, index) in result.sections" :key="section.title" class="card section-card">
        <div class="section-index">{{ String(index + 1).padStart(2, '0') }}</div>
        <div><h3>{{ section.title }}</h3><p>{{ section.content }}</p></div>
      </article>
    </div>

    <div class="history-heading"><strong>复盘历史</strong><span>{{ reviews.length }} 条</span></div>
    <div v-if="!recentReviews.length" class="card empty">还没有题目复盘</div>
    <div v-for="review in recentReviews" :key="review.id" class="card review-history">
      <button type="button" class="review-open" @click="openReview(review)">
        <span>{{ review.categoryLabel }}</span>
        <strong>{{ excerpt(review.questionText) }}</strong>
        <small>{{ formatDate(review.createdAt) }}</small>
      </button>
      <button class="mini danger" type="button" aria-label="删除复盘" @click="deleteReview(review.id)">删除</button>
    </div>
    <QuestionBankPicker v-model:open="questionBankOpen" @select="useBankQuestion" />
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import PixelGrid from '../PixelGrid.vue';
import type { AnalysisCoachResult } from '../../lib/analysisCoach';
import { nativeTextRecognitionAvailable, recognizeChineseText } from '../../api/text-recognition';
import { useAppStore } from '../../stores/app';
import { confirmDialog } from '../../lib/appDialog';
import type { AnalysisReviewRecord } from '../../types';
import { ANALYSIS_SKILLS, analysisSkill, analyzeWithSkill, DEFAULT_ANALYSIS_SKILL_ID } from '../../lib/analysisSkills';
import QuestionBankPicker from './QuestionBankPicker.vue';
import { ANALYSIS_BANK_COUNT, questionBankText, type AnalysisBankQuestion } from '../../lib/questionBank';

const store = useAppStore();
const cameraInput = ref<HTMLInputElement | null>(null);
const galleryInput = ref<HTMLInputElement | null>(null);
const questionText = ref('');
const userAnswer = ref('');
const correctAnswer = ref('');
const skillId = ref(DEFAULT_ANALYSIS_SKILL_ID);
const questionBankOpen = ref(false);
const questionBankId = ref('');
const source = ref<'camera' | 'gallery' | 'text'>('text');
const imagePreview = ref('');
const ocrBusy = ref(false);
const ocrMessage = ref('');
const result = ref<AnalysisCoachResult | null>(null);
const reviews = computed(() => store.analysisReviews.filter((review) => !review.deleted));
const recentReviews = computed(() => reviews.value.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8));
const skills = ANALYSIS_SKILLS;
const selectedSkill = computed(() => analysisSkill(skillId.value));
const bankCount = ANALYSIS_BANK_COUNT;

async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const maxEdge = 2200;
    const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('CANVAS_UNAVAILABLE');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function onImageSelected(event: Event, nextSource: 'camera' | 'gallery') {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  source.value = nextSource; result.value = null; ocrBusy.value = true; ocrMessage.value = '正在压缩图片并识别中文…';
  try {
    imagePreview.value = await resizeImage(file);
    if (!nativeTextRecognitionAvailable()) {
      ocrMessage.value = '当前环境不支持本地 OCR，请在下方手动输入题目。';
      return;
    }
    const text = await recognizeChineseText(imagePreview.value);
    if (!text) { ocrMessage.value = '没有识别到清晰文字，请重新拍摄或手动输入。'; return; }
    questionText.value = text;
    ocrMessage.value = `已识别 ${text.length} 个字符，请重点核对年份、单位和小数点。`;
  } catch {
    ocrMessage.value = '识别失败，请换一张更清晰的图片或手动输入。';
  } finally {
    ocrBusy.value = false;
  }
}

function runAnalysis() {
  const text = questionText.value.trim();
  if (!text) return;
  result.value = analyzeWithSkill(skillId.value, text, userAnswer.value.trim(), correctAnswer.value.trim());
  store.saveAnalysisReview({ source: source.value, questionText: text, userAnswer: userAnswer.value.trim(), correctAnswer: correctAnswer.value.trim(), categoryKey: result.value.categoryKey, categoryLabel: result.value.categoryLabel, skillId: selectedSkill.value.id, questionBankId: questionBankId.value || undefined, sections: result.value.sections });
  if ('vibrate' in navigator) navigator.vibrate?.(16);
}

function openReview(review: AnalysisReviewRecord) {
  source.value = review.source; questionText.value = review.questionText; userAnswer.value = review.userAnswer; correctAnswer.value = review.correctAnswer; skillId.value = review.skillId || DEFAULT_ANALYSIS_SKILL_ID; questionBankId.value = review.questionBankId || '';
  result.value = { categoryKey: review.categoryKey, categoryLabel: review.categoryLabel, sections: review.sections.map((section) => ({ ...section })) };
  imagePreview.value = ''; ocrMessage.value = '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function useBankQuestion(question: AnalysisBankQuestion) {
  source.value = 'text';
  questionBankId.value = question.id;
  questionText.value = questionBankText(question);
  correctAnswer.value = question.answer;
  userAnswer.value = '';
  result.value = null;
  ocrMessage.value = '已带入题库题目，当前使用 ' + selectedSkill.value.name + '。';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteReview(id: string) {
  const accepted = await confirmDialog({ title: '删除这条题目复盘', message: '删除后，该题的文字与讲解不会再出现在其他设备的同步记录中。', confirmLabel: '删除复盘', variant: 'danger' });
  if (accepted) store.deleteAnalysisReview(id);
}

const excerpt = (value: string) => value.replace(/\s+/g, ' ').slice(0, 42) + (value.length > 42 ? '…' : '');
const formatDate = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
</script>

<style scoped>
.review-panel,.result-stack{display:grid;gap:14px}.intro-card{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px;background:linear-gradient(135deg,var(--accent-soft),var(--card))}.intro-card h2{margin:4px 0 6px;font-size:21px}.intro-card p{margin:0;color:var(--text-2);font-size:13px;line-height:1.5}.eyebrow{color:var(--accent-solid);font-size:12px;font-weight:800;letter-spacing:.1em}.source-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.source-btn{min-height:72px;border:1px solid var(--card-border);border-radius:14px;background:var(--card);color:var(--text);display:grid;gap:4px;text-align:left;padding:13px 15px}.source-btn span{font-weight:800}.source-btn small{color:var(--text-3)}.hidden-input{display:none}.review-tools{display:grid;gap:12px;padding:14px}.skill-field{display:grid;gap:6px}.skill-field>span{color:var(--text-2);font-size:13px;font-weight:750}.skill-field small{color:var(--text-3);font-size:11px;line-height:1.45}.bank-open{min-height:58px;display:grid;gap:3px;border:1px dashed var(--accent-solid);border-radius:9px;background:var(--accent-soft);color:var(--accent-solid);padding:10px 12px;text-align:left}.bank-open span{font-size:13px;font-weight:800}.bank-open small{color:var(--text-2);font-size:11px}.image-card{padding:10px;overflow:hidden}.image-card img{display:block;width:100%;max-height:320px;object-fit:contain;border-radius:11px;background:var(--bg-elev)}.ocr-state{display:flex;align-items:center;gap:10px;padding:10px 4px 2px;color:var(--text-2);font-size:12px}.input-card{padding:16px}.input-card>label{display:block;font-size:13px;font-weight:750;color:var(--text-2);margin-bottom:8px}.question-text{width:100%;resize:vertical;line-height:1.55;font-size:14px}.answer-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.answer-grid label{display:grid;gap:6px;color:var(--text-3);font-size:12px}.analyze-btn{width:100%;margin-top:12px}.result-heading{display:flex;align-items:center;gap:15px;padding:15px}.result-heading div{display:grid;gap:4px}.result-heading span{color:var(--text-3);font-size:12px}.result-heading strong{font-size:18px}.section-card{display:grid;grid-template-columns:36px 1fr;gap:8px;padding:15px}.section-index{font-size:12px;font-weight:850;color:var(--accent-solid);padding-top:3px}.section-card h3{margin:0 0 6px;font-size:15px}.section-card p{margin:0;color:var(--text-2);font-size:13px;line-height:1.65}.history-heading{display:flex;align-items:baseline;gap:8px;margin-top:4px}.history-heading span{color:var(--text-3);font-size:12px}.review-history{display:flex;align-items:center;padding:8px 9px 8px 14px}.review-open{flex:1;min-width:0;border:0;background:transparent;color:inherit;text-align:left;display:grid;gap:3px;padding:5px 8px 5px 0}.review-open span{color:var(--accent-solid);font-size:11px;font-weight:750}.review-open strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}.review-open small{color:var(--text-3)}.mini{min-height:44px;border:1px solid var(--card-border);border-radius:10px;background:transparent;padding:6px 10px}.mini.danger{color:var(--danger)}@media(max-width:380px){.source-actions,.answer-grid{grid-template-columns:1fr}.intro-card :deep(.pixel-grid){display:none}}
</style>
