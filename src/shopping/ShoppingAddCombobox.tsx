import { IngredientPicker } from '../ingredients/IngredientPicker'
import type { Ingredient } from '../types'

export function ShoppingAddCombobox({
  ingredients,
  onSelectIngredient,
  onAddManual,
  onCreate,
}: {
  ingredients: Ingredient[]
  onSelectIngredient: (ingredientId: string) => void
  onAddManual: (name: string) => void
  onCreate: (name: string) => void
}) {
  return (
    <div className="shopping-add-shell shopping-ingredient-entry">
      <IngredientPicker
        label="Add shopping list item"
        ingredients={ingredients}
        value=""
        onChange={(ingredientId) => {
          if (ingredientId) onSelectIngredient(ingredientId)
        }}
        onCreate={onCreate}
        createLabel={(name) => `Create “${name}” as ingredient…`}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: onAddManual,
        }}
      />
    </div>
  )
}
