import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  persistent: {} as Record<string, unknown>,
  planner: {} as Record<string, unknown>,
  meals: {} as Record<string, unknown>,
  shopping: {} as Record<string, unknown>,
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
}))

vi.mock('./state/usePersistentAppState', () => ({
  usePersistentAppState: () => mocks.persistent,
}))
vi.mock('./planner/usePlannerController', () => ({
  usePlannerController: () => mocks.planner,
}))
vi.mock('./meals/useMealsController', () => ({
  useMealsController: () => mocks.meals,
}))
vi.mock('./shopping/useShoppingController', () => ({
  useShoppingController: () => mocks.shopping,
}))

vi.mock('./planner/PlannerView', () => ({
  PlannerView: () => <div>Planner view</div>,
}))
vi.mock('./meals/MealsView', () => ({
  MealsView: () => <div>Meals view</div>,
}))
vi.mock('./shopping/ShoppingView', () => ({
  ShoppingView: () => <div>Shopping view</div>,
}))
vi.mock('./meals/MealForm', () => ({
  MealForm: ({ onCancel, onSave }: { onCancel: () => void; onSave: (meal: unknown) => void }) => (
    <div>
      <span>Meal form</span>
      <button onClick={onCancel}>Mock cancel meal</button>
      <button onClick={() => onSave({ id: 'mock-meal' })}>Mock save meal</button>
    </div>
  ),
}))
vi.mock('./meals/MealLibraryManager', () => ({
  MealLibraryManager: ({ onClose, onCreateIngredient }: { onClose: () => void; onCreateIngredient: (ingredient: unknown) => void }) => <div><span>Library manager</span><button onClick={onClose}>Mock close library</button><button onClick={() => onCreateIngredient({ id: 'new' })}>Mock add ingredient</button></div>,
}))
vi.mock('./meals/CookingView', () => ({
  CookingView: ({ meal, onClose }: { meal: { name: string }; onClose: () => void }) => <div><span>Cooking {meal.name}</span><button onClick={onClose}>Mock finish cooking</button></div>,
}))
vi.mock('./planner/PlannerSlots', () => ({
  MealCard: ({ meal }: { meal: { name: string } }) => <div>Overlay {meal.name}</div>,
}))

import App from './App'
import { createAppState } from './test/fixtures'

beforeEach(() => {
  const state = createAppState()
  mocks.persistent = {
    state,
    storageReady: true,
    undoAction: null,
    update: vi.fn(),
    updateWithUndo: vi.fn(),
    undoLastAction: vi.fn(),
  }
  mocks.planner = {
    sensors: [],
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    clearWeek: vi.fn(),
    activeMeal: null,
    showCopyWeek: false,
    closeCopyWeek: vi.fn(),
    copyWeek: vi.fn(),
    copyableWeekKeys: [],
    copySourceWeekKey: '',
    setCopySourceWeekKey: vi.fn(),
  }
  mocks.meals = {
    showMealForm: false,
    editingMeal: null,
    duplicateMode: false,
    showLibraryManager: false,
    cookingMeal: null,
    closeMealForm: vi.fn(),
    closeLibraryManager: vi.fn(),
    closeCooking: vi.fn(),
    createIngredient: vi.fn(),
    saveMeal: vi.fn(),
  }
  mocks.shopping = {
    shopping: [],
    manualShopping: [],
    orderedShoppingCategories: [],
  }
})

describe('App', () => {
  it('shows a loading screen until persistent state is ready', () => {
    mocks.persistent = { ...mocks.persistent, state: null, storageReady: false }
    render(<App />)
    expect(screen.getByText('Loading Meal Planner…')).toBeInTheDocument()
    expect(screen.queryByText('Planner view')).not.toBeInTheDocument()
  })

  it('navigates primary views and delegates clearing the week', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(screen.getByText('Planner view')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear week' }))
    expect(mocks.planner.clearWeek).toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /Meals/ }))
    expect(screen.getByText('Meals view')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Shopping/ }))
    expect(screen.getByText('Shopping view')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Planner/ }))
    expect(screen.getByText('Planner view')).toBeInTheDocument()
  })

  it('wires the meal form and active drag overlay to controllers', async () => {
    const state = mocks.persistent.state as ReturnType<typeof createAppState>
    mocks.meals = { ...mocks.meals, showMealForm: true }
    mocks.planner = { ...mocks.planner, activeMeal: state.meals[0] }
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('Meal form')).toBeInTheDocument()
    expect(screen.getByText(`Overlay ${state.meals[0].name}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mock cancel meal' }))
    await user.click(screen.getByRole('button', { name: 'Mock save meal' }))
    expect(mocks.meals.closeMealForm).toHaveBeenCalled()
    expect(mocks.meals.saveMeal).toHaveBeenCalledWith({ id: 'mock-meal' })
  })

  it('renders and wires the library manager and cooking view', async () => {
    const state = mocks.persistent.state as ReturnType<typeof createAppState>
    mocks.meals = { ...mocks.meals, showLibraryManager: true, cookingMeal: state.meals[0] }
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('Library manager')).toBeInTheDocument()
    expect(screen.getByText(`Cooking ${state.meals[0].name}`)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mock add ingredient' }))
    await user.click(screen.getByRole('button', { name: 'Mock close library' }))
    await user.click(screen.getByRole('button', { name: 'Mock finish cooking' }))
    expect(mocks.meals.createIngredient).toHaveBeenCalledWith({ id: 'new' })
    expect(mocks.meals.closeLibraryManager).toHaveBeenCalled()
    expect(mocks.meals.closeCooking).toHaveBeenCalled()
  })

  it('copies a selected week and closes the copy dialog', async () => {
    mocks.planner = {
      ...mocks.planner,
      showCopyWeek: true,
      copyableWeekKeys: ['2026-08-10'],
      copySourceWeekKey: '2026-08-10',
    }
    const user = userEvent.setup()
    render(<App />)

    const dialog = screen.getByRole('dialog', { name: /Copy into/ })
    expect(dialog).toHaveTextContent('This replaces this week’s planned meals')
    await user.click(screen.getByRole('button', { name: 'Copy week' }))
    expect(mocks.planner.copyWeek).toHaveBeenCalledWith('2026-08-10')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(mocks.planner.closeCopyWeek).toHaveBeenCalled()
  })

  it('renders empty copy state, undo action, and shopping notification', async () => {
    mocks.planner = { ...mocks.planner, showCopyWeek: true }
    mocks.shopping = {
      ...mocks.shopping,
      manualShopping: [{ id: 'manual', name: 'Milk', checked: false }],
    }
    mocks.persistent = {
      ...mocks.persistent,
      undoAction: { message: 'Deleted meal', state: mocks.persistent.state },
    }
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByText('There are no other populated weeks to copy.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy week' })).toBeDisabled()
    expect(screen.getByText('Deleted meal')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Undo' }))
    expect(mocks.persistent.undoLastAction).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Shopping/ }).querySelector('i')).toBeInTheDocument()
  })
})
