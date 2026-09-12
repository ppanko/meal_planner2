# Unified Ingredient Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the divergent Meals and Shopping ingredient-entry controls with one shared ingredient picker and one shared ingredient editor while preserving Shopping-only one-off items.

**Architecture:** `IngredientPicker` remains the shared ingredient-search component and gains only the minimal extension points Shopping needs: a customizable create label and one optional secondary action for the typed query. Meals consumes it directly. Shopping wraps it in `ShoppingAddCombobox`, while `useShoppingController` performs explicit ingredient-linked additions and atomic create-and-add updates so catalog and shopping state cannot overwrite each other.

**Tech Stack:** React 19, TypeScript 5.9, Vite 7, Vitest 4, Testing Library, existing app CSS.

**Spec:** `docs/superpowers/specs/2026-09-12-unified-ingredient-entry-design.md`

## Global Constraints

- Ingredient selection is one interaction pattern everywhere.
- Ingredient creation uses the existing `IngredientEditor` everywhere.
- Shopping must continue to allow one-off/manual items without creating ingredients.
- Do not introduce a generalized `ItemPicker` abstraction.
- Do not change the persisted data model or add a migration unless implementation demonstrates a real incompatibility.
- Existing ingredient duplicate-name validation remains authoritative.
- Mobile dropdowns must remain within the viewport; long labels must not be handled by shrinking font size.
- Preserve current planner behavior and shopping-history behavior outside the add-item interaction.
- Remove obsolete UI/state paths created redundant by this work rather than leaving dead code.

---

## File map

- `src/ingredients/IngredientPicker.tsx` — shared search, selection, create action, and optional Shopping-only secondary action.
- `src/ingredients/IngredientPicker.css` — shared dropdown typography, action separation, sizing, overflow, and responsive behavior.
- `src/ingredients/IngredientPicker.test.tsx` — focused component behavior for selection, keyboard navigation, exact-match create suppression, action ordering, and long labels.
- `src/meals/MealForm.tsx` — continues consuming `IngredientPicker`; no new ingredient-entry abstraction.
- `src/meals/MealForm.search.test.tsx` — verifies Meals still selects and creates ingredients through the shared picker/editor.
- `src/meals/MealsView.tsx` — removes the standalone `+ Ingredient` header action.
- `src/meals/useMealsController.ts` — removes obsolete standalone ingredient-editor state/actions if no remaining caller exists.
- `src/meals/useMealsController.test.ts` — removes/updates tests for the obsolete standalone editor path while retaining ingredient persistence tests.
- `src/App.tsx` — removes obsolete Meals header wiring/modal and wires Shopping ingredient actions.
- `src/App.test.tsx` — updates integration mocks/expectations for the changed view props.
- `src/shopping/useShoppingController.ts` — explicit existing-ingredient add and atomic create-and-add operations.
- `src/shopping/useShoppingController.test.ts` — controller tests for linked ingredient metadata, duplicate protection, and atomic catalog/list updates.
- `src/shopping/ShoppingAddCombobox.tsx` — thin Shopping wrapper around `IngredientPicker`.
- `src/shopping/ShoppingView.tsx` — launches `IngredientEditor` for Shopping-created ingredients and delegates selected/one-off actions.
- `src/shopping/ShoppingView.test.tsx` — end-to-end interaction tests for the three Shopping outcomes.
- `src/shopping/shoppingViewModel.ts` / `.test.ts` — remove `getShoppingSuggestions` only if it becomes unused after the shared picker replaces the old autocomplete.
- `src/styles.css` — remove obsolete `.shopping-suggestions` / `.shopping-suggestion` rules once the old combobox is gone.

---

### Task 1: Make `IngredientPicker` the complete shared entry surface

**Files:**
- Modify: `src/ingredients/IngredientPicker.tsx`
- Modify: `src/ingredients/IngredientPicker.css`
- Create: `src/ingredients/IngredientPicker.test.tsx`

**Interfaces:**
- Consumes: `Ingredient[]`, existing `sortBySearch()`, existing selected `value` id.
- Produces:

```ts
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
```

The default create text remains `Create “<name>”…`, so existing Meals behavior does not need special configuration. `secondaryAction` is rendered only for non-empty query text with no exact ingredient-name match.

- [ ] **Step 1: Add failing component tests for the shared actions and exact-match behavior**

