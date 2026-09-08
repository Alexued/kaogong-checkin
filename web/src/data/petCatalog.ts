export const PET_CATEGORIES = ['actions', 'states', 'outfits', 'foods', 'backgrounds', 'accessories', 'vehicles'] as const;
export type PetCategory = typeof PET_CATEGORIES[number];
export type PetSlot = 'action' | 'state' | 'outfit' | 'background' | 'accessory' | 'vehicle';
export interface PetItem { id: string; icon: string; name: string; cost: number }
export const PET_CATEGORY_LABELS: Record<PetCategory, string> = { actions: '动作', states: '状态', outfits: '服装', foods: '食物', backgrounds: '背景', accessories: '配饰', vehicles: '交通工具' };
export const PET_SLOTS: Partial<Record<PetCategory, PetSlot>> = { actions: 'action', states: 'state', outfits: 'outfit', backgrounds: 'background', accessories: 'accessory', vehicles: 'vehicle' };
export const PET_CATALOG: Record<PetCategory, PetItem[]> = {
  "actions": [
    {
      "id": "walk",
      "icon": "🚶",
      "name": "走路",
      "cost": 10
    },
    {
      "id": "run",
      "icon": "🏃",
      "name": "跑步",
      "cost": 20
    },
    {
      "id": "jump",
      "icon": "🦘",
      "name": "跳跃",
      "cost": 15
    },
    {
      "id": "rope",
      "icon": "🪢",
      "name": "跳绳",
      "cost": 25
    },
    {
      "id": "climb",
      "icon": "🧗",
      "name": "爬行",
      "cost": 20
    },
    {
      "id": "read",
      "icon": "📖",
      "name": "看书",
      "cost": 30
    },
    {
      "id": "write",
      "icon": "✍️",
      "name": "写字",
      "cost": 30
    },
    {
      "id": "think",
      "icon": "🤔",
      "name": "思考",
      "cost": 25
    },
    {
      "id": "celebrate",
      "icon": "🎉",
      "name": "庆祝",
      "cost": 35
    },
    {
      "id": "dance",
      "icon": "💃",
      "name": "跳舞",
      "cost": 40
    }
  ],
  "outfits": [
    {
      "id": "hat1",
      "icon": "🎩",
      "name": "礼帽",
      "cost": 50
    },
    {
      "id": "hat2",
      "icon": "🎓",
      "name": "学士帽",
      "cost": 60
    },
    {
      "id": "hat3",
      "icon": "👑",
      "name": "皇冠",
      "cost": 100
    },
    {
      "id": "glasses1",
      "icon": "👓",
      "name": "眼镜",
      "cost": 40
    },
    {
      "id": "glasses2",
      "icon": "🕶️",
      "name": "墨镜",
      "cost": 45
    },
    {
      "id": "scarf",
      "icon": "🧣",
      "name": "围巾",
      "cost": 35
    },
    {
      "id": "tie",
      "icon": "👔",
      "name": "领带",
      "cost": 40
    },
    {
      "id": "shirt1",
      "icon": "👕",
      "name": "T恤",
      "cost": 50
    },
    {
      "id": "shirt2",
      "icon": "👔",
      "name": "西装",
      "cost": 80
    },
    {
      "id": "dress",
      "icon": "👗",
      "name": "裙子",
      "cost": 70
    }
  ],
  "foods": [
    {
      "id": "apple",
      "icon": "🍎",
      "name": "苹果",
      "cost": 5
    },
    {
      "id": "banana",
      "icon": "🍌",
      "name": "香蕉",
      "cost": 5
    },
    {
      "id": "orange",
      "icon": "🍊",
      "name": "橙子",
      "cost": 5
    },
    {
      "id": "grape",
      "icon": "🍇",
      "name": "葡萄",
      "cost": 8
    },
    {
      "id": "watermelon",
      "icon": "🍉",
      "name": "西瓜",
      "cost": 10
    },
    {
      "id": "cake",
      "icon": "🍰",
      "name": "蛋糕",
      "cost": 15
    },
    {
      "id": "cookie",
      "icon": "🍪",
      "name": "饼干",
      "cost": 8
    },
    {
      "id": "candy",
      "icon": "🍬",
      "name": "糖果",
      "cost": 6
    },
    {
      "id": "icecream",
      "icon": "🍦",
      "name": "冰淇淋",
      "cost": 12
    },
    {
      "id": "pizza",
      "icon": "🍕",
      "name": "披萨",
      "cost": 20
    }
  ],
  "backgrounds": [
    {
      "id": "grass",
      "icon": "🌱",
      "name": "草地",
      "cost": 30
    },
    {
      "id": "beach",
      "icon": "🏖️",
      "name": "海滩",
      "cost": 40
    },
    {
      "id": "mountain",
      "icon": "⛰️",
      "name": "山地",
      "cost": 50
    },
    {
      "id": "forest",
      "icon": "🌲",
      "name": "森林",
      "cost": 45
    },
    {
      "id": "city",
      "icon": "🏙️",
      "name": "城市",
      "cost": 60
    },
    {
      "id": "space",
      "icon": "🌌",
      "name": "太空",
      "cost": 80
    },
    {
      "id": "castle",
      "icon": "🏰",
      "name": "城堡",
      "cost": 70
    },
    {
      "id": "garden",
      "icon": "🏡",
      "name": "花园",
      "cost": 50
    },
    {
      "id": "snow",
      "icon": "❄️",
      "name": "雪地",
      "cost": 55
    },
    {
      "id": "desert",
      "icon": "🏜️",
      "name": "沙漠",
      "cost": 45
    }
  ],
  "states": [
    {
      "id": "sleep",
      "icon": "😴",
      "name": "睡觉",
      "cost": 20
    },
    {
      "id": "wash",
      "icon": "🚿",
      "name": "洗脸",
      "cost": 25
    },
    {
      "id": "bath",
      "icon": "🛁",
      "name": "洗澡",
      "cost": 30
    },
    {
      "id": "brush",
      "icon": "🪥",
      "name": "刷牙",
      "cost": 20
    },
    {
      "id": "exercise",
      "icon": "🏋️",
      "name": "锻炼",
      "cost": 35
    },
    {
      "id": "meditate",
      "icon": "🧘",
      "name": "冥想",
      "cost": 40
    },
    {
      "id": "music",
      "icon": "🎵",
      "name": "听音乐",
      "cost": 30
    },
    {
      "id": "paint",
      "icon": "🎨",
      "name": "画画",
      "cost": 45
    },
    {
      "id": "cook",
      "icon": "🍳",
      "name": "做饭",
      "cost": 35
    },
    {
      "id": "game",
      "icon": "🎮",
      "name": "游戏",
      "cost": 40
    }
  ],
  "accessories": [
    {
      "id": "bag",
      "icon": "🎒",
      "name": "背包",
      "cost": 40
    },
    {
      "id": "watch",
      "icon": "⌚",
      "name": "手表",
      "cost": 50
    },
    {
      "id": "phone",
      "icon": "📱",
      "name": "手机",
      "cost": 60
    },
    {
      "id": "book",
      "icon": "📚",
      "name": "书籍",
      "cost": 35
    },
    {
      "id": "umbrella",
      "icon": "☂️",
      "name": "雨伞",
      "cost": 30
    },
    {
      "id": "balloon",
      "icon": "🎈",
      "name": "气球",
      "cost": 25
    },
    {
      "id": "flower",
      "icon": "🌺",
      "name": "花朵",
      "cost": 30
    },
    {
      "id": "star",
      "icon": "⭐",
      "name": "星星",
      "cost": 45
    },
    {
      "id": "heart",
      "icon": "💝",
      "name": "爱心",
      "cost": 40
    },
    {
      "id": "gift",
      "icon": "🎁",
      "name": "礼物",
      "cost": 50
    }
  ],
  "vehicles": [
    {
      "id": "bike",
      "icon": "🚲",
      "name": "自行车",
      "cost": 60
    },
    {
      "id": "car",
      "icon": "🚗",
      "name": "汽车",
      "cost": 100
    },
    {
      "id": "plane",
      "icon": "✈️",
      "name": "飞机",
      "cost": 150
    },
    {
      "id": "rocket",
      "icon": "🚀",
      "name": "火箭",
      "cost": 200
    },
    {
      "id": "boat",
      "icon": "🚤",
      "name": "快艇",
      "cost": 120
    },
    {
      "id": "train",
      "icon": "🚆",
      "name": "火车",
      "cost": 110
    },
    {
      "id": "bus",
      "icon": "🚌",
      "name": "巴士",
      "cost": 90
    },
    {
      "id": "scooter",
      "icon": "🛴",
      "name": "滑板车",
      "cost": 70
    },
    {
      "id": "skateboard",
      "icon": "🛹",
      "name": "滑板",
      "cost": 65
    },
    {
      "id": "helicopter",
      "icon": "🚁",
      "name": "直升机",
      "cost": 180
    }
  ]
};
export function petItem(category: PetCategory, id: string) { return PET_CATALOG[category]?.find((item) => item.id === id); }

