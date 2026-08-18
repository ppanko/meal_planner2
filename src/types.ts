export type MealType = 'Breakfast' | 'Lunch' | 'Dinner'

export type ProteinCategory = {
  id: string
  name: string
  color: string
}

export type Ingredient = {
  id: string
  name: string
  unit: string
  proteinCategoryId: string | null
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

export type Planner = Record<string, Record<string, string | null>>

export type PlannerRow = {
  id: string
  label: string
}

export type ManualShoppingItem = {
  id: string
  name: string
  checked: boolean
}

export type ShoppingItem = {
  ingredientId: string
  name: string
  unit: string
  quantity: number
  checked: boolean
}

export type ShoppingHistoryItem = {
  id: string
  name: string
  lastPurchasedAt: string
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
}