Create `src/ingredients/IngredientPicker.test.tsx` with focused tests like:

```tsx
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { IngredientPicker } from './IngredientPicker'

const ingredients = [
  { id: 'chicken', name: 'Chicken', unit: 'lb', proteinCategoryId: 'chicken', shoppingCategoryId: null },
  { id: 'milk', name: 'Milk', unit: 'cup', proteinCategoryId: null, shoppingCategoryId: 'dairy' },
]

it('renders shared secondary and create actions after ingredient results', () => {
  render(<IngredientPicker
    label="Ingredient"
    ingredients={ingredients}
    value=""
    onChange={vi.fn()}
    onCreate={vi.fn()}
    createLabel={(name) => `Create “${name}” as ingredient…`}
    secondaryAction={{
      label: (name) => `Add “${name}” to shopping list`,
      onSelect: vi.fn(),
    }}
  />)

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Paper towels' } })
  const options = screen.getAllByRole('option')
  expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
    'Add “Paper towels” to shopping list',
    'Create “Paper towels” as ingredient…',
  ])
})

it('does not offer create or one-off actions for an exact ingredient match', () => {
  render(<IngredientPicker
    label="Ingredient"
    ingredients={ingredients}
    value=""
    onChange={vi.fn()}
    onCreate={vi.fn()}
    secondaryAction={{ label: (name) => `Add “${name}” to shopping list`, onSelect: vi.fn() }}
  />)

  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'milk' } })
  expect(screen.getByRole('option', { name: 'Milk' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /Add .* shopping list/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /Create/ })).not.toBeInTheDocument()
})
```

Also include tests that `ArrowDown`/`ArrowUp` can reach both action rows, `Enter` invokes the active action, and `Escape` closes the listbox without invoking a parent action.

- [ ] **Step 2: Run the new picker tests and verify they fail**

Run:

```bash
npm test -- src/ingredients/IngredientPicker.test.tsx
```

Expected: FAIL because `createLabel` and `secondaryAction` are not yet supported.

- [ ] **Step 3: Extend the picker with a small action model**

Update `IngredientPicker.tsx` so option count and keyboard indexing include existing results plus optional action rows. Keep result rows first and render a separate action region after results.

Core calculation:

```ts
const actionName = filterText.trim()
const hasExactMatch = actionName.length > 0 && ingredients.some(
  (ingredient) => ingredient.name.trim().toLocaleLowerCase() === actionName.toLocaleLowerCase(),
)
const showSecondaryAction = Boolean(secondaryAction) && actionName.length > 0 && !hasExactMatch
const showCreate = Boolean(onCreate) && actionName.length > 0 && !hasExactMatch
const secondaryIndex = options.length
const createIndex = options.length + (showSecondaryAction ? 1 : 0)
const optionCount = options.length + Number(showSecondaryAction) + Number(showCreate)
```

Add helpers that close the picker after an action:

```ts
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
```

Use the same index model in `aria-activedescendant`, keyboard `Enter`, mouse hover, and `aria-selected`. Give action rows explicit classes such as `ingredient-combobox-actions`, `ingredient-combobox-secondary`, and `ingredient-combobox-create`.

- [ ] **Step 4: Replace undersized/clipping CSS with app-native shared styling**

In `IngredientPicker.css`, use normal UI sizing and a bounded wider desktop menu:

```css
.ingredient-combobox-options {
  position: absolute;
  z-index: 40;
  top: calc(100% + 4px);
  left: 0;
  width: max(100%, min(360px, calc(100vw - 32px)));
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: white;
  box-shadow: 0 10px 28px rgba(45, 40, 34, .14);
}

.ingredient-combobox-options button {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 12px;
  border: 0;
  border-bottom: 1px solid var(--line);
  border-radius: 0;
  background: white;
  color: #37332e;
  text-align: left;
  font-size: 14px;
}

.ingredient-combobox-options button > span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: inherit;
  font-size: inherit;
  font-weight: 600;
}

.ingredient-combobox-options button small {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 12px;
}

.ingredient-combobox-actions {
  border-top: 1px solid var(--line);
}
```

For `@media (max-width: 500px)`, constrain the menu to `width: 100%`, `max-width: calc(100vw - 28px)`, keep a 40–44px minimum action height, and do not reduce the font to solve overflow.

- [ ] **Step 5: Run shared picker and existing MealForm search tests**

