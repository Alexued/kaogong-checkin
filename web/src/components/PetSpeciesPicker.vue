<template>
  <section class="species-picker" aria-label="选择陪伴宠物">
    <button class="species-toggle" type="button" :aria-expanded="open" @click="open = !open"><span>{{ current.name }} · 更换伙伴</span><span aria-hidden="true">{{ open ? '⌃' : '⌄' }}</span></button>
    <div v-if="open" class="species-options" data-swipe-ignore>
      <p>免费切换。名字、饱食度和装扮各自保存，星星与库存共用。</p>
      <div class="species-grid"><button v-for="species in PET_SPECIES" :key="species.id" type="button" :class="{ selected: pet.data.selectedSpeciesId === species.id }" :aria-label="'选择' + species.name" :aria-pressed="pet.data.selectedSpeciesId === species.id" :disabled="pet.storageBlocked" @click="pet.selectSpecies(species.id)"><span class="species-portrait" :style="portrait(species.id, species.color)" aria-hidden="true"></span><span>{{ species.name }}</span><small>{{ pet.data.selectedSpeciesId === species.id ? '陪伴中' : pet.data.profiles[species.id].name }}</small></button></div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from 'vue';
import { usePetStore } from '../stores/pet';
import { PET_SPECIES, petSpecies, type PetSpeciesId } from '../data/petSpecies';
import { animationFrame } from '../lib/petAnimation';
import hamsterUrl from '../assets/pet/hamster-sheet.png';
const atlases = import.meta.glob('../assets/pet/species/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
const pet = usePetStore();
const open = ref(false);
const current = computed(() => petSpecies(pet.data.selectedSpeciesId));
function portrait(id: PetSpeciesId, color: string) {
  const frame = animationFrame(id, 'idle', 0);
  const url = id === 'hamster' ? hamsterUrl : atlases['../assets/pet/species/' + id + '.svg'];
  return { backgroundColor: color, backgroundImage: 'url(' + url + ')', backgroundSize: frame.backgroundSize, backgroundPosition: frame.backgroundPosition };
}
</script>
<style scoped>
.species-picker{margin-top:12px}.species-toggle{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;padding:12px 14px;min-height:44px;border:1px solid var(--card-border);border-radius:12px;background:var(--accent-soft);color:var(--accent-solid);font:inherit;font-size:13px}.species-options>p{font-size:12px;line-height:1.7;color:var(--text-2)}.species-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:8px}.species-grid button{min-width:0;display:flex;align-items:center;flex-direction:column;gap:5px;padding:8px 4px;border:1px solid var(--card-border);border-radius:14px;background:var(--card);color:var(--text);font-size:12px}.species-grid button.selected{border-color:var(--accent-solid);background:var(--accent-soft)}.species-portrait{display:block;width:56px;height:56px;border-radius:12px;background-repeat:no-repeat}.species-grid small{font-size:10px;max-width:100%;overflow-wrap:anywhere;color:var(--text-2)}.species-picker button:focus-visible{outline:2px solid var(--accent-solid);outline-offset:2px}
</style>
