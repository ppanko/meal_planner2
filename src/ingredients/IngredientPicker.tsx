import { useEffect, useId, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Ingredient } from '../types'
import { sortBySearch } from '../utils/search'
import './IngredientPicker.css'

type IngredientPickerProps = {
  label: string
  ingredients: Ingredient[]
  value: string
  autoFocus?: boolean
  onChange: (ingredientId: string) => void
  onCreate?: (name: string) => void
}

export function IngredientPicker({ label, ingredients, value, autoFocus = false, onChange, onCreate }: IngredientPickerProps) {
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
  const createName = filterText.trim()
  const hasExactMatch = createName.length > 0 && ingredients.some(
    (ingredient) => ingredient.name.trim().toLocaleLowerCase() === createName.toLocaleLowerCase(),
  )
  const showCreate = Boolean(onCreate) && createName.length > 0 && !hasExactMatch
  const optionCount = options.length + (showCreate ? 1 : 0)

  useEffect(() => {
    setActiveIndex(0)
  }, [filterText, open])

  function choose(ingredient: Ingredient) {
    onChange(ingredient.id)
    setInputValue(ingredient.name)
    setFilterText('')
    setOpen(false)
  }

  function create() {
    if (!showCreate || !onCreate) return
    onCreate(createName)
    setOpen(false)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
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
      else if (optionCount > 0) setActiveIndex((index) => (index + 1) % optionCount)
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) setOpen(true)
      else if (optionCount > 0) setActiveIndex((index) => (index - 1 + optionCount) % optionCount)
      return
    }

    if (event.key === 'Enter' && open) {
      if (activeIndex < options.length && options[activeIndex]) {
        event.preventDefault()
        choose(options[activeIndex])
      } else if (showCreate && activeIndex === options.length) {
        event.preventDefault()
        create()
      }
    }
  }

  return (
    <div className="ingredient-combobox">
      <input
        aria-label={label}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={
          open && activeIndex < options.length && options[activeIndex]
            ? `${listboxId}-${options[activeIndex].id}`
            : open && showCreate && activeIndex === options.length
              ? `${listboxId}-create`
              : undefined
        }
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
          {showCreate && (
            <button
              id={`${listboxId}-create`}
              type="button"
              role="option"
              aria-label={`Create “${createName}”…`}
              aria-selected={activeIndex === options.length}
              className={`ingredient-combobox-create ${activeIndex === options.length ? 'active' : ''}`}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={create}
              onMouseEnter={() => setActiveIndex(options.length)}
            >
              <span>+ Create “{createName}”…</span>
            </button>
          )}
          {options.length === 0 && !showCreate && <div className="ingredient-combobox-empty">No ingredients match.</div>}
        </div>
      )}
    </div>
  )
}
