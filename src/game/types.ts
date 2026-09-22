/**
 * Canonical tea palette + shared game types.
 *
 * This is the single source of truth for `TeaId`, `CupSkinId`,
 * tea metadata and cup capacity. All other modules must import
 * from here instead of defining their own copies.
 */

export type TeaId =
  | 'matcha'
  | 'sea_buckthorn'
  | 'karkade'
  | 'milk_oolong'
  | 'lavender'
  | 'saffron'
  | 'buckwheat';

export type CupSkinId = 'glass' | 'ceramic' | 'porcelain';

export interface TeaType {
  id: TeaId;
  name: string;
  nameRu: string;
  colorHex: string;
  colorNum: number;
  textColor: string;
  steamColor: string;
  description: string;
}

export const TEA_TYPES: Record<TeaId, TeaType> = {
  matcha: {
    id: 'matcha',
    name: 'Matcha Tea',
    nameRu: 'Матча',
    colorHex: '#84B866',
    colorNum: 0x84b866,
    textColor: '#243b19',
    steamColor: 'rgba(132, 184, 102, 0.45)',
    description: 'Свежий зеленый японский чай',
  },
  sea_buckthorn: {
    id: 'sea_buckthorn',
    name: 'Sea Buckthorn',
    nameRu: 'Облепиховый',
    colorHex: '#FFA834',
    colorNum: 0xffa834,
    textColor: '#572b04',
    steamColor: 'rgba(255, 168, 52, 0.45)',
    description: 'Теплый янтарно-цитрусовый настой',
  },
  karkade: {
    id: 'karkade',
    name: 'Karkade Berry',
    nameRu: 'Каркаде',
    colorHex: '#D6405C',
    colorNum: 0xd6405c,
    textColor: '#3d0c15',
    steamColor: 'rgba(214, 64, 92, 0.45)',
    description: 'Глубокий рубиново-ягодный настой',
  },
  milk_oolong: {
    id: 'milk_oolong',
    name: 'Milk Oolong / Latte',
    nameRu: 'Молочный улун',
    colorHex: '#F5D6B8',
    colorNum: 0xf5d6b8,
    textColor: '#4a2f18',
    steamColor: 'rgba(245, 214, 184, 0.45)',
    description: 'Нежный сливочно-кофейный купаж',
  },
  lavender: {
    id: 'lavender',
    name: 'Lavender Herbal',
    nameRu: 'Лавандовый чай',
    colorHex: '#A79AFE',
    colorNum: 0xa79afe,
    textColor: '#292257',
    steamColor: 'rgba(167, 154, 254, 0.45)',
    description: 'Ароматный цветочный настой',
  },
  saffron: {
    id: 'saffron',
    name: 'Golden Saffron',
    nameRu: 'Золотой шафран',
    colorHex: '#F2C94C',
    colorNum: 0xf2c94c,
    textColor: '#47360a',
    steamColor: 'rgba(242, 201, 76, 0.45)',
    description: 'Драгоценный солнечный шафрановый купаж',
  },
  buckwheat: {
    id: 'buckwheat',
    name: 'Buckwheat Ku Qiao',
    nameRu: 'Гречишный чай',
    colorHex: '#C49A45',
    colorNum: 0xc49a45,
    textColor: '#3d2b0e',
    steamColor: 'rgba(196, 154, 69, 0.45)',
    description: 'Теплый медовый чай с нотками свежей выпечки',
  },
};

export const ALL_TEA_IDS: readonly TeaId[] = [
  'matcha',
  'sea_buckthorn',
  'karkade',
  'milk_oolong',
  'lavender',
  'saffron',
  'buckwheat',
];

export const MAX_CUP_CAPACITY = 4;
