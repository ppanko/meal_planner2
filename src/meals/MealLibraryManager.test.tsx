import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createAppState } from '../test/fixtures'
import { MealLibraryManager } from './MealLibraryManager'

function setup() {
  const state = createAppState()
  const orphan = { id: 'orphan', name: 'Orphan ingredient', unit: 'jar', proteinCategoryId: null }
  const unusedCategory = { id: 'turkey', name: 'Turkey', color: '#675544' }
  const callbacks = {
    onClose: vi.fn(),
    onCreateIngredient: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onCreateProteinCategory: vi.fn(),
    onDeleteProteinCategory: vi.fn(),
  }
  render(<MealLibraryManager {...callbacks} meals={state.meals} ingredients={[...state.ingredients, orphan]} proteinCategories={[...state.proteinCategories, unusedCategory]} />)
  return { callbacks }
}

describe('MealLibraryManager', () => {
  it('creates, searches, and safely deletes ingredients', async () => {
    const { callbacks } = setup()
    const user = userEvent.setup()

    await user.type(screen.getByLabelText('Name'), '  Greek yogurt  ')
    await user.clear(screen.getByLabelText('Unit'))
    await user.type(screen.getByLabelText('Unit'), 'cup')
    await user.selectOptions(screen.getByLabelText('Protein'), 'chicken')
    await user.click(screen.getByRole('button', { name: 'Add ingredient' }))
    expect(callbacks.onCreateIngredient).toHaveBeenCalledWith({ id: 'greek-yogurt', name: 'Greek yogurt', unit: 'cup', proteinCategoryId: 'chicken' })

    await user.type(screen.getByLabelText('Search ingredients'), 'orphan')
    expect(screen.getByText('Orphan ingredient')).toBeInTheDocument()
    expect(screen.queryByText('Eggs')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete Orphan ingredient' }))
    expect(callbacks.onDeleteIngredient).toHaveBeenCalledWith('orphan')
  })

  it('marks used items, manages protein categories, and prevents duplicate slugs', async () => {
    const { callbacks } = setup()
    const user = userEvent.setup()

    const eggsRow = screen.getByText('Eggs').closest('.library-item') as HTMLElement
    expect(within(eggsRow).getByText('In use')).toBeInTheDocument()
    expect(within(eggsRow).queryByRole('button', { name: /Delete/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /Protein categories/ }))
    await user.type(screen.getByLabelText('Name'), 'Duck')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(callbacks.onCreateProteinCategory).toHaveBeenCalledWith({ id: 'duck', name: 'Duck', color: '#8a7f70' })

    await user.click(screen.getByRole('button', { name: 'Delete Turkey protein category' }))
    expect(callbacks.onDeleteProteinCategory).toHaveBeenCalledWith('turkey')
    const chickenRow = screen.getByText('Chicken').closest('.library-item') as HTMLElement
    expect(within(chickenRow).getByText('In use')).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Name'))
    await user.type(screen.getByLabelText('Name'), 'Chicken')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(screen.getByRole('alert')).toHaveTextContent('already exists')
    expect(callbacks.onCreateProteinCategory).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('button', { name: 'Done' }))
    expect(callbacks.onClose).toHaveBeenCalled()
  })
})
