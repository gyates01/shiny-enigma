const CATEGORY_ACCENTS = {
  breakfast: '#f59e0b',
  lunch:     '#22c55e',
  dinner:    '#7c6af7',
  dessert:   '#f43f5e',
  snack:     '#0ea5e9',
}

export const CUISINE_PALETTE = ['#f59e0b', '#22c55e', '#0ea5e9', '#f43f5e', '#a78bfa']

export function getCategoryAccent(category) {
  if (!category) return '#7a7e96'
  return CATEGORY_ACCENTS[category.toLowerCase().trim()] ?? '#7a7e96'
}
