<template>
  <div class="pet-scene" :class="{ compact, moving: shouldAnimate }" :style="sceneStyle" :data-species="pet.data.selectedSpeciesId" role="img" :aria-label="species.name + ' ' + pet.data.name + '：' + activityLabel">
    <div class="scene-decoration" aria-hidden="true">{{ backgroundIcon }}</div>
    <div class="pet-figure" :data-activity="activity" :style="{ '--pet-speed': activity === 'run' ? '420ms' : '900ms' }">
      <div v-if="spriteUrl" class="pet-sprite" :style="spriteStyle" :data-frame="frame.frame"></div>
      <span v-else class="pet-unavailable">素材暂不可用</span>
      <span v-if="outfit" class="pet-outfit" :style="anchorStyle(outfitAnchor(pet.data.selectedSpeciesId, pet.data.equipped.outfit))" aria-hidden="true">{{ outfit }}</span>
      <span v-if="accessory" class="pet-accessory" :style="anchorStyle(species.accessory)" aria-hidden="true">{{ accessory }}</span>
      <span v-if="vehicle" class="pet-vehicle" aria-hidden="true">{{ vehicle }}</span>
      <span v-if="activityIcon && (feeding || pet.data.selectedSpeciesId === 'hamster')" class="pet-prop" :style="anchorStyle(species.prop)" aria-hidden="true">{{ activityIcon }}</span>
    </div>
    <span v-if="!compact" class="activity-label">{{ activityLabel }}</span>
  </div>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { usePetStore } from '../stores/pet';
