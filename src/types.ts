export type MealType = 'Breakfast' | 'Lunch' | 'Dinner'

export type ProteinCategory = {
  id: string
  name: string
  color: string
}

export type ShoppingCategory = {
  id: string
  name: string
}

export const defaultShoppingCategories: ShoppingCategory[] = [
  { id: 'produce', name: 'Produce' },
  { id: 'meat', name: 'Meat' },
  { id: 'dairy', name: 'Dairy' },
  { id: 'frozen', name: 'Frozen' },
  { id: 'aisle', name: 'Aisle' },
]

export type Ingredient = {
  id: string
  name: string
  unit: string
  proteinCategoryId: string | null
  shoppingCategoryId?: string | null
}

export type MealIngredient = {
  ingredientId: string
  quantity: number
}

export type Meal = {
  id: string
  name: string
  type: MealType
  proteinCategoryOverrideId: string | null
  ingredients: MealIngredient[]
}
export type Planner = Record<string, Record<string, string[]>>

export type PlannerRow = {
  id: string
  label: string
}

export type ManualShoppingItem = {
  id: string
  name: string
  checked: boolean
  shoppingCategoryId?: string | null
}

export type ShoppingItem = {
  lineId: string
  ingredientId: string
  name: string
  unit: string
  quantity: number
  checked: boolean
  shoppingCategoryId?: string | null
}

export type ShoppingHistoryItem = {
  id: string
  name: string
  lastPurchasedAt: string
  shoppingCategoryId?: string | null
}
export type AppState = {
  ingredients: Ingredient[]
  meals: Meal[]
  planner: Planner
  shoppingChecked: Record<string, boolean>
  manualShoppingItems: Record<string, ManualShoppingItem[]>
  proteinCategories: ProteinCategory[]
  plannerRowsByWeek: Record<string, PlannerRow[]>
  shoppingHistory: ShoppingHistoryItem[]
  plannerNotes: Record<string, Record<string, string>>
  shoppingPurchasesByWeek: Record<string, Record<string, number>>
  shoppingCategories?: ShoppingCategory[]
  shoppingCategoryOrder?: string[]
}
