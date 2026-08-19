import { useMemo, useState } from 'react'
import type { Ingredient, Meal, ProteinCategory } from '../types'
import { slug } from '../utils/text'
import { ProteinDot } from './mealProtein'
import { useEscapeKey } from './useEscapeKey'

type MealLibraryManagerProps = {
  meals: Meal[]
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
  onClose: () => void
  onCreateIngredient: (ingredient: Ingredient) => void
  onDeleteIngredient: (ingredientId: string) => void
  onCreateProteinCategory: (category: ProteinCategory) => void
  onDeleteProteinCategory: (categoryId: string) => void
}

export function MealLibraryManager({ meals, ingredients, proteinCategories, onClose, onCreateIngredient, onDeleteIngredient, onCreateProteinCategory, onDeleteProteinCategory }: MealLibraryManagerProps) {
  useEscapeKey(onClose)
  const [panel, setPanel] = useState<'ingredients' | 'proteins'>('ingredients')
  const [ingredientName, setIngredientName] = useState('')
  const [ingredientUnit, setIngredientUnit] = useState('each')
  const [ingredientProteinId, setIngredientProteinId] = useState('')
  const [categoryName, setCategoryName] = useState('')
  const [categoryColor, setCategoryColor] = useState('#8a7f70')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const ingredientUsage = useMemo(() => new Set(meals.flatMap((meal) => meal.ingredients.map((item) => item.ingredientId))), [meals])
  const categoryUsage = useMemo(() => new Set([
    ...ingredients.map((ingredient) => ingredient.proteinCategoryId).filter((id): id is string => Boolean(id)),
    ...meals.map((meal) => meal.proteinCategoryOverrideId).filter((id): id is string => Boolean(id)),
  ]), [ingredients, meals])
  const visibleIngredients = ingredients
    .filter((ingredient) => ingredient.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
  const manageableCategories = proteinCategories.filter((category) => category.id !== 'none').slice().sort((a, b) => a.name.localeCompare(b.name))

  function addIngredient(event: React.FormEvent) {
    event.preventDefault()
    const name = ingredientName.trim()
    if (!name) return
    const id = slug(name)
    if (!id || ingredients.some((ingredient) => ingredient.id === id)) {
      setError('That ingredient already exists.')
      return
    }
    onCreateIngredient({ id, name, unit: ingredientUnit.trim() || 'each', proteinCategoryId: ingredientProteinId || null })
    setIngredientName('')
    setIngredientUnit('each')
    setIngredientProteinId('')
    setError('')
  }

  function addCategory(event: React.FormEvent) {
    event.preventDefault()
    const name = categoryName.trim()
    if (!name) return
    const id = slug(name)
    if (!id || proteinCategories.some((category) => category.id === id)) {
      setError('That protein category already exists.')
      return
    }
    onCreateProteinCategory({ id, name, color: categoryColor })
    setCategoryName('')
    setError('')
  }

  return <div className="modal-backdrop" onClick={onClose}>
    <div className="modal library-manager-modal" role="dialog" aria-modal="true" aria-labelledby="library-manager-title" onClick={(event) => event.stopPropagation()}>
      <div className="modal-header">
        <div><div className="eyebrow">MEAL LIBRARY</div><h2 id="library-manager-title">Manage library</h2></div>
        <button type="button" onClick={onClose} aria-label="Close">×</button>
      </div>
      <p className="library-manager-intro">Add reusable ingredients and protein categories here. Items already used by a meal are protected from deletion.</p>
      <div className="library-tabs" role="tablist" aria-label="Library sections">
        <button type="button" role="tab" aria-selected={panel === 'ingredients'} className={panel === 'ingredients' ? 'active' : ''} onClick={() => { setPanel('ingredients'); setError('') }}>Ingredients <small>{ingredients.length}</small></button>
        <button type="button" role="tab" aria-selected={panel === 'proteins'} className={panel === 'proteins' ? 'active' : ''} onClick={() => { setPanel('proteins'); setError('') }}>Protein categories <small>{manageableCategories.length}</small></button>
      </div>

      {panel === 'ingredients' ? <div className="library-panel" role="tabpanel">
        <form className="library-create-form ingredient-create-form" onSubmit={addIngredient}>
          <label>Name<input value={ingredientName} onChange={(event) => { setIngredientName(event.target.value); setError('') }} placeholder="e.g. Greek yogurt" autoFocus /></label>
          <label>Unit<input value={ingredientUnit} onChange={(event) => setIngredientUnit(event.target.value)} placeholder="each" /></label>
          <label>Protein<select value={ingredientProteinId} onChange={(event) => setIngredientProteinId(event.target.value)}><option value="">No protein</option>{manageableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <button className="primary" type="submit">Add ingredient</button>
        </form>
        <label className="library-search">Search ingredients<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" /></label>
        <div className="library-item-list">
          {visibleIngredients.map((ingredient) => {
            const category = proteinCategories.find((item) => item.id === ingredient.proteinCategoryId)
            const inUse = ingredientUsage.has(ingredient.id)
            return <div className="library-item" key={ingredient.id}>
              <div><strong>{ingredient.name}</strong><small>{ingredient.unit}{category ? <><span> · </span><ProteinDot category={category} /> {category.name}</> : ''}</small></div>
              {inUse ? <span className="library-in-use">In use</span> : <button type="button" className="danger-text" onClick={() => onDeleteIngredient(ingredient.id)} aria-label={`Delete ${ingredient.name}`}>Delete</button>}
            </div>
          })}
          {visibleIngredients.length === 0 && <div className="ingredient-manager-empty">No ingredients match your search.</div>}
        </div>
      </div> : <div className="library-panel" role="tabpanel">
        <form className="library-create-form category-create-form" onSubmit={addCategory}>
          <label>Name<input value={categoryName} onChange={(event) => { setCategoryName(event.target.value); setError('') }} placeholder="e.g. Turkey" autoFocus /></label>
          <label>Color<input className="protein-color-picker" type="color" value={categoryColor} onChange={(event) => setCategoryColor(event.target.value)} aria-label="Protein category color" /></label>
          <button className="primary" type="submit">Add category</button>
        </form>
        <div className="library-item-list">
          {manageableCategories.map((category) => {
            const inUse = categoryUsage.has(category.id)
            return <div className="library-item" key={category.id}>
              <div className="library-category-name"><ProteinDot category={category} /><strong>{category.name}</strong></div>
              {inUse ? <span className="library-in-use">In use</span> : <button type="button" className="danger-text" onClick={() => onDeleteProteinCategory(category.id)} aria-label={`Delete ${category.name} protein category`}>Delete</button>}
            </div>
          })}
        </div>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="primary" onClick={onClose}>Done</button></div>
    </div>
  </div>
}