Run:

```bash
npm test -- src/ingredients/IngredientPicker.test.tsx src/meals/MealForm.search.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ingredients/IngredientPicker.tsx src/ingredients/IngredientPicker.css src/ingredients/IngredientPicker.test.tsx
git commit -m "refactor: unify ingredient picker actions"
```

---

### Task 2: Simplify Meals to creation-in-context only

**Files:**
- Modify: `src/meals/MealsView.tsx`
- Modify: `src/meals/useMealsController.ts`
- Modify: `src/meals/useMealsController.test.ts`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Test/verify: `src/meals/MealForm.search.test.tsx`

**Interfaces:**
- Consumes: Task 1 `IngredientPicker`; existing `MealForm` inline creation path remains unchanged.
- Produces: `MealsView` no longer accepts `onNewIngredient`; controller no longer exposes a standalone ingredient-editor modal path. `createIngredient(ingredient: Ingredient)` remains because MealForm and library management still use it.

- [ ] **Step 1: Add/update a failing Meals-view integration assertion**

In the relevant `App.test.tsx` or existing Meals-view test, assert that the Meals header exposes `Manage` and `+ New meal` but not a standalone ingredient action:

```ts
expect(screen.getByRole('button', { name: 'Manage library' })).toBeInTheDocument()
expect(screen.getByRole('button', { name: '+ New meal' })).toBeInTheDocument()
expect(screen.queryByRole('button', { name: '+ Ingredient' })).not.toBeInTheDocument()
```

Keep `MealForm.search.test.tsx` as the regression proving ingredient creation still exists where needed.

- [ ] **Step 2: Run the focused test and verify it fails**

Run the exact modified test file with `npm test -- <path>`.

Expected: FAIL because `+ Ingredient` is still present.

- [ ] **Step 3: Remove the standalone header action and prop**

In `MealsView.tsx`:

```ts
export function MealsView({ meals, ingredients, onNew, onManageLibrary, ... }: {
  meals: Meal[]
  ingredients: Ingredient[]
  onNew: () => void
  onManageLibrary: () => void
  // no onNewIngredient
  ...
})
```

Delete the `+ Ingredient` button block from the header. Do not change the `Manage` or `+ New meal` behavior.

- [ ] **Step 4: Remove the obsolete standalone editor state path**

Inspect `useMealsController.ts` and remove only state/functions that exist solely for the old header-triggered editor (`showIngredientEditor`, `openIngredientEditor`, `closeIngredientEditor`, or equivalent). Keep:

```ts
function createIngredient(ingredient: Ingredient) {
  if (!state) return
  if (state.ingredients.some((item) => item.id === ingredient.id)
      || findIngredientByName(state.ingredients, ingredient.name)) return
  update({ ...state, ingredients: [...state.ingredients, ingredient] })
}
```

Update `useMealsController.test.ts` to remove tests of the deleted modal toggles while retaining tests of `createIngredient` duplicate protection/persistence.

- [ ] **Step 5: Remove App wiring for the obsolete modal**

In `App.tsx`:

- stop passing `onNewIngredient` to `MealsView`;
- remove the top-level `{meals.showIngredientEditor && <IngredientEditor ... />}` block;
- remove the `IngredientEditor` import from `App.tsx` if it becomes unused there.

Do not remove `IngredientEditor` from `MealForm` or `MealLibraryManager`.

- [ ] **Step 6: Run Meals-focused tests**

Run:

```bash
npm test -- src/meals/MealForm.search.test.tsx src/meals/useMealsController.test.ts src/App.test.tsx
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/meals/MealsView.tsx src/meals/useMealsController.ts src/meals/useMealsController.test.ts src/App.tsx src/App.test.tsx
git commit -m "refactor: create ingredients in meal context"
```

---

### Task 3: Add explicit and atomic Shopping ingredient operations

**Files:**
- Modify: `src/shopping/useShoppingController.ts`
- Modify: `src/shopping/useShoppingController.test.ts`

**Interfaces:**
- Consumes: existing `Ingredient`, `ManualShoppingItem`, week-key state, existing duplicate protection.
- Produces:

```ts
addIngredientToShopping: (ingredientId: string) => void
createIngredientAndAddToShopping: (ingredient: Ingredient) => void
addManualShoppingItem: (name: string) => void
```