import { petItem } from '../data/petCatalog';
import hamsterUrl from '../assets/pet/hamster-sheet.png';
import { petSpecies } from '../data/petSpecies';
import { animationFrame, outfitAnchor } from '../lib/petAnimation';
const atlases = import.meta.glob('../assets/pet/species/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const props = withDefaults(defineProps<{ active?: boolean; compact?: boolean }>(), { active: true, compact: false });
const pet = usePetStore();
const tick = ref(0);
const feeding = ref(false);
const visible = ref(true);
const reduced = ref(false);
let interval: ReturnType<typeof setInterval> | undefined;
let feedTimer: ReturnType<typeof setTimeout> | undefined;
let motionQuery: MediaQueryList | undefined;
const species = computed(() => petSpecies(pet.data.selectedSpeciesId));
const spriteUrl = computed(() => pet.data.selectedSpeciesId === 'hamster' ? hamsterUrl : atlases['../assets/pet/species/' + pet.data.selectedSpeciesId + '.svg']);
const activity = computed(() => feeding.value ? 'eat' : pet.data.equipped.state || pet.data.equipped.action);
const shouldAnimate = computed(() => props.active && visible.value && !reduced.value);
const frame = computed(() => animationFrame(pet.data.selectedSpeciesId, activity.value, tick.value));
const spriteStyle = computed(() => ({ backgroundImage: 'url(' + spriteUrl.value + ')', backgroundSize: frame.value.backgroundSize, backgroundPosition: frame.value.backgroundPosition }));
function anchorStyle(anchor: [number, number]) { return { left: anchor[0] + '%', top: anchor[1] + '%', right: 'auto', bottom: 'auto', transform: 'translate(-50%, -50%)' }; }
watch([activity, () => pet.data.selectedSpeciesId], () => { tick.value = 0; });
const backgroundIcon = computed(() => petItem('backgrounds', pet.data.equipped.background)?.icon || '');
const outfit = computed(() => petItem('outfits', pet.data.equipped.outfit)?.icon || '');
const accessory = computed(() => petItem('accessories', pet.data.equipped.accessory)?.icon || '');
const vehicle = computed(() => petItem('vehicles', pet.data.equipped.vehicle)?.icon || '');
const activityIcon = computed(() => feeding.value ? petItem('foods', pet.feedingFood)?.icon : petItem(pet.data.equipped.state ? 'states' : 'actions', activity.value)?.icon);
const activityLabel = computed(() => feeding.value ? '正在享用' + (petItem('foods', pet.feedingFood)?.name || '食物') : petItem(pet.data.equipped.state ? 'states' : 'actions', activity.value)?.name || '安静陪伴');
const palettes: Record<string, string> = { grass: '#d7f3d4', beach: '#c4eeef', mountain: '#cfdfe8', forest: '#c1dfd1', city: '#d5ddf1', space: '#a0a8d9', castle: '#ddd1f0', garden: '#dfedcc', snow: '#e0f2ff', desert: '#f2ddac' };
const sceneStyle = computed(() => ({ '--scene-color': palettes[pet.data.equipped.background] || 'var(--accent-soft)' }));
watch(shouldAnimate, (animate) => { clearInterval(interval); if (animate) interval = setInterval(() => { tick.value += 1; }, 230); }, { immediate: true });
watch(() => pet.feedingUntil, (until) => { clearTimeout(feedTimer); feeding.value = until > Date.now(); if (feeding.value) feedTimer = setTimeout(() => { feeding.value = false; }, until - Date.now()); }, { immediate: true });
function updateVisibility() { visible.value = document.visibilityState === 'visible'; }
function updateMotion() { reduced.value = !!motionQuery?.matches; }
onMounted(() => { updateVisibility(); motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)'); updateMotion(); document.addEventListener('visibilitychange', updateVisibility); motionQuery.addEventListener('change', updateMotion); });
onBeforeUnmount(() => { clearInterval(interval); clearTimeout(feedTimer); document.removeEventListener('visibilitychange', updateVisibility); motionQuery?.removeEventListener('change', updateMotion); });
</script>
<style scoped>
.pet-scene{position:relative;display:grid;place-items:center;min-height:206px;overflow:hidden;border-radius:18px;background:linear-gradient(155deg,var(--scene-color),var(--bg-elev));isolation:isolate}.pet-figure{position:relative;width:136px;height:136px;animation:pet-breathe 2.8s ease-in-out infinite;animation-play-state:paused}.moving .pet-figure{animation-play-state:running}.pet-sprite{width:100%;height:100%;border-radius:18px;background-size:300% 300%;background-repeat:no-repeat}.scene-decoration{position:absolute;right:12%;top:18%;font-size:48px;opacity:.4}.activity-label{position:absolute;bottom:10px;padding:5px 10px;border-radius:20px;background:var(--card);color:var(--text-2);font-size:12px}.pet-outfit,.pet-accessory,.pet-vehicle,.pet-prop{position:absolute;font-size:27px;filter:drop-shadow(0 2px 2px #0002)}.pet-outfit{top:-13px;left:45%}.pet-accessory{left:-16px;bottom:26px}.pet-vehicle{right:-23px;bottom:-3px;font-size:38px}.pet-prop{right:-10px;top:24px}.compact{min-height:64px;width:64px;border-radius:16px}.compact .pet-figure{width:52px;height:52px}.compact .pet-outfit{font-size:17px;top:-4px}.compact .pet-accessory,.compact .pet-prop{font-size:15px;left:auto;right:-5px;top:20px}.compact .pet-vehicle{font-size:20px;right:-4px;bottom:0}.compact .scene-decoration{font-size:20px}.pet-figure[data-activity=walk],.pet-figure[data-activity=run]{animation-name:pet-walk;animation-duration:var(--pet-speed)}.pet-figure[data-activity=jump],.pet-figure[data-activity=rope],.pet-figure[data-activity=celebrate]{animation-name:pet-jump;animation-duration:.7s}.pet-figure[data-activity=climb]{animation-name:pet-climb;animation-duration:1.4s}.pet-figure[data-activity=dance],.pet-figure[data-activity=music],.pet-figure[data-activity=exercise]{animation-name:pet-dance;animation-duration:.6s}.pet-figure[data-activity=eat]{animation-name:pet-nibble;animation-duration:.45s}@keyframes pet-breathe{50%{transform:translateY(-2px)}}@keyframes pet-walk{50%{transform:translateX(7px) rotate(3deg)}}@keyframes pet-jump{50%{transform:translateY(-12px)}}@keyframes pet-climb{50%{transform:translate(5px,-9px) rotate(-5deg)}}@keyframes pet-dance{25%{transform:rotate(-7deg)}75%{transform:rotate(7deg)}}@keyframes pet-nibble{50%{transform:scale(.97) rotate(2deg)}}@media(prefers-reduced-motion:reduce){.pet-figure{animation:none!important}}
</style>
