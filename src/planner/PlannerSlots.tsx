import { useEffect, useState } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Ingredient, Meal, ProteinCategory } from '../types'
import { MealProteinDots } from '../meals/mealProtein'

export function MobilePlannerSlot({
  label,
  firstCustom,
  meals,
  note,
  ingredients,
  proteinCategories,
  onAdd,
  onRemoveMeal,
  onNoteChange,
}: {
  label: string
  firstCustom: boolean
  meals: Meal[]
  note: string
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
  onAdd: () => void
  onRemoveMeal: (mealId: string) => void
  onNoteChange: (note: string) => void
}) {
  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(note)

  useEffect(() => setDraftNote(note), [note])

  return (
    <div className={`mobile-planner-slot ${firstCustom ? 'first-custom-mobile-slot' : ''}`}>
      <div className="mobile-slot-label">{label}</div>
      <div className="mobile-slot-content">
        {meals.map((meal) => (
          <div className="mobile-planned-meal" key={meal.id}>
            <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
            <span>{meal.name}</span>
            <button type="button" onClick={() => onRemoveMeal(meal.id)}>×</button>
          </div>
        ))}

        {meals.length < 3 && (
          <button type="button" className="mobile-add-meal" onClick={onAdd}>
            + {meals.length === 0 ? 'Add meal' : 'Add another meal'}
          </button>
        )}

        {note && !editingNote && <div className="mobile-slot-note">{note}</div>}

        {editingNote ? (
          <div className="mobile-note-editor">
            <textarea value={draftNote} onChange={(e) => setDraftNote(e.target.value)} placeholder="Add a note…" autoFocus />
            <div>
              <button type="button" onClick={() => { setDraftNote(note); setEditingNote(false) }}>Cancel</button>
              <button type="button" className="primary" onClick={() => { onNoteChange(draftNote); setEditingNote(false) }}>Save</button>
            </div>
          </div>
        ) : (
          <button type="button" className="mobile-note-trigger" onClick={() => setEditingNote(true)}>
            {note ? 'Edit note' : '+ Note'}
          </button>
        )}
      </div>
    </div>
  )
}

export function DraggableMeal({ meal, onTap, ingredients, proteinCategories }: { meal: Meal; onTap: () => void; ingredients: Ingredient[]; proteinCategories: ProteinCategory[] }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `meal-${meal.id}`,
  })

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={`meal-card ${isDragging ? 'dragging' : ''}`}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      onClick={onTap}
    >
      <span className="drag-handle" aria-hidden="true">⋮⋮</span>
      <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
      <span className="meal-card-name">{meal.name}</span>
    </button>
  )
}

export function MealCard({ meal, overlay = false, ingredients, proteinCategories }: { meal: Meal; overlay?: boolean; ingredients: Ingredient[]; proteinCategories: ProteinCategory[] }) {
  return (
    <div className={`meal-card ${overlay ? 'overlay-card' : ''}`}>
      <MealProteinDots meal={meal} ingredients={ingredients} proteinCategories={proteinCategories} />
      <span>{meal.name}</span>
    </div>
  )
}

export function PlannerSlot({
  day,
  rowId,
  meals,
  note,
  onNoteChange,
  onRemoveMeal,
  ingredients,
  proteinCategories,
}: {
  day: string
  rowId: string
  meals: Meal[]
  note: string
  onNoteChange: (note: string) => void
  onRemoveMeal: (mealId: string) => void
  ingredients: Ingredient[]
  proteinCategories: ProteinCategory[]
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `slot:${day}:${rowId}`,
  })

  const [editingNote, setEditingNote] = useState(false)
  const [draftNote, setDraftNote] = useState(note)

  useEffect(() => {
    setDraftNote(note)
  }, [note])

  return (
    <div
      ref={setNodeRef}
      className={`planner-slot ${isOver ? 'drag-over' : ''}`}
    >
      {meals.length > 0 ? (
        <div className="planned-meal-stack">
          {meals.map((mealData) => (
            <div className="planned-meal" key={mealData.id}>
              <div className="planned-meal-main">
                <MealProteinDots meal={mealData} ingredients={ingredients} proteinCategories={proteinCategories} />
                <span>{mealData.name}</span>
                <button
                  type="button"
                  className="remove-slot-meal"
                  onClick={(event) => {
                    event.stopPropagation()
                    onRemoveMeal(mealData.id)
                  }}
                  aria-label={`Remove ${mealData.name} from slot`}
                  title="Remove meal"
                >
                  ×
                </button>
              </div>
            </div>
          ))}

          {note && !editingNote && (
            <div className="planner-note-preview">{note}</div>
          )}

          {editingNote ? (
            <div
              className="planner-note-editor"
              onDoubleClick={(event) => event.stopPropagation()}
            >
              <textarea
                value={draftNote}
                onChange={(event) => setDraftNote(event.target.value)}
                placeholder="Add a note…"
                autoFocus
              />
              <div className="planner-note-actions">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    setDraftNote(note)
                    setEditingNote(false)
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="save-note"
                  onClick={(event) => {
                    event.stopPropagation()
                    onNoteChange(draftNote)
                    setEditingNote(false)
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`planner-note-button ${note ? 'has-note' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                setEditingNote(true)
              }}
            >
              {note ? 'Edit note' : '+ Note'}
            </button>
          )}
        </div>
      ) : (
        <span className="empty-slot">Drop meal here</span>
      )}
    </div>
  )
}