`addManualShoppingItem` remains one-off/free-text behavior. `addIngredientToShopping` explicitly links a catalog item. `createIngredientAndAddToShopping` performs one `update()` containing both the new catalog item and its linked manual shopping row.

- [ ] **Step 1: Write failing controller tests for explicit linking and atomic create-and-add**

Add tests to `useShoppingController.test.ts`:

```ts
it('adds an existing ingredient as a linked shopping item', () => {
  const state = createAppState()
  const { result, update } = setup(state)

  act(() => result.current.addIngredientToShopping('milk'))

  const next = update.mock.calls[0][0] as AppState
  const added = next.manualShoppingItems['2026-08-17'].at(-1)!
  expect(added).toMatchObject({
    ingredientId: 'milk',
    name: 'Milk',
    quantity: 1,
    unit: 'cup',
  })
})

it('creates an ingredient and linked shopping item in one update', () => {
  const state = createAppState()
  const { result, update } = setup(state)
  const ingredient: Ingredient = {
    id: 'shallot',
    name: 'Shallot',
    unit: 'each',
    proteinCategoryId: null,
    shoppingCategoryId: 'produce',
  }

  act(() => result.current.createIngredientAndAddToShopping(ingredient))

  expect(update).toHaveBeenCalledTimes(1)
  const next = update.mock.calls[0][0] as AppState
  expect(next.ingredients).toContainEqual(ingredient)
  expect(next.manualShoppingItems['2026-08-17'].at(-1)).toMatchObject({
    ingredientId: 'shallot',
    name: 'Shallot',
    unit: 'each',
    quantity: 1,
    shoppingCategoryId: 'produce',
  })
})
```

Also test that a duplicate ingredient id/name is rejected and that an already-active separately added ingredient is not duplicated.

- [ ] **Step 2: Run the focused controller tests and verify they fail**

Run:

```bash
npm test -- src/shopping/useShoppingController.test.ts
```

Expected: FAIL because the new controller methods do not exist.

- [ ] **Step 3: Factor one private append helper inside the controller**

Keep the helper local to `useShoppingController.ts`; do not create a new module unless it is independently reused.

```ts
function buildLinkedManualItem(ingredient: Ingredient): ManualShoppingItem {
  return {
    id: crypto.randomUUID(),
    name: ingredient.name,
    checked: false,
    shoppingCategoryId: ingredient.shoppingCategoryId ?? null,
    ingredientId: ingredient.id,
    quantity: 1,
    unit: ingredient.unit,
  }
}
```

Retain the current normalized-name duplicate check against unchecked manual rows.

- [ ] **Step 4: Implement explicit existing-ingredient addition**

```ts
function addIngredientToShopping(ingredientId: string) {
  if (!state) return
  const ingredient = state.ingredients.find((item) => item.id === ingredientId)
  if (!ingredient) return

  const current = state.manualShoppingItems[shoppingWeekKey] ?? []
  const normalized = ingredient.name.trim().toLowerCase()
  if (current.some((item) => !item.checked && item.name.trim().toLowerCase() === normalized)) return

  update({
    ...state,
    manualShoppingItems: {
      ...state.manualShoppingItems,
      [shoppingWeekKey]: [...current, buildLinkedManualItem(ingredient)],
    },
  })
}
```

- [ ] **Step 5: Implement atomic create-and-add**

```ts
function createIngredientAndAddToShopping(ingredient: Ingredient) {
  if (!state) return
  if (state.ingredients.some((item) => item.id === ingredient.id)
      || findIngredientByName(state.ingredients, ingredient.name)) return

  const current = state.manualShoppingItems[shoppingWeekKey] ?? []
  const normalized = ingredient.name.trim().toLowerCase()
  if (current.some((item) => !item.checked && item.name.trim().toLowerCase() === normalized)) return

  update({
    ...state,
    ingredients: [...state.ingredients, ingredient],
    manualShoppingItems: {
      ...state.manualShoppingItems,
      [shoppingWeekKey]: [...current, buildLinkedManualItem(ingredient)],
    },
  })
}
```

Keep `addManualShoppingItem(name)` for one-off text. Do not route create-and-add through two public controller calls.

- [ ] **Step 6: Export the methods and rerun controller tests**

Add both methods to the returned controller object, then run:

