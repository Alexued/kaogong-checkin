export const PET_SPECIES_IDS = ['hamster', 'cat', 'shiba', 'rabbit', 'panda', 'fox', 'otter', 'penguin', 'bear', 'hedgehog', 'dragon'] as const;
export type PetSpeciesId = typeof PET_SPECIES_IDS[number];
export interface PetSpecies {
  id: PetSpeciesId;
  name: string;
  defaultName: string;
  icon: string;
  color: string;
  head: [number, number];
  body: [number, number];
  accessory: [number, number];
  prop: [number, number];
}
export const PET_SPECIES: PetSpecies[] = [
  { id: 'hamster', name: '仓鼠', defaultName: '小格', icon: '🐹', color: '#ead9b6', head: [50, 16], body: [50, 64], accessory: [12, 70], prop: [84, 45] },
  { id: 'cat', name: '猫咪', defaultName: '团团', icon: '🐱', color: '#f4d4bd', head: [48, 18], body: [49, 65], accessory: [13, 70], prop: [82, 48] },
  { id: 'shiba', name: '柴犬', defaultName: '豆柴', icon: '🐶', color: '#e4c7a1', head: [48, 18], body: [50, 65], accessory: [14, 73], prop: [84, 46] },
  { id: 'rabbit', name: '兔子', defaultName: '糯米', icon: '🐰', color: '#f1d4e4', head: [50, 29], body: [49, 70], accessory: [16, 76], prop: [80, 53] },
  { id: 'panda', name: '熊猫', defaultName: '竹竹', icon: '🐼', color: '#d5e5ce', head: [50, 20], body: [50, 65], accessory: [12, 73], prop: [85, 48] },
  { id: 'fox', name: '小狐狸', defaultName: '柚柚', icon: '🦊', color: '#f0cca7', head: [48, 20], body: [49, 64], accessory: [12, 70], prop: [82, 46] },
  { id: 'otter', name: '水獭', defaultName: '栗栗', icon: '🦦', color: '#d0e6e6', head: [50, 20], body: [50, 66], accessory: [16, 74], prop: [82, 48] },
  { id: 'penguin', name: '企鹅', defaultName: '冰团', icon: '🐧', color: '#d7e7f3', head: [50, 18], body: [50, 64], accessory: [15, 72], prop: [84, 47] },
  { id: 'bear', name: '小熊', defaultName: '蜜糖', icon: '🐻', color: '#e9d2b2', head: [50, 18], body: [50, 66], accessory: [12, 74], prop: [86, 47] },
  { id: 'hedgehog', name: '刺猬', defaultName: '松果', icon: '🦔', color: '#dddfbd', head: [47, 24], body: [48, 66], accessory: [12, 72], prop: [81, 47] },
  { id: 'dragon', name: '小龙', defaultName: '青芽', icon: '🐉', color: '#cfe6d9', head: [47, 24], body: [49, 66], accessory: [13, 73], prop: [83, 49] },
];
export function isPetSpecies(value: unknown): value is PetSpeciesId { return typeof value === 'string' && PET_SPECIES_IDS.includes(value as PetSpeciesId); }
export function petSpecies(id: PetSpeciesId): PetSpecies { return PET_SPECIES.find(species => species.id === id)!; }
export const PET_ACTIVITIES = ['idle', 'walk', 'run', 'jump', 'rope', 'climb', 'read', 'write', 'think', 'celebrate', 'dance', 'sleep', 'wash', 'bath', 'brush', 'exercise', 'meditate', 'music', 'paint', 'cook', 'game', 'eat'] as const;
export type PetActivity = typeof PET_ACTIVITIES[number];
export const PET_ATLAS = { columns: 8, rows: 11, framesPerActivity: 4 } as const;
