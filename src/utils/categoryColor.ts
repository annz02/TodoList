export interface PaperTheme {
  id: string;
  name: string;
  bg: string;
  chip: string;
}

export const NOTY_PALETTE: PaperTheme[] = [
  {
    id: 'green',
    name: '薄荷绿',
    bg: '#9FE3C5',
    chip: '#10B981',
  },
  {
    id: 'pink',
    name: '玫瑰粉',
    bg: '#F9B7CA',
    chip: '#EC4899',
  },
  {
    id: 'sand',
    name: '沙色金',
    bg: '#E7D4AA',
    chip: '#B45309',
  },
  {
    id: 'blue',
    name: '经典蓝',
    bg: '#B8DCFB',
    chip: '#3B82F6',
  },
  {
    id: 'amber',
    name: '蜜桃橙',
    bg: '#FBC396',
    chip: '#F59E0B',
  },
];

export function getPaperTheme(colorOrCategory?: string): PaperTheme {
  if (!colorOrCategory) return NOTY_PALETTE[1]; // Default Pink (#FBCFE8)
  const query = colorOrCategory.trim().toLowerCase();

  const byId = NOTY_PALETTE.find((p) => p.id === query);
  if (byId) return byId;

  if (query.includes('绿') || query.includes('green') || query.includes('开发') || query === '#10b981') return NOTY_PALETTE[0];
  if (query.includes('粉') || query.includes('pink') || query.includes('生活') || query === '#ec4899') return NOTY_PALETTE[1];
  if (query.includes('沙') || query.includes('sand') || query.includes('金') || query === '#e7dbb8') return NOTY_PALETTE[2];
  if (query.includes('蓝') || query.includes('blue') || query.includes('工作') || query === '#3b82f6') return NOTY_PALETTE[3];
  if (query.includes('橙') || query.includes('黄') || query.includes('amber') || query.includes('学习') || query.includes('紧急') || query === '#f59e0b') return NOTY_PALETTE[4];

  let hash = 0;
  for (let i = 0; i < query.length; i++) {
    hash = (hash << 5) - hash + query.charCodeAt(i);
  }
  return NOTY_PALETTE[Math.abs(hash) % NOTY_PALETTE.length];
}

export function getCategoryStyle(name?: string) {
  const theme = getPaperTheme(name);
  return {
    bg: theme.bg,
    text: '#1E293B',
    border: 'rgba(0,0,0,0.1)',
    darkBg: theme.bg,
    darkText: '#1E293B',
    darkBorder: 'rgba(0,0,0,0.1)',
  };
}