```bash
npm test -- src/shopping/useShoppingController.test.ts src/shopping/useShoppingController.ingredientBoundary.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/shopping/useShoppingController.ts src/shopping/useShoppingController.test.ts
git commit -m "feat: add linked shopping ingredients atomically"
```

---

### Task 4: Replace Shopping autocomplete with the shared picker and editor

**Files:**
- Modify: `src/shopping/ShoppingAddCombobox.tsx`
- Modify: `src/shopping/ShoppingView.tsx`
- Modify: `src/shopping/ShoppingView.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify if unused: `src/shopping/shoppingViewModel.ts`
- Modify if unused: `src/shopping/shoppingViewModel.test.ts`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes from Task 1: `IngredientPicker`, `createLabel`, `secondaryAction`.
- Consumes from Task 3:

```ts
onAddIngredient: (ingredientId: string) => void
onCreateIngredient: (ingredient: Ingredient) => void
onAddManual: (name: string) => void
```

- Produces: Shopping presents exactly three outcomes where applicable: select existing ingredient, add one-off item, create reusable ingredient.

- [ ] **Step 1: Rewrite Shopping-view tests first for the three user outcomes**

Update `props()` in `ShoppingView.test.tsx` to add:

```ts
onAddIngredient: vi.fn(),
onCreateIngredient: vi.fn(),
```

Replace old autocomplete expectations with tests like:

```ts
it('adds an existing ingredient through the shared picker', async () => {
  const callbacks = props()
  const user = userEvent.setup()
  render(<ShoppingView {...callbacks} />)

  const input = screen.getByRole('combobox', { name: 'Add shopping list item' })
  await user.type(input, 'milk')
  await user.click(screen.getByRole('option', { name: 'Milk' }))

  expect(callbacks.onAddIngredient).toHaveBeenCalledWith('milk')
  expect(callbacks.onAddManual).not.toHaveBeenCalled()
})

it('offers one-off and reusable creation for unknown shopping text', async () => {
  const callbacks = props()
  const user = userEvent.setup()
  render(<ShoppingView {...callbacks} />)

  const input = screen.getByRole('combobox', { name: 'Add shopping list item' })
  await user.type(input, 'Paper towels')

  expect(screen.getByRole('option', { name: 'Add “Paper towels” to shopping list' })).toBeInTheDocument()
  expect(screen.getByRole('option', { name: 'Create “Paper towels” as ingredient…' })).toBeInTheDocument()
})
```

Add a creation test that clicks `Create … as ingredient…`, verifies the existing `IngredientEditor` opens with the name prefilled, fills unit/category if needed, saves, and expects `onCreateIngredient` to receive the complete `Ingredient` object. Add a one-off test expecting only `onAddManual('Paper towels')`.

- [ ] **Step 2: Run Shopping-view tests and verify they fail**

Run:

```bash
npm test -- src/shopping/ShoppingView.test.tsx
```

Expected: FAIL because Shopping still uses its separate suggestion combobox.

- [ ] **Step 3: Make `ShoppingAddCombobox` a thin `IngredientPicker` wrapper**

Replace its independent input/listbox state with:

```tsx
import { IngredientPicker } from '../ingredients/IngredientPicker'
import type { Ingredient } from '../types'

export function ShoppingAddCombobox({
  ingredients,
  onAddIngredient,
  onAddManual,
  onRequestCreate,
}: {
  ingredients: Ingredient[]
  onAddIngredient: (ingredientId: string) => void
  onAddManual: (name: string) => void
  onRequestCreate: (name: string) => void
}) {
  return (
    <div className="shopping-add-shell">
      <IngredientPicker
        label="Add shopping list item"
        ingredients={ingredients}
        value=""
        onChange={(ingredientId) => {
          if (ingredientId) onAddIngredient(ingredientId)
        }}
        onCreate={onRequestCreate}
        createLabel={(name) => `Create “${name}” as ingredient…`}
        secondaryAction={{
          label: (name) => `Add “${name}” to shopping list`,
          onSelect: onAddManual,
        }}
      />
    </div>
  )
}
```

There should be no duplicate search-ranking, arrow-key, blur, or result-rendering logic in this wrapper.

- [ ] **Step 4: Add Shopping-owned editor state to `ShoppingView`**

Add:

```ts
const [creatingIngredientName, setCreatingIngredientName] = useState<string | null>(null)
```

Extend `ShoppingViewProps` with:

```ts
proteinCategories: ProteinCategory[]
onAddIngredient: (ingredientId: string) => void
onCreateIngredient: (ingredient: Ingredient) => void
```

Render the new wrapper:

```tsx
<ShoppingAddCombobox
  ingredients={props.ingredients}
  onAddIngredient={props.onAddIngredient}
  onAddManual={props.onAddManual}
  onRequestCreate={setCreatingIngredientName}
