import type { ExpenseCategory } from './domain'
import { CATEGORY_KEYWORDS } from './constants'

export function classifyCategory(text: string): ExpenseCategory {
  const hay = text.toLowerCase()
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [ExpenseCategory, string[]]
  >) {
    if (cat === 'otro') continue
    if (words.some((w) => hay.includes(w))) return cat
  }
  return 'otro'
}
