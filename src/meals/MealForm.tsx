import { useState } from 'react'
import { mealTypes } from '../data'
import type { Ingredient, Meal, MealType, ProteinCategory } from '../types'
import { slug } from '../utils/text'
import { ProteinDot } from './mealProtein'

export function MealForm({ meal, meals, ingredients, proteinCategories, duplicateMode = false, onCancel, onSave, onCreateIngredient, onDeleteIngredient, onCreateProteinCategory, onDeleteProteinCategory }: {
  meal: Meal | null | undefined; meals: Meal[]; ingredients: Ingredient[]; proteinCategories: ProteinCategory[]; duplicateMode?: boolean; onCancel: () => void; onSave: (meal: Meal, oldId?: string) => void; onCreateIngredient: (ingredient: Ingredient) => void; onDeleteIngredient: (ingredientId: string) => void; onCreateProteinCategory: (category: ProteinCategory) => void; onDeleteProteinCategory: (categoryId: string) => void
}) {
  const [name, setName] = useState(meal?.name ?? '')
  const [type, setType] = useState<MealType>(meal?.type ?? 'Dinner')
  const [proteinCategoryOverrideId, setProteinCategoryOverrideId] = useState(meal?.proteinCategoryOverrideId ?? '')
  const [newProteinCategory, setNewProteinCategory] = useState('')
  const [newProteinColor, setNewProteinColor] = useState('#8a7f70')
  const [rows, setRows] = useState(meal?.ingredients ?? [])
  const [newIngredient, setNewIngredient] = useState('')
  const [newIngredientProteinCategoryId, setNewIngredientProteinCategoryId] = useState('')
  const [showIngredientManager, setShowIngredientManager] = useState(false)
  const [showProteinCategoryManager, setShowProteinCategoryManager] = useState(false)

  const unusedIngredients = ingredients.filter((ingredient) => {
    const usedInSavedMeal = meals.some((savedMeal) =>
      savedMeal.ingredients.some((item) => item.ingredientId === ingredient.id),
    )
    const usedInCurrentForm = rows.some((row) => row.ingredientId === ingredient.id)
    return !usedInSavedMeal && !usedInCurrentForm
  })

  const manageableProteinCategories = proteinCategories
    .filter((category) => category.id !== 'none')
    .map((category) => ({
      category,
      inUse:
        ingredients.some((ingredient) => ingredient.proteinCategoryId === category.id) ||
        meals.some((savedMeal) => savedMeal.proteinCategoryOverrideId === category.id),
    }))
    .sort((a, b) => a.category.name.localeCompare(b.category.name))

  function removeProteinCategory(categoryId: string) {
    const target = manageableProteinCategories.find(({ category }) => category.id === categoryId)
    if (!target || target.inUse) return

    if (proteinCategoryOverrideId === categoryId) {
      setProteinCategoryOverrideId('')
    }
    if (newIngredientProteinCategoryId === categoryId) {
      setNewIngredientProteinCategoryId('')
    }

    onDeleteProteinCategory(categoryId)
  }

  function addRow() {
    const first = ingredients[0]
    if (first) setRows([...rows, { ingredientId: first.id, quantity: 1 }])
  }
  function addNewIngredient() {
    const trimmed = newIngredient.trim()
    if (!trimmed) return
    const id = slug(trimmed)
    const ingredient: Ingredient = { id, name: trimmed, unit: 'each', proteinCategoryId: newIngredientProteinCategoryId || null }
    onCreateIngredient(ingredient)
    setRows([...rows, { ingredientId: id, quantity: 1 }])
    setNewIngredient('')
    setNewIngredientProteinCategoryId('')
  }
  function save() {
    if (!name.trim() || rows.length === 0) return
    onSave(
      {
        id: meal?.id ?? crypto.randomUUID(),
        name: name.trim(),
        type,
        proteinCategoryOverrideId: proteinCategoryOverrideId || null,
        ingredients: rows,
      },
      duplicateMode ? undefined : meal?.id,
    )
  }

  return (
    <div className="modal-backdrop"><div className="modal">
      <div className="modal-header"><h2>{duplicateMode ? 'Duplicate meal' : meal ? 'Edit meal' : 'New meal'}</h2><button onClick={onCancel}>×</button></div>
      <label>Name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Chicken tacos" autoFocus /></label>
      <label>Type<select value={type} onChange={(e) => setType(e.target.value as MealType)}>{mealTypes.map((t) => <option key={t}>{t}</option>)}</select></label>
      <label>
        Protein
        <select
          value={proteinCategoryOverrideId}
          onChange={(e) => setProteinCategoryOverrideId(e.target.value)}
        >
          <option value="">Auto from ingredients</option>
          {proteinCategories.map((category) => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </label>
      <div className="protein-guide">
        {proteinCategories.map((category) => (
          <span key={category.id}><ProteinDot category={category} />{category.name}</span>
        ))}
      </div>
      <div className="new-protein-category">
        <input
          value={newProteinCategory}
          onChange={(e) => setNewProteinCategory(e.target.value)}
          placeholder="New protein category"
        />
        <input
          className="protein-color-picker"
          type="color"
          value={newProteinColor}
          onChange={(e) => setNewProteinColor(e.target.value)}
          aria-label="Protein category color"
          title="Choose category color"
        />
        <button
          type="button"
          onClick={() => {
            const categoryName = newProteinCategory.trim()
            if (!categoryName) return

            const id = slug(categoryName)
            const existing = proteinCategories.find((category) => category.id === id)
            if (existing) {
              setProteinCategoryOverrideId(existing.id)
              setNewProteinCategory('')
              return
            }

            const category: ProteinCategory = {
              id,
              name: categoryName,
              color: newProteinColor,
            }

            onCreateProteinCategory(category)
            setProteinCategoryOverrideId(id)
            setNewProteinCategory('')
          }}
        >
          Add category
        </button>
      </div>

      <div className="protein-category-manager">
        <button
          type="button"
          className="ingredient-manager-toggle"
          onClick={() => setShowProteinCategoryManager((open) => !open)}
        >
          <span>{showProteinCategoryManager ? 'Hide protein categories' : 'Manage protein categories'}</span>
          <small>{manageableProteinCategories.filter(({ inUse }) => !inUse).length}</small>
        </button>

        {showProteinCategoryManager && (
          <div className="ingredient-manager-panel">
            <p>Unused categories can be deleted. Categories assigned to an ingredient or saved meal are marked in use.</p>
            {manageableProteinCategories.length > 0 ? (
              <div className="ingredient-manager-list">
                {manageableProteinCategories.map(({ category, inUse }) => (
                  <div className="ingredient-manager-row protein-category-manager-row" key={category.id}>
                    <span><ProteinDot category={category} />{category.name}</span>
                    {inUse ? (
                      <small className="category-in-use">In use</small>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeProteinCategory(category.id)}
                        aria-label={`Delete ${category.name} protein category`}
                        title={`Delete ${category.name}`}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="ingredient-manager-empty">No protein categories to manage.</div>
            )}
          </div>
        )}
      </div>

      <div className="ingredients-editor"><div className="editor-label">Ingredients</div>
        {rows.map((row, index) => <div className="ingredient-row" key={`${row.ingredientId}-${index}`}>
          <select value={row.ingredientId} onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, ingredientId: e.target.value } : r))}>{ingredients.map((i) => <option value={i.id} key={i.id}>{i.name}</option>)}</select>
          <input type="number" min="0" step="0.25" value={row.quantity} onChange={(e) => setRows(rows.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
          <span>{ingredients.find((i) => i.id === row.ingredientId)?.unit ?? ''}</span>
          <span className="ingredient-protein-indicator">
            {(() => {
              const ingredient = ingredients.find((i) => i.id === row.ingredientId)
              const category = proteinCategories.find((c) => c.id === ingredient?.proteinCategoryId)
              return category ? <><ProteinDot category={category} />{category.name}</> : '—'
            })()}
          </span>
          <button
            type="button"
            className="ingredient-row-remove"
            onClick={() => setRows(rows.filter((_, i) => i !== index))}
            aria-label="Remove ingredient from meal"
            title="Remove ingredient from meal"
          >×</button>
        </div>)}
        <button className="secondary" onClick={addRow}>+ Add ingredient</button>
        <div className="new-ingredient">
          <input
            value={newIngredient}
            onChange={(e) => setNewIngredient(e.target.value)}
            placeholder="New ingredient"
          />
          <select
            value={newIngredientProteinCategoryId}
            onChange={(e) => setNewIngredientProteinCategoryId(e.target.value)}
            aria-label="New ingredient protein category"
          >
            <option value="">No protein</option>
            {proteinCategories
              .filter((category) => category.id !== 'none')
              .map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
          </select>
          <button type="button" onClick={addNewIngredient}>Create</button>
        </div>

        <div className="ingredient-manager">
          <button
            type="button"
            className="ingredient-manager-toggle"
            onClick={() => setShowIngredientManager((open) => !open)}
          >
            <span>{showIngredientManager ? 'Hide unused ingredients' : 'Manage unused ingredients'}</span>
            <small>{unusedIngredients.length}</small>
          </button>

          {showIngredientManager && (
            <div className="ingredient-manager-panel">
              <p>Only ingredients not used by any saved meal are shown here.</p>
              {unusedIngredients.length > 0 ? (
                <div className="ingredient-manager-list">
                  {unusedIngredients
                    .slice()
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((ingredient) => (
                      <div className="ingredient-manager-row" key={ingredient.id}>
                        <span>{ingredient.name}</span>
                        <button
                          type="button"
                          onClick={() => onDeleteIngredient(ingredient.id)}
                          aria-label={`Delete ${ingredient.name}`}
                          title={`Delete ${ingredient.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                </div>
              ) : (
                <div className="ingredient-manager-empty">No unused ingredients.</div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="modal-actions"><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={save}>Save meal</button></div>
    </div></div>
  )
}
