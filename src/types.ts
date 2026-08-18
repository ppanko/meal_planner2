export type MealType = 'Breakfast' | 'Lunch' | 'Dinner'

export type Ingredient = {
  id: string
  name: string
  unit: string
}

export type MealIngredient = {
  ingredientId: string
  quantity: number
}

export type Meal = {
  id: string
  name: string
  type: MealType
  ingredients: MealIngredient[]
}

export type Planner = Record<string, Record<MealType, string | null>>

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

export type AppState = {
  ingredients: Ingredient[]
  meals: Meal[]
  planner: Planner
  shoppingChecked: Record<string, boolean>
  manualShoppingItems: Record<string, ManualShoppingItem[]>
}
