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
    onUpdateIngredient: vi.fn(),
    onDeleteIngredient: vi.fn(),
    onCreateProteinCategory: vi.fn(),
    onDeleteProteinCategory: vi.fn(),
  }
  const shoppingCategories = [
    { id: 'produce', name: 'Produce' },
    { id: 'dairy', name: 'Dairy' },
  ]
  render(
    <MealLibraryManager
      {...callbacks}
      meals={state.meals}
      ingredients={[...state.ingredients, orphan]}
      proteinCategories={[...state.proteinCategories, unusedCategory]}
      shoppingCategories={shoppingCategories}
    />,
  )
  return { callbacks }
}

describe('MealLibraryManager', () => {
  it('creates ingredients with the shared editor, searches, and safely deletes them', async () => {
    const { callbacks } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '+ Ingredient' }))
    const editor = screen.getByRole('dialog', { name: 'New ingredient' })
    await user.type(within(editor).getByLabelText('Name'), '  Greek yogurt  ')
    await user.clear(within(editor).getByLabelText('Unit'))
    await user.type(within(editor).getByLabelText('Unit'), 'cup')
    await user.selectOptions(within(editor).getByLabelText('Protein'), 'chicken')
    await user.selectOptions(within(editor).getByLabelText('Shopping category'), 'dairy')
    await user.click(within(editor).getByRole('button', { name: 'Save ingredient' }))
    expect(callbacks.onCreateIngredient).toHaveBeenCalledWith({
      id: 'greek-yogurt',
      name: 'Greek yogurt',
      unit: 'cup',
      proteinCategoryId: 'chicken',
      shoppingCategoryId: 'dairy',
    })

    await user.type(screen.getByLabelText('Search ingredients'), 'orphan')
    expect(screen.getByText('Orphan ingredient')).toBeInTheDocument()
    expect(screen.queryByText('Eggs')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete Orphan ingredient' }))
    expect(callbacks.onDeleteIngredient).toHaveBeenCalledWith('orphan')
  })

  it('edits an existing ingredient without changing its id', async () => {
    const { callbacks } = setup()
    const user = userEvent.setup()
    const eggsRow = screen.getByText('Eggs').closest('.library-item') as HTMLElement

    await user.click(within(eggsRow).getByRole('button', { name: 'Edit Eggs' }))
    const editor = screen.getByRole('dialog', { name: 'Edit ingredient' })
    expect(within(editor).getByLabelText('Name')).toHaveValue('Eggs')
    expect(within(editor).getByLabelText('Unit')).toHaveValue('each')

    await user.clear(within(editor).getByLabelText('Name'))
    await user.type(within(editor).getByLabelText('Name'), 'Large eggs')
    await user.clear(within(editor).getByLabelText('Unit'))
    await user.type(within(editor).getByLabelText('Unit'), 'dozen')
    await user.selectOptions(within(editor).getByLabelText('Protein'), 'chicken')
    await user.selectOptions(within(editor).getByLabelText('Shopping category'), 'dairy')
    await user.click(within(editor).getByRole('button', { name: 'Save ingredient' }))

    expect(callbacks.onUpdateIngredient).toHaveBeenCalledWith({
      id: 'eggs',
      name: 'Large eggs',
      unit: 'dozen',
      proteinCategoryId: 'chicken',
      shoppingCategoryId: 'dairy',
    })
  })

  it('blocks duplicate ingredient names case-insensitively', async () => {
    const { callbacks } = setup()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: '+ Ingredient' }))
    const editor = screen.getByRole('dialog', { name: 'New ingredient' })
    await user.type(within(editor).getByLabelText('Name'), ' eggs ')
    await user.click(within(editor).getByRole('button', { name: 'Save ingredient' }))

    expect(within(editor).getByRole('alert')).toHaveTextContent('already exists')
    expect(callbacks.onCreateIngredient).not.toHaveBeenCalled()
  })

  it('marks used items and manages protein categories', async () => {
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
