import { useEffect, useId, useMemo, useState } from 'react'
import type { Ingredient } from '../types'
import { sortBySearch } from '../utils/search'

type IngredientComboboxProps = {
  label: string
  ingredients: Ingredient[]
  value: string
  autoFocus?: boolean
  onChange: (ingredientId: string) => void
}

export function IngredientCombobox({ label, ingredients, value, autoFocus = false, onChange }: IngredientComboboxProps) {
  const listboxId = useId()
  const selectedIngredient = ingredients.find((ingredient) => ingredient.id === value)
  const [inputValue, setInputValue] = useState(selectedIngredient?.name ?? '')
  const [filterText, setFilterText] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  useEffect(() => {
    if (!open) setInputValue(selectedIngredient?.name ?? '')
  }, [selectedIngredient?.name, open])

  const options = useMemo(
    () => sortBySearch(ingredients, filterText, (ingredient) => ingredient.name),
    [filterText, ingredients],
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [filterText, open])

  function choose(ingredient: Ingredient) {
    onChange(ingredient.id)
    setInputValue(ingredient.name)
    setFilterText('')
    setOpen(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      if (!open) return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open) setOpen(true)
      else if (options.length > 0) setActiveIndex((index) => (index + 1) % options.length)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else if (options.length > 0) setActiveIndex((index) => (index - 1 + options.length) % options.length)
      return
    }

    if (event.key === 'Enter' && open && options[activeIndex]) {
      event.preventDefault()
      choose(options[activeIndex])
    }
  }

  return (
    <div className="ingredient-combobox">
      <input
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open && options[activeIndex] ? `${listboxId}-${options[activeIndex].id}` : undefined}
        role="combobox"
        autoComplete="off"
        autoFocus={autoFocus}
        value={inputValue}
        placeholder="Search ingredients"
        onFocus={(event) => {
          setFilterText('')
          setOpen(true)
          event.currentTarget.select()
        }}
        onChange={(event) => {
          setInputValue(event.target.value)
          setFilterText(event.target.value)
          setOpen(true)
          onChange('')
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => window.setTimeout(() => setOpen(false), 100)}
      />
      {open && (
        <div className="ingredient-combobox-options" id={listboxId} role="listbox">
          {options.map((ingredient, index) => (
            <button
              id={`${listboxId}-${ingredient.id}`}
              key={ingredient.id}
              type="button"
              role="option"
              aria-label={ingredient.name}
              aria-selected={ingredient.id === value}
              className={index === activeIndex ? 'active' : ''}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(ingredient)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <span>{ingredient.name}</span>
              <small>{ingredient.unit}</small>
            </button>
          ))}
          {options.length === 0 && <div className="ingredient-combobox-empty">No ingredients match.</div>}
        </div>
      )}
    </div>
  )
}
