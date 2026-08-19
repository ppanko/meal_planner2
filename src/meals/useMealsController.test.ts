import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import type { AppState, Meal } from '../types'
import { useMealsController } from './useMealsController'

function setup(state: AppState | null = createAppState()) {
  const update = vi.fn()
  const updateWithUndo = vi.fn()
  const setView = vi.fn()
  const hook = renderHook(
    ({ currentState }) => useMealsController({
      state: currentState,
      setView,
      update,
      updateWithUndo,
    }),
    { initialProps: { currentState: state } },
  )
  return { ...hook, update, updateWithUndo, setView }
}

beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})

describe('useMealsController', () => {
  it('opens and closes new and edit forms', () => {
    const { result } = setup()
    const meal = createAppState().meals[0]

    act(() => result.current.openNewMeal())
    expect(result.current.showMealForm).toBe(true)
    expect(result.current.editingMeal).toBeNull()

    act(() => result.current.openEditMeal(meal))
    expect(result.current.editingMeal).toBe(meal)

    act(() => result.current.closeMealForm())
    expect(result.current.showMealForm).toBe(false)
    expect(result.current.editingMeal).toBeNull()
  })

  it('opens library management and cooking as mutually exclusive surfaces', () => {
    const { result } = setup()
    const meal = createAppState().meals[0]

    act(() => result.current.openLibraryManager())
    expect(result.current.showLibraryManager).toBe(true)
    expect(result.current.showMealForm).toBe(false)

    act(() => result.current.startCooking(meal))
    expect(result.current.showLibraryManager).toBe(false)
    expect(result.current.cookingMeal).toBe(meal)

    act(() => result.current.openNewMeal())
    expect(result.current.cookingMeal).toBeNull()
    expect(result.current.showMealForm).toBe(true)

    act(() => result.current.closeMealForm())
    act(() => result.current.openLibraryManager())
    act(() => result.current.closeLibraryManager())
    expect(result.current.showLibraryManager).toBe(false)

    act(() => result.current.startCooking(meal))
    act(() => result.current.closeCooking())
    expect(result.current.cookingMeal).toBeNull()
  })

  it('creates and edits meals using immutable state updates', () => {
    const state = createAppState()
    const { result, update } = setup(state)
    const added: Meal = {
      id: 'new', name: 'New', type: 'Lunch', proteinCategoryOverrideId: null, ingredients: [],
    }

    act(() => result.current.saveMeal(added))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      meals: [...state.meals, added],
    }))

    update.mockClear()
    const edited = { ...state.meals[0], name: 'Edited' }
    act(() => result.current.saveMeal(edited, state.meals[0].id))
    expect(update.mock.calls[0][0].meals[0]).toEqual(edited)
    expect(state.meals[0].name).not.toBe('Edited')
  })

  it('prepares an independent meal duplicate', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000010')
    const state = createAppState()
    const original = state.meals[0]
    const { result, setView } = setup(state)

    act(() => result.current.duplicateMeal(original))

    expect(result.current.duplicateMode).toBe(true)
    expect(result.current.editingMeal).toEqual({
      ...original,
      id: '00000000-0000-4000-8000-000000000010',
      name: `${original.name} Copy`,
    })
    expect(result.current.editingMeal?.ingredients).not.toBe(original.ingredients)
    expect(result.current.editingMeal?.instructions).not.toBe(original.instructions)
    expect(setView).toHaveBeenCalledWith('meals')
  })

  it('deletes a meal and all planner references with undo', () => {
    const state = createAppState({
      planner: {
        '2026-08-17': { Dinner: ['tacos', 'spaghetti'], Lunch: ['tacos'] },
        '2026-08-18': { Dinner: ['tacos'] },
      },
    })
    const { result, updateWithUndo } = setup(state)

    act(() => result.current.deleteMeal('tacos'))

    expect(updateWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        meals: expect.not.arrayContaining([expect.objectContaining({ id: 'tacos' })]),
        planner: {
          '2026-08-17': { Dinner: ['spaghetti'], Lunch: [] },
          '2026-08-18': { Dinner: [] },
        },
      }),
      'Deleted Tacos',
    )
  })

  it('respects cancellation before deleting a meal', () => {
    vi.mocked(window.confirm).mockReturnValue(false)
    const { result, updateWithUndo } = setup()
    act(() => result.current.deleteMeal('tacos'))
    expect(updateWithUndo).not.toHaveBeenCalled()
  })

  it('creates ingredients and removes only unused ingredients', () => {
    const state = createAppState({
      shoppingPurchasesByWeek: { '2026-08-17': { orphan: 2, eggs: 4 } },
      shoppingDismissedByWeek: { '2026-08-17': { orphan: 1, eggs: 2 } },
      ingredients: [
        ...createAppState().ingredients,
        { id: 'orphan', name: 'Orphan', unit: 'each', proteinCategoryId: null },
      ],
    })
    const { result, update, updateWithUndo } = setup(state)
    const ingredient = { id: 'new', name: 'New', unit: 'each', proteinCategoryId: null }

    act(() => result.current.createIngredient(ingredient))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      ingredients: [...state.ingredients, ingredient],
    }))

    update.mockClear()
    act(() => result.current.createIngredient(state.ingredients[0]))
    expect(update).not.toHaveBeenCalled()

    act(() => result.current.deleteIngredient('eggs'))
    expect(updateWithUndo).not.toHaveBeenCalled()

    act(() => result.current.deleteIngredient('orphan'))
    expect(updateWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        ingredients: expect.not.arrayContaining([expect.objectContaining({ id: 'orphan' })]),
        shoppingPurchasesByWeek: { '2026-08-17': { eggs: 4 } },
        shoppingDismissedByWeek: { '2026-08-17': { eggs: 2 } },
      }),
      'Deleted ingredient Orphan',
    )
  })

  it('creates categories and deletes only unused non-None categories', () => {
    const state = createAppState({
      proteinCategories: [
        ...createAppState().proteinCategories,
        { id: 'unused', name: 'Unused', color: '#fff' },
      ],
    })
    const { result, update, updateWithUndo } = setup(state)
    const category = { id: 'new', name: 'New', color: '#000' }

    act(() => result.current.createProteinCategory(category))
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      proteinCategories: [...state.proteinCategories, category],
    }))

    update.mockClear()
    act(() => result.current.createProteinCategory(state.proteinCategories[0]))
    expect(update).not.toHaveBeenCalled()

    act(() => result.current.deleteProteinCategory('chicken'))
    act(() => result.current.deleteProteinCategory('none'))
    expect(updateWithUndo).not.toHaveBeenCalled()

    act(() => result.current.deleteProteinCategory('unused'))
    expect(updateWithUndo).toHaveBeenCalledWith(
      expect.objectContaining({
        proteinCategories: expect.not.arrayContaining([expect.objectContaining({ id: 'unused' })]),
      }),
      'Deleted protein category Unused',
    )
  })

  it('safely ignores actions while state is unavailable', () => {
    const { result, update, updateWithUndo } = setup(null)
    act(() => {
      result.current.saveMeal({ id: 'x', name: 'X', type: 'Dinner', proteinCategoryOverrideId: null, ingredients: [] })
      result.current.deleteMeal('x')
      result.current.deleteIngredient('x')
      result.current.deleteProteinCategory('x')
    })
    expect(update).not.toHaveBeenCalled()
    expect(updateWithUndo).not.toHaveBeenCalled()
  })
})
