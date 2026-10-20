/** 王朝模式：静态定义与初始数值 */

export const RESOURCE_KEYS = [
  'prestige',
  'popularity',
  'treasury',
  'military',
  'intelligence',
  'clan',
]

export const RESOURCE_LABELS = {
  prestige: '威望',
  popularity: '民心',
  treasury: '国库',
  military: '军力',
  intelligence: '圣听',
  clan: '宗室',
}

export const FACTIONS = {
  qingliu: { id: 'qingliu', name: '清流', color: '#6f9d92' },
  xungui: { id: 'xungui', name: '勋贵', color: '#c9a227' },
  hanmen: { id: 'hanmen', name: '寒门', color: '#8b7bb0' },
  bianjun: { id: 'bianjun', name: '边军', color: '#b0443c' },
  zongshi: { id: 'zongshi', name: '宗室', color: '#d9b382' },
  neiting: { id: 'neiting', name: '内廷', color: '#9c8f7c' },
  hougong: { id: 'hougong', name: '后宫', color: '#b98bb0' },
}

export const ROLE_DEFS = [
  { key: 'minister', label: '朝臣', count: 8, factions: ['qingliu', 'xungui', 'hanmen', 'bianjun'] },
  { key: 'clan', label: '宗室', count: 4, factions: ['zongshi'] },
  { key: 'consort', label: '后宫', count: 8, factions: ['hougong'] },
  { key: 'servant', label: '侍从', count: 4, factions: ['neiting'] },
]

export const OFFICE_TITLES = {
  minister: ['中书令', '门下侍郎', '户部尚书', '兵部侍郎', '御史中丞', '大理寺卿', '镇北将军', '翰林侍读'],
  clan: ['宗正卿', '安乐王', '长公主', '临川侯'],
  consort: ['贵妃', '贵人', '昭仪', '才人', '乐师', '侍读'],
  servant: ['内侍监', '尚宫', '掌印太监', '女官'],
}

// 内置随机头像数量：文件在 public/data/dynasty/avatars/{gender}/
export const AVATAR_COUNTS = {
  male: 10,
  female: 4,
}

export const INITIAL_RULER = {
  age: 16,
  health: 82,
  lifespan: 58,
  gender: '女',
}

export const INITIAL_RESOURCES = {
  prestige: 55,
  popularity: 60,
  treasury: 12000,
  military: 45,
  intelligence: 40,
  clan: 55,
}
