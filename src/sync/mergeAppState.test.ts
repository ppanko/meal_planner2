import { describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import { addConflictingMealCopy, appStatesEqual, conflictingMealId, mergeAppStates } from './mergeAppState'

describe('mergeAppStates', () => {
  it('treats objects with different key insertion order as the same state', () => {
    const state = createAppState({ planner: {
      '2026-08-17': { Dinner: ['tacos'] },
      '2026-08-18': { Lunch: ['chicken-rice'] },
    } })
    const reordered = {
      ...state,
      planner: {
        '2026-08-18': state.planner['2026-08-18'],
        '2026-08-17': state.planner['2026-08-17'],
      },
    }
    expect(appStatesEqual(state, reordered)).toBe(true)
  })

  it('merges changes to separate parts of state without conflicts', () => {
    const base = createAppState()
    const local = {
      ...base,
      shoppingPurchasesByWeek: { '2026-08-17': { milk: 1 } },
    }
    const remote = {
      ...base,
      plannerNotes: { '2026-08-17': { Dinner: 'Eat early' } },
    }

    const result = mergeAppStates(base, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.state.shoppingPurchasesByWeek).toEqual(local.shoppingPurchasesByWeek)
    expect(result.state.plannerNotes).toEqual(remote.plannerNotes)
  })

  it('merges different fields on the same stable record', () => {
    const base = createAppState()
    const local = {
      ...base,
      meals: base.meals.map((meal) => meal.id === 'tacos' ? { ...meal, notes: 'Local note' } : meal),
    }
    const remote = {
      ...base,
      meals: base.meals.map((meal) => meal.id === 'tacos' ? { ...meal, recipeUrl: 'https://example.com/tacos' } : meal),
    }

    const result = mergeAppStates(base, local, remote)
    expect(result.conflicts).toEqual([])
    expect(result.state.meals.find(({ id }) => id === 'tacos')).toMatchObject({
      notes: 'Local note',
      recipeUrl: 'https://example.com/tacos',
    })
  })

  it('reports same-field edits and can prefer either side', () => {
    const base = createAppState()
    const local = {
      ...base,
      meals: base.meals.map((meal) => meal.id === 'tacos' ? { ...meal, name: 'Local tacos' } : meal),
    }
    const remote = {
      ...base,
      meals: base.meals.map((meal) => meal.id === 'tacos' ? { ...meal, name: 'Remote tacos' } : meal),
    }

    const localResult = mergeAppStates(base, local, remote, 'local')
    const remoteResult = mergeAppStates(base, local, remote, 'remote')
    expect(localResult.conflicts).toEqual(['meals[tacos].name'])
    expect(conflictingMealId(localResult.conflicts)).toBe('tacos')
    expect(conflictingMealId([...localResult.conflicts, 'planner.2026-08-17.Dinner'])).toBeNull()
    expect(localResult.state.meals.find(({ id }) => id === 'tacos')?.name).toBe('Local tacos')
    expect(remoteResult.state.meals.find(({ id }) => id === 'tacos')?.name).toBe('Remote tacos')
  })

  it('merges compatible additions to one planner slot and flags overfilling it', () => {
    const base = createAppState({ planner: { '2026-08-17': { Dinner: ['tacos'] } } })
    const local = { ...base, planner: { '2026-08-17': { Dinner: ['tacos', 'spaghetti'] } } }
    const remote = { ...base, planner: { '2026-08-17': { Dinner: ['tacos', 'chicken-rice'] } } }
    expect(mergeAppStates(base, local, remote)).toMatchObject({
      conflicts: [],
      state: { planner: { '2026-08-17': { Dinner: ['tacos', 'chicken-rice', 'spaghetti'] } } },
    })

    const crowdedBase = createAppState({ planner: { '2026-08-17': { Dinner: ['tacos', 'spaghetti'] } } })
    const crowdedLocal = { ...crowdedBase, planner: { '2026-08-17': { Dinner: ['tacos', 'spaghetti', 'chicken-rice'] } } }
    const crowdedRemote = { ...crowdedBase, planner: { '2026-08-17': { Dinner: ['tacos', 'spaghetti', 'pancakes'] } } }
    expect(mergeAppStates(crowdedBase, crowdedLocal, crowdedRemote).conflicts)
      .toEqual(['planner.2026-08-17.Dinner'])
  })

  it('treats delete-versus-edit as a conflict and can preserve a meal as a copy', () => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000099')
    const base = createAppState()
    const local = {
      ...base,
      meals: base.meals.map((meal) => meal.id === 'tacos' ? { ...meal, name: 'Edited tacos' } : meal),
    }
    const remote = { ...base, meals: base.meals.filter((meal) => meal.id !== 'tacos') }
    const result = mergeAppStates(base, local, remote, 'remote')

    expect(result.conflicts).toEqual(['meals[tacos]'])
    expect(addConflictingMealCopy(result.state, local, 'tacos').meals).toContainEqual(
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000099',
        name: 'Edited tacos Copy',
      }),
    )
  })

  it('keeps planner references valid when a meal is deleted while another device plans it', () => {
    const base = createAppState()
    const local = {
      ...base,
      meals: base.meals.filter(({ id }) => id !== 'tacos'),
      planner: {},
    }
    const remote = {
      ...base,
      planner: { '2026-08-17': { Dinner: ['tacos'] } },
    }

    const keepDeletion = mergeAppStates(base, local, remote, 'local')
    expect(keepDeletion.conflicts).toContain('meals[tacos]')
    expect(keepDeletion.state.meals).not.toContainEqual(expect.objectContaining({ id: 'tacos' }))
    expect(keepDeletion.state.planner['2026-08-17'].Dinner).toEqual([])

    const keepPlan = mergeAppStates(base, local, remote, 'remote')
    expect(keepPlan.state.meals).toContainEqual(expect.objectContaining({ id: 'tacos' }))
    expect(keepPlan.state.planner['2026-08-17'].Dinner).toEqual(['tacos'])
  })

  it('cleans a pre-existing dangling planner reference without inventing a sync conflict', () => {
    const base = createAppState({ planner: { '2026-08-17': { Dinner: ['missing-meal'] } } })
    const local = { ...base, plannerNotes: { '2026-08-17': { Dinner: 'Local note' } } }
    const result = mergeAppStates(base, local, base)

    expect(result.conflicts).toEqual([])
    expect(result.state.planner['2026-08-17'].Dinner).toEqual([])
    expect(result.state.plannerNotes).toEqual(local.plannerNotes)
  })

  it('keeps recipe references valid across concurrent ingredient deletion and use', () => {
    const base = createAppState({
      ingredients: [
        ...createAppState().ingredients,
        { id: 'oregano', name: 'Oregano', unit: 'tsp', proteinCategoryId: null },
      ],
    })
    const local = {
      ...base,
      ingredients: base.ingredients.filter(({ id }) => id !== 'oregano'),
    }
    const remote = {
      ...base,
      meals: base.meals.map((meal) => meal.id === 'tacos'
        ? { ...meal, ingredients: [...meal.ingredients, { ingredientId: 'oregano', quantity: 1 }] }
        : meal),
    }

    const keepDeletion = mergeAppStates(base, local, remote, 'local')
    expect(keepDeletion.conflicts).toContain('ingredients[oregano]')
    expect(keepDeletion.state.meals.find(({ id }) => id === 'tacos')?.ingredients)
      .not.toContainEqual(expect.objectContaining({ ingredientId: 'oregano' }))

    const keepRecipe = mergeAppStates(base, local, remote, 'remote')
    expect(keepRecipe.state.ingredients).toContainEqual(expect.objectContaining({ id: 'oregano' }))
    expect(keepRecipe.state.meals.find(({ id }) => id === 'tacos')?.ingredients)
      .toContainEqual(expect.objectContaining({ ingredientId: 'oregano' }))
  })

  it('keeps category assignments valid across concurrent category deletion and use', () => {
    const base = createAppState({
      shoppingCategories: [{ id: 'bakery', name: 'Bakery' }],
      shoppingCategoryOrder: ['bakery'],
    })
    const local = {
      ...base,
      shoppingCategories: base.shoppingCategories!.filter(({ id }) => id !== 'bakery'),
      shoppingCategoryOrder: base.shoppingCategoryOrder!.filter((id) => id !== 'bakery'),
    }
    const remote = {
      ...base,
      ingredients: base.ingredients.map((ingredient) => ingredient.id === 'flour'
        ? { ...ingredient, shoppingCategoryId: 'bakery' }
        : ingredient),
    }

    const keepDeletion = mergeAppStates(base, local, remote, 'local')
    expect(keepDeletion.conflicts).toContain('shoppingCategories[bakery]')
    expect(keepDeletion.state.ingredients.find(({ id }) => id === 'flour')?.shoppingCategoryId).toBeNull()

    const keepAssignment = mergeAppStates(base, local, remote, 'remote')
    expect(keepAssignment.state.shoppingCategories).toContainEqual({ id: 'bakery', name: 'Bakery' })
    expect(keepAssignment.state.ingredients.find(({ id }) => id === 'flour')?.shoppingCategoryId).toBe('bakery')
  })
})
