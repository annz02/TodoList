export interface CategoryStyle {
  bg: string;
  text: string;
  border: string;
  darkBg: string;
  darkText: string;
  darkBorder: string;
}

const COLOR_LIST: CategoryStyle[] = [
  // 0: 蓝 (工作)
  { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', darkBg: 'rgba(59, 130, 246, 0.25)', darkText: '#93c5fd', darkBorder: 'rgba(147, 197, 253, 0.4)' },
  // 1: 绿 (开发)
  { bg: '#dcfce7', text: '#15803d', border: '#86efac', darkBg: 'rgba(34, 197, 94, 0.25)', darkText: '#86efac', darkBorder: 'rgba(134, 239, 172, 0.4)' },
  // 2: 橙 (学习)
  { bg: '#ffedd5', text: '#c2410c', border: '#fdba74', darkBg: 'rgba(249, 115, 22, 0.25)', darkText: '#fdba74', darkBorder: 'rgba(253, 186, 116, 0.4)' },
  // 3: 粉 (生活)
  { bg: '#fce7f3', text: '#be185d', border: '#f9a8d4', darkBg: 'rgba(236, 72, 153, 0.25)', darkText: '#f9a8d4', darkBorder: 'rgba(249, 168, 212, 0.4)' },
  // 4: 紫 (设计)
  { bg: '#f3e8ff', text: '#6b21a8', border: '#d8b4fe', darkBg: 'rgba(168, 85, 247, 0.25)', darkText: '#d8b4fe', darkBorder: 'rgba(216, 180, 254, 0.4)' },
  // 5: 红 (紧急)
  { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', darkBg: 'rgba(239, 68, 68, 0.25)', darkText: '#fca5a5', darkBorder: 'rgba(252, 165, 165, 0.4)' },
  // 6: 青 (其它)
  { bg: '#ccfbf1', text: '#0f766e', border: '#99f6e4', darkBg: 'rgba(20, 184, 166, 0.25)', darkText: '#99f6e4', darkBorder: 'rgba(153, 246, 228, 0.4)' },
  // 7: 灰 (未分类)
  { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1', darkBg: 'rgba(100, 116, 139, 0.25)', darkText: '#cbd5e1', darkBorder: 'rgba(203, 213, 225, 0.4)' },
];

const PRESET_INDEXES: Record<string, number> = {
  '工作': 0,
  '开发': 1,
  '学习': 2,
  '生活': 3,
  '设计': 4,
  '紧急': 5,
  '未分类': 7,
};

const dynamicCategoryMap = new Map<string, number>();
let nextColorIndex = 0;

export function getCategoryStyle(name?: string): CategoryStyle {
  if (!name || !name.trim()) return COLOR_LIST[7];
  const trimmed = name.trim();

  if (PRESET_INDEXES[trimmed] !== undefined) {
    return COLOR_LIST[PRESET_INDEXES[trimmed]];
  }

  if (!dynamicCategoryMap.has(trimmed)) {
    dynamicCategoryMap.set(trimmed, nextColorIndex % 7);
    nextColorIndex++;
  }

  return COLOR_LIST[dynamicCategoryMap.get(trimmed)!];
}
