import { PET_ACTIVITIES, PET_ATLAS, petSpecies, type PetSpeciesId } from '../data/petSpecies';
const hamsterFrames: Record<string, number[]> = { idle: [0, 5], walk: [1, 2], run: [1, 2, 8], jump: [0, 6, 7], rope: [0, 6, 0, 7], climb: [1, 8], read: [0, 5], write: [6, 7], think: [0, 5], celebrate: [6, 7], dance: [6, 7, 0], eat: [3, 4, 5], sleep: [4], wash: [5, 7], bath: [5, 7], brush: [5, 6], exercise: [6, 7], meditate: [0, 4], music: [6, 7], paint: [6, 7], cook: [3, 5], game: [6, 7] };
export function animationFrame(speciesId: PetSpeciesId, activity: string, tick: number) {
  const legacy = speciesId === 'hamster';
  const activityIndex = Math.max(0, PET_ACTIVITIES.findIndex(value => value === activity));
  const sequence = hamsterFrames[activity] || hamsterFrames.idle;
  const frame = legacy ? sequence[tick % sequence.length] : activityIndex * PET_ATLAS.framesPerActivity + tick % PET_ATLAS.framesPerActivity;
  const columns = legacy ? 3 : PET_ATLAS.columns;
  const rows = legacy ? 3 : PET_ATLAS.rows;
  return { frame, backgroundSize: columns * 100 + '% ' + rows * 100 + '%', backgroundPosition: frame % columns / (columns - 1) * 100 + '% ' + Math.floor(frame / columns) / (rows - 1) * 100 + '%' };
}
export function outfitAnchor(speciesId: PetSpeciesId, outfitId: string): [number, number] {
  const species = petSpecies(speciesId);
  if (['shirt1', 'shirt2', 'dress'].includes(outfitId)) return species.body;
  if (['scarf', 'tie'].includes(outfitId)) return [species.body[0], species.body[1] - 10];
  if (['glasses1', 'glasses2'].includes(outfitId)) return [species.head[0], speciesId === 'hamster' ? 39 : 42];
  return speciesId === 'hamster' ? species.head : [50, 28];
}
