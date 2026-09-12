# Unified Ingredient Entry Design

## Goal

Make ingredient selection and creation feel like one coherent system across Meals and Shopping. The same ingredient search, result presentation, creation flow, typography, keyboard behavior, and responsive behavior should be used in both places.

This work should improve ergonomics without introducing a new data model or a broad application refactor.

## Current problems

- The Meals ingredient picker uses undersized option typography and a narrow dropdown that makes the `+ Create` action look clipped and visually inconsistent with the rest of the app.
- Meals exposes `+ Ingredient` as a top-level peer action beside `Manage` and `+ New meal`, even though ingredient creation is normally a supporting action while composing a meal.
- Shopping has a separate autocomplete experience and silently links exact ingredient matches, but the UI does not clearly communicate whether the user is selecting an existing ingredient, creating a reusable ingredient, or adding a one-off shopping item.
- Ingredient creation support is stronger in Meals than Shopping even though both operate on the same ingredient catalog.

## Design principles

1. Ingredient selection is one interaction pattern everywhere.
2. Ingredient creation uses one editor everywhere.
3. Shopping may add one-off items without forcing them into the ingredient catalog.
4. Shared behavior should be implemented once; Shopping-specific behavior should remain a thin extension.
5. Keep the implementation lean: no generalized `ItemPicker` abstraction and no schema migration unless implementation exposes an actual gap.

## Shared ingredient picker

`IngredientPicker` becomes the shared searchable ingredient selector used in both Meals and Shopping.

It owns:

- fuzzy/search-ranked ingredient matching using the existing search utilities;
- rendering existing ingredient results;
- keyboard navigation and selection;
- focus/open/close behavior;
- responsive dropdown positioning and sizing;
- consistent typography and touch-target sizing;
- the reusable `Create ingredient…` action when there is no exact name match;
- preventing duplicate-create affordances for exact name matches.

The picker should use normal application typography rather than the current compact utility-menu treatment. Ingredient names should render at normal UI size, with metadata such as units smaller and muted. Rows should be approximately 40–44 px tall and easy to tap.

The dropdown must support long names without clipping action text. On desktop it may be wider than the input when necessary. On mobile it must stay within the viewport. Long result labels should truncate or wrap intentionally rather than shrinking the font.

## Meals interaction

The Meals header should contain only:

- `Manage`
- `+ New meal`

The standalone `+ Ingredient` header action should be removed.

Inside the meal editor, ingredient rows continue to contain meal-specific information such as quantity, unit display, protein indication, and remove. The ingredient field uses the shared picker.

Flow:

1. Add an ingredient row.
2. Type to search existing ingredients.
3. Select an existing ingredient, or choose `Create “<name>”…`.
4. If creating, open the existing `IngredientEditor` with the typed name prefilled.
5. After a successful save, automatically select the new ingredient in that meal row.
6. Canceling creation returns to the meal without adding or selecting anything new.

Bulk ingredient maintenance remains available through `Manage`.

## Shopping interaction

Shopping uses the same shared ingredient-picker presentation and search behavior, but adds one Shopping-only concept: a one-off manual shopping item.

For typed text that does not exactly match an existing ingredient, the Shopping control should expose two clearly distinct actions:

- `Add “<name>” to shopping list` — creates a one-off/manual shopping item using the existing manual-item mechanism.
- `Create “<name>” as ingredient…` — opens the shared `IngredientEditor`; after save, the new ingredient is added to the ingredient catalog and immediately added to the current shopping list.

Selecting an existing ingredient should add a linked shopping item using that ingredient's canonical name, unit, ingredient id, and shopping category.

Existing ingredient results should be visually distinct from the action rows so the user can tell whether they are selecting, creating, or adding a one-off item.

The current Shopping add control should become a thin wrapper around the shared ingredient picker rather than maintaining a separate search/rendering implementation.

## Ingredient editor

There should remain exactly one `IngredientEditor` for reusable ingredients.

Whether launched from Meals or Shopping, it edits the same fields:

- name;
- unit;
- protein category;
- shopping category.

No separate quick-create ingredient form should be added.

Duplicate-name validation remains centralized in the existing ingredient catalog/editor logic.

## Data flow

