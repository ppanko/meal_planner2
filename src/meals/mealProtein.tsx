import type { Ingredient, Meal, ProteinCategory } from '../types'

export function ProteinDot({ category }: { category: ProteinCategory | undefined }) {
  return (
    <span
      className="protein-dot"
      style={{ backgroundColor: category?.color ?? '#6f8f72' }}
      aria-label={category?.name ?? 'None'}
      title={category?.name ?? 'None'}
    />
  )
}

export function getMealProteinCategories(
  meal: Meal,
  ingredients: Ingredient[],
  proteinCategories: ProteinCategory[],
): ProteinCategory[] {
  if (meal.proteinCategoryOverrideId) {
    const override = proteinCategories.find(
      (category) => category.id === meal.proteinCategoryOverrideId,
    )
    return override ? [override] : []
  }

  const ids = new Set(
    meal.ingredients
      .map((item) =>
        ingredients.find((ingredient) => ingredient.id === item.ingredientId)?.proteinCategoryId,
      )
      .filter((id): id is string => Boolean(id)),
  )

  return [...ids]
    .map((id) => proteinCategories.find((category) => category.id === id))
    .filter((category): category is ProteinCategory => Boolean(category))
}

export function MealProteinDots({
  meal,
  ingredients,
  proteinCategories,
}: {
  meal: Meal
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
}) {
  const categories = getMealProteinCategories(meal, ingredients, proteinCategories)

  if (categories.length === 0) {
    const none = proteinCategories.find((category) => category.id === 'none')
    return <ProteinDot category={none} />
  }

  return (
    <span className="protein-dot-group">
      {categories.map((category) => (
        <ProteinDot key={category.id} category={category} />
      ))}
    </span>
  )
}
