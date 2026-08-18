import type { AppState, MealType } from './types'

export const mealTypes: MealType[] = ['Breakfast', 'Lunch', 'Dinner']

export const seedState: AppState = {
  ingredients: [
    { id: 'eggs', name: 'Eggs', unit: 'each' },
    { id: 'milk', name: 'Milk', unit: 'cup' },
    { id: 'flour', name: 'Flour', unit: 'cup' },
    { id: 'butter', name: 'Butter', unit: 'tbsp' },
    { id: 'ground-beef', name: 'Ground beef', unit: 'lb' },
    { id: 'tortillas', name: 'Tortillas', unit: 'each' },
    { id: 'tomatoes', name: 'Tomatoes', unit: 'each' },
    { id: 'onions', name: 'Onions', unit: 'each' },
    { id: 'lettuce', name: 'Lettuce', unit: 'head' },
    { id: 'cheese', name: 'Cheese', unit: 'oz' },
    { id: 'spaghetti', name: 'Spaghetti', unit: 'oz' },
    { id: 'tomato-sauce', name: 'Tomato sauce', unit: 'jar' },
    { id: 'garlic', name: 'Garlic', unit: 'clove' },
    { id: 'chicken', name: 'Chicken', unit: 'lb' },
    { id: 'rice', name: 'Rice', unit: 'cup' },
    { id: 'broccoli', name: 'Broccoli', unit: 'head' },
  ],
  meals: [
    { id: 'pancakes', name: 'Pancakes', type: 'Breakfast', ingredients: [
      { ingredientId: 'flour', quantity: 1.5 }, { ingredientId: 'eggs', quantity: 2 },
      { ingredientId: 'milk', quantity: 1 }, { ingredientId: 'butter', quantity: 2 },
    ]},
    { id: 'scrambled-eggs', name: 'Scrambled Eggs', type: 'Breakfast', ingredients: [
      { ingredientId: 'eggs', quantity: 4 }, { ingredientId: 'butter', quantity: 1 },
    ]},
    { id: 'chicken-salad', name: 'Chicken Salad', type: 'Lunch', ingredients: [
      { ingredientId: 'chicken', quantity: 1 }, { ingredientId: 'lettuce', quantity: 0.5 },
      { ingredientId: 'tomatoes', quantity: 2 },
    ]},
    { id: 'tacos', name: 'Tacos', type: 'Dinner', ingredients: [
      { ingredientId: 'ground-beef', quantity: 1 }, { ingredientId: 'tortillas', quantity: 8 },
      { ingredientId: 'tomatoes', quantity: 2 }, { ingredientId: 'onions', quantity: 1 },
      { ingredientId: 'lettuce', quantity: 0.5 }, { ingredientId: 'cheese', quantity: 6 },
    ]},
    { id: 'spaghetti', name: 'Spaghetti Bolognese', type: 'Dinner', ingredients: [
      { ingredientId: 'spaghetti', quantity: 16 }, { ingredientId: 'ground-beef', quantity: 1 },
      { ingredientId: 'tomato-sauce', quantity: 1 }, { ingredientId: 'onions', quantity: 1 },
      { ingredientId: 'garlic', quantity: 2 },
    ]},
    { id: 'chicken-rice', name: 'Chicken & Rice', type: 'Dinner', ingredients: [
      { ingredientId: 'chicken', quantity: 1 }, { ingredientId: 'rice', quantity: 1.5 },
      { ingredientId: 'broccoli', quantity: 1 }, { ingredientId: 'garlic', quantity: 2 },
    ]},
  ],
  planner: {},
  shoppingChecked: {},
  manualShoppingItems: {},
}