No data-model rewrite is expected.

### Existing ingredient selected in Meals

`IngredientPicker` returns the ingredient id. The meal row stores that id as it does today.

### New ingredient created in Meals

`IngredientEditor` saves through the existing meal-controller ingredient creation path, then the originating meal row is updated to the new ingredient id.

### Existing ingredient selected in Shopping

Shopping adds a manual shopping item linked to the selected ingredient, preserving its ingredient id, canonical name, unit, and shopping category. Existing duplicate-protection rules for active shopping items continue to apply.

### New ingredient created in Shopping

Shopping opens `IngredientEditor`, saves the ingredient into the shared catalog, then adds that ingredient to the current shopping list as a linked item.

### One-off item added in Shopping

Shopping uses the existing manual-shopping-item flow with no ingredient id.

## Error handling and edge cases

- Exact ingredient-name matches should resolve to the existing ingredient and should not offer a duplicate-create action.
- `IngredientEditor` remains the final duplicate-name safety check.
- Canceling ingredient creation must not modify the meal or shopping list.
- Existing shopping duplicate protection should remain in place for active items.
- Existing ingredient selection in Shopping should use the ingredient's stored shopping category and unit.
- Long names and long create-action labels must remain readable on mobile and desktop.
- Dropdowns must remain within the viewport on mobile.
- The picker must continue to support keyboard navigation and Escape behavior.
- No new persistence/schema behavior should be introduced unless implementation proves it is required.

## Component boundaries

### `IngredientPicker`

Shared ingredient search/selection/create-entry surface. It should not know about meal rows or manual shopping items.

### `IngredientEditor`

Single reusable ingredient editor. Existing role remains intact.

### Meal form

Consumes `IngredientPicker` directly and translates selection/creation into meal-row updates.

### Shopping add control

Wraps `IngredientPicker` and adds the Shopping-only one-off-item action and shopping-list submission behavior.

This boundary intentionally avoids a generalized picker abstraction that tries to model ingredients, history, shopping-only items, and meals together.

## Visual treatment

The unified picker should align with the rest of the application:

- normal UI font size for ingredient names;
- smaller muted metadata;
- 40–44 px result/action rows;
- consistent border radius, spacing, focus treatment, and hover/active treatment;
- clearly separated action area for creation / one-off actions;
- mobile-safe width and touch targets;
- no clipped `+ Create` text;
- no font-size reduction as a workaround for long labels.

The objective is not a new visual language; it is to make ingredient entry look native to the existing app.

## Testing

Add focused interaction tests rather than broad snapshots.

Required coverage:

- shared picker search ranking and selection;
- keyboard navigation and Escape handling;
- exact-match suppression of duplicate creation;
- long create labels render without the previous clipped structure;
- Meals selects an existing ingredient in a row;
- Meals creates an ingredient and automatically selects it in the originating row;
- Shopping selects an existing ingredient and adds a linked shopping item;
- Shopping creates a reusable ingredient and immediately adds it to the list;
- Shopping adds a one-off item without creating an ingredient;
- canceling creation leaves state unchanged;
- existing meal, shopping, and ingredient tests continue to pass.

Responsive CSS should be covered through stable class/structure assertions where practical; avoid brittle pixel-exact tests.

## Non-goals

- changing the ingredient data model;
- replacing the ingredient-management screen;
- redesigning the entire Meals or Shopping view;
- making every shopping item an ingredient;
- introducing a generic all-purpose item selector;
- changing planner behavior;
- changing shopping history behavior except where necessary to preserve existing add-item semantics.

## Acceptance criteria

The change is complete when:

1. Meals and Shopping use the same ingredient search/result/create presentation.
2. The Meals `+ Ingredient` header action is removed.
3. Ingredient creation from Meals and Shopping uses the same `IngredientEditor`.
4. Shopping clearly supports all three outcomes: select existing ingredient, create reusable ingredient, add one-off item.
5. Selecting or creating an ingredient from Shopping results in a linked shopping item with ingredient metadata.
6. The create action and long labels are not clipped on desktop or mobile.
7. Existing persistence behavior remains compatible without a migration.
8. Focused tests plus the full existing test/typecheck/build suite pass.
