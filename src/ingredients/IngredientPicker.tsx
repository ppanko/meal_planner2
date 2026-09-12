import { useEffect, useId, useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Ingredient } from '../types'
import { sortBySearch } from '../utils/search'
import './IngredientPicker.css'

export type IngredientPickerSecondaryAction = {
  label: (name: string) => string
  onSelect: (name: string) => void
}

type IngredientPickerProps = {
  label: string
  ingredients: Ingredient[]
  value: string
  autoFocus?: boolean
  onChange: (ingredientId: string) => void
  onCreate?: (name: string) => void
  createLabel?: (name: string) => string
  secondaryAction?: IngredientPickerSecondaryAction
}

export function IngredientPicker({
  label,
  ingredients,
  value,
  autoFocus = false,
  onChange,
  onCreate,
  createLabel = (name) => `Create “${name}”…`,
  secondaryAction,
}: IngredientPickerProps) {
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
  const actionName = filterText.trim()
  const hasExactMatch = actionName.length > 0 && ingredients.some(
    (ingredient) => ingredient.name.trim().toLocaleLowerCase() === actionName.toLocaleLowerCase(),
  )
  const showSecondaryAction = Boolean(secondaryAction) && actionName.length > 0 && !hasExactMatch
  const showCreate = Boolean(onCreate) && actionName.length > 0 && !hasExactMatch
  const secondaryIndex = options.length
  const createIndex = options.length + (showSecondaryAction ? 1 : 0)
  const optionCount = options.length + Number(showSecondaryAction) + Number(showCreate)

  useEffect(() => {
    setActiveIndex(0)
  }, [filterText, open])

  function choose(ingredient: Ingredient) {
    onChange(ingredient.id)
    setInputValue(ingredient.name)
    setFilterText('')
    setOpen(false)
  }

  function runSecondaryAction() {
    if (!showSecondaryAction || !secondaryAction) return
    secondaryAction.onSelect(actionName)
    setInputValue('')
    setFilterText('')
    setOpen(false)
  }

  function create() {
    if (!showCreate || !onCreate) return
    onCreate(actionName)
    setOpen(false)
  }

  function activeDescendant() {
    if (!open) return undefined
    if (activeIndex < options.length && options[activeIndex]) return `${listboxId}-${options[activeIndex].id}`
    if (showSecondaryAction && activeIndex === secondaryIndex) return `${listboxId}-secondary`
    if (showCreate && activeIndex === createIndex) return `${listboxId}-create`
    return undefined
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
      } else if (showSecondaryAction && activeIndex === secondaryIndex) {
        event.preventDefault()
        runSecondaryAction()
      } else if (showCreate && activeIndex === createIndex) {
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
        aria-activedescendant={activeDescendant()}
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
          {(showSecondaryAction || showCreate) && (
            <div className="ingredient-combobox-actions">
              {showSecondaryAction && secondaryAction && (
                <button
                  id={`${listboxId}-secondary`}
                  type="button"
                  role="option"
                  aria-label={secondaryAction.label(actionName)}
                  aria-selected={activeIndex === secondaryIndex}
                  className={`ingredient-combobox-secondary ${activeIndex === secondaryIndex ? 'active' : ''}`}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={runSecondaryAction}
                  onMouseEnter={() => setActiveIndex(secondaryIndex)}
                >
                  <span>{secondaryAction.label(actionName)}</span>
                </button>
              )}
              {showCreate && (
                <button
                  id={`${listboxId}-create`}
                  type="button"
                  role="option"
                  aria-label={createLabel(actionName)}
                  aria-selected={activeIndex === createIndex}
                  className={`ingredient-combobox-create ${activeIndex === createIndex ? 'active' : ''}`}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={create}
                  onMouseEnter={() => setActiveIndex(createIndex)}
                >
                  <span>+ {createLabel(actionName)}</span>
                </button>
              )}
            </div>
          )}
          {options.length === 0 && !showSecondaryAction && !showCreate && (
            <div className="ingredient-combobox-empty">No ingredients match.</div>
          )}
        </div>
      )}
    </div>
  )
}
