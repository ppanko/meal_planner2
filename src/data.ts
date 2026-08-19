import type { AppState, MealType, ProteinCategory } from './types'

export const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner']

export const seedProteinCategories: ProteinCategory[] = [
  { id: 'chicken', name: 'Chicken', color: '#d6a84b' },
  { id: 'beef', name: 'Beef', color: '#a6534f' },
  { id: 'seafood', name: 'Seafood', color: '#4f86a6' },
  { id: 'pork', name: 'Pork', color: '#c98282' },
  { id: 'none', name: 'None', color: '#6f8f72' },
  { id: 'lamb', name: 'Lamb', color: '#8a6f4d' },
]

export const seedState: AppState = {
  proteinCategories: seedProteinCategories,
  plannerRowsByWeek: {},
  shoppingHistory: [],
  plannerNotes: {},
  shoppingPurchasesByWeek: {},
  ingredients: [
    { id: 'eggs', name: 'Eggs', unit: 'each', proteinCategoryId: null },
    { id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null },
    { id: 'flour', name: 'Flour', unit: 'cup', proteinCategoryId: null },
    { id: 'butter', name: 'Butter', unit: 'tbsp', proteinCategoryId: null },
    { id: 'ground-beef', name: 'Ground beef', unit: 'lb', proteinCategoryId: 'beef' },
    { id: 'tortillas', name: 'Tortillas', unit: 'each', proteinCategoryId: null },
    { id: 'tomatoes', name: 'Tomatoes', unit: 'each', proteinCategoryId: null },
    { id: 'onions', name: 'Onions', unit: 'each', proteinCategoryId: null },
    { id: 'lettuce', name: 'Lettuce', unit: 'head', proteinCategoryId: null },
    { id: 'cheese', name: 'Cheese', unit: 'oz', proteinCategoryId: null },
    { id: 'spaghetti', name: 'Spaghetti', unit: 'oz', proteinCategoryId: null },
    { id: 'tomato-sauce', name: 'Tomato sauce', unit: 'jar', proteinCategoryId: null },
    { id: 'garlic', name: 'Garlic', unit: 'clove', proteinCategoryId: null },
    { id: 'chicken', name: 'Chicken', unit: 'lb', proteinCategoryId: 'chicken' },
    { id: 'rice', name: 'Rice', unit: 'cup', proteinCategoryId: null },
    { id: 'broccoli', name: 'Broccoli', unit: 'head', proteinCategoryId: null },
  ],
  meals: [
    { id: 'pancakes', name: 'Pancakes', type: 'Breakfast', proteinCategoryOverrideId: null, recipeUrl: '', notes: '', instructions: [], ingredients: [
      { ingredientId: 'flour', quantity: 1.5 }, { ingredientId: 'eggs', quantity: 2 },
      { ingredientId: 'milk', quantity: 1 }, { ingredientId: 'butter', quantity: 2 },
    ]},
    { id: 'scrambled-eggs', name: 'Scrambled Eggs', type: 'Breakfast', proteinCategoryOverrideId: null, recipeUrl: '', notes: '', instructions: [], ingredients: [
      { ingredientId: 'eggs', quantity: 4 }, { ingredientId: 'butter', quantity: 1 },
    ]},
    { id: 'chicken-salad', name: 'Chicken Salad', type: 'Lunch', proteinCategoryOverrideId: null, recipeUrl: '', notes: '', instructions: [], ingredients: [
      { ingredientId: 'chicken', quantity: 1 }, { ingredientId: 'lettuce', quantity: 0.5 },
      { ingredientId: 'tomatoes', quantity: 2 },
    ]},
    { id: 'tacos', name: 'Tacos', type: 'Dinner', proteinCategoryOverrideId: null, recipeUrl: '', notes: '', instructions: [], ingredients: [
      { ingredientId: 'ground-beef', quantity: 1 }, { ingredientId: 'tortillas', quantity: 8 },
      { ingredientId: 'tomatoes', quantity: 2 }, { ingredientId: 'onions', quantity: 1 },
      { ingredientId: 'lettuce', quantity: 0.5 }, { ingredientId: 'cheese', quantity: 6 },
    ]},
    { id: 'spaghetti', name: 'Spaghetti Bolognese', type: 'Dinner', proteinCategoryOverrideId: null, recipeUrl: '', notes: '', instructions: [], ingredients: [
      { ingredientId: 'spaghetti', quantity: 16 }, { ingredientId: 'ground-beef', quantity: 1 },
      { ingredientId: 'tomato-sauce', quantity: 1 }, { ingredientId: 'onions', quantity: 1 },
      { ingredientId: 'garlic', quantity: 2 },
    ]},
    { id: 'chicken-rice', name: 'Chicken & Rice', type: 'Dinner', proteinCategoryOverrideId: null, recipeUrl: '', notes: '', instructions: [], ingredients: [
      { ingredientId: 'chicken', quantity: 1 }, { ingredientId: 'rice', quantity: 1.5 },
      { ingredientId: 'broccoli', quantity: 1 }, { ingredientId: 'garlic', quantity: 2 },
    ]},
  ],
  planner: {},
  shoppingChecked: {},
  manualShoppingItems: {},
}
