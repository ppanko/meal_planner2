import { useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'

export function ShoppingAddCombobox({
  suggestions,
  value,
  onChange,
  onSubmit,
}: {
  suggestions: string[]
  value: string
  onChange: (value: string) => void
  onSubmit: (name: string) => void
}) {
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  function chooseSuggestion(name: string) {
    onChange(name)
    setFocused(false)
    setActiveIndex(-1)
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) return

    onSubmit(trimmed)
    onChange('')
    setFocused(false)
    setActiveIndex(-1)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      setFocused(false)
      setActiveIndex(-1)
      return
    }
    if (suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setFocused(true)
      setActiveIndex((index) => (index + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setFocused(true)
      setActiveIndex((index) => index <= 0 ? suggestions.length - 1 : index - 1)
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault()
      chooseSuggestion(suggestions[activeIndex])
    }
  }

  return (
    <div className="shopping-add-shell">
      <form className="shopping-add" onSubmit={submit}>
        <input
          type="text"
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            setFocused(true)
            setActiveIndex(-1)
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            setActiveIndex(-1)
          }}
          onKeyDown={handleKeyDown}
          placeholder="Add an item—or add more of something…"
          aria-label="Add shopping list item"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={focused && suggestions.length > 0}
          aria-controls="shopping-item-suggestions"
          aria-activedescendant={activeIndex >= 0 ? `shopping-suggestion-${activeIndex}` : undefined}
          autoComplete="off"
        />
        <button className="primary" type="submit">Add</button>
      </form>
      {focused && suggestions.length > 0 && (
        <div className="shopping-suggestions" id="shopping-item-suggestions" role="listbox" aria-label="Suggested shopping items">
          {suggestions.map((name, index) => (
            <div
              className={`shopping-suggestion ${index === activeIndex ? 'active' : ''}`}
              id={`shopping-suggestion-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={name}
              onPointerDown={(event) => {
                event.preventDefault()
                chooseSuggestion(name)
              }}
              onPointerMove={() => setActiveIndex(index)}
            >
              <span>{name}</span><small>Complete</small>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
