import { mealTypes } from '../data'
import type { Ingredient, Meal, ProteinCategory } from '../types'
import { formatQuantity } from '../utils/text'
import { MealProteinDots } from './mealProtein'

export function MealsView({ meals, ingredients, onNew, onEdit, onDelete, onDuplicate, proteinCategories }: {
  meals: Meal[]; ingredients: Ingredient[]; onNew: () => void; onEdit: (m: Meal) => void; onDelete: (id: string) => void; onDuplicate: (m: Meal) => void; proteinCategories: ProteinCategory[]
}) {
  return (
    <section>
      <div className="section-header">
        <div><div className="eyebrow">LIBRARY</div><h2>Your Meals</h2></div>
        <button className="primary" onClick={onNew}>+ New meal</button>
      </div>
      <div className="meal-library-full">
        {mealTypes.map((type) => {
          const group = meals.filter((m) => m.type === type)
          return <div key={type} className="meal-library-section"><h3>{type}</h3>{group.map((meal) => <MealEditorCard key={meal.id} meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} onEdit={() => onEdit(meal)} onDelete={() => onDelete(meal.id)} onDuplicate={() => onDuplicate(meal)} />)}</div>
        })}
      </div>
    </section>
  )
}

function MealEditorCard({ meal, ingredients, proteinCategories, onEdit, onDelete, onDuplicate }: { meal: Meal; ingredients: Ingredient[]; proteinCategories: ProteinCategory[]; onEdit: () => void; onDelete: () => void; onDuplicate: () => void }) {
  return (
    <article className="meal-detail-card">
      <div className="meal-detail-top">
        <h3><MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />{meal.name}</h3>
        <span className="pill">{meal.type}</span>
      </div>
      <ul>{meal.ingredients.map((mi) => { const ing = ingredients.find((i) => i.id === mi.ingredientId); return ing ? <li key={mi.ingredientId}>{formatQuantity(mi.quantity)} {ing.unit} {ing.name}</li> : null })}</ul>
      <div className="card-actions"><button onClick={onDuplicate}>Duplicate meal</button><button onClick={onEdit}>Edit</button><button className="danger-text" onClick={onDelete}>Delete</button></div>
    </article>
  )
}