/>
```

When `creatingIngredientName` is non-null, render the existing editor:

```tsx
<IngredientEditor
  ingredients={props.ingredients}
  proteinCategories={props.proteinCategories}
  shoppingCategories={props.shoppingCategories}
  initialName={creatingIngredientName}
  onCancel={() => setCreatingIngredientName(null)}
  onSave={(ingredient) => {
    props.onCreateIngredient(ingredient)
    setCreatingIngredientName(null)
  }}
/>
```

Cancel must not invoke either add callback.

- [ ] **Step 5: Wire App to the Shopping controller**

Pass from `App.tsx`:

```tsx
<ShoppingView
  ...
  ingredients={state.ingredients}
  proteinCategories={state.proteinCategories}
  onAddIngredient={shopping.addIngredientToShopping}
  onCreateIngredient={shopping.createIngredientAndAddToShopping}
/>
```

Update `App.test.tsx` mocks/types for the two new controller methods and Shopping props.

- [ ] **Step 6: Remove the old Shopping suggestion implementation if now unused**

If `getShoppingSuggestions` has no remaining caller after the wrapper rewrite, delete it and its dedicated tests from `shoppingViewModel.ts` / `shoppingViewModel.test.ts`. Remove obsolete `.shopping-suggestions` and `.shopping-suggestion` CSS from `styles.css`.

Do not remove Shopping History itself; the purchased-before panel remains the reuse mechanism for historical items.

- [ ] **Step 7: Run Shopping and shared-picker tests**

Run:

```bash
npm test -- src/ingredients/IngredientPicker.test.tsx src/shopping/ShoppingView.test.tsx src/shopping/useShoppingController.test.ts src/shopping/shoppingViewModel.test.ts src/App.test.tsx
```

If `shoppingViewModel.test.ts` no longer exists after cleanup, omit it from the command.

Expected: PASS.

- [ ] **Step 8: Run full verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all tests pass; TypeScript succeeds; production build succeeds. The existing Vite chunk-size advisory, if unchanged, is not a failure for this work.

- [ ] **Step 9: Review for dead ingredient-entry code and scope drift**

Search:

```bash
git grep -n "showIngredientEditor\|openIngredientEditor\|onNewIngredient\|shopping-suggestions\|getShoppingSuggestions"
```

Expected: no obsolete standalone Meals editor path or old Shopping autocomplete code remains. Any remaining matches must have an intentional active caller.

Review the diff and confirm there are no persistence/schema changes and no unrelated Planner/Shopping History redesign.

- [ ] **Step 10: Commit**

```bash
git add src/shopping/ShoppingAddCombobox.tsx src/shopping/ShoppingView.tsx src/shopping/ShoppingView.test.tsx src/shopping/shoppingViewModel.ts src/shopping/shoppingViewModel.test.ts src/styles.css src/App.tsx src/App.test.tsx
git commit -m "feat: unify shopping ingredient entry"
```

If either `shoppingViewModel` file is unchanged or deleted, adjust the `git add` paths accordingly.

---

## Final acceptance review

Before opening the implementation PR, verify each approved requirement against the finished UI and tests:

- Meals and Shopping display the same ingredient result rows and create treatment.
- Meals has no standalone `+ Ingredient` header action.
- Meals inline creation still opens `IngredientEditor` and selects the saved ingredient in the originating row.
- Shopping selecting an existing ingredient adds a linked item with ingredient id/unit/category metadata.
- Shopping unknown text exposes both one-off and reusable-create actions.
- Shopping-created ingredients are written to the catalog and current list in one controller update.
- Exact ingredient-name matches do not offer duplicate creation or one-off actions.
- Long action labels are not clipped; typography remains normal-sized on mobile and desktop.
- Obsolete Shopping autocomplete and standalone Meals ingredient-editor code are removed.
- No data-model migration is present.
- `npm test`, `npm run typecheck`, and `npm run build` all pass.
