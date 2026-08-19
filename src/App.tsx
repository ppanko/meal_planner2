import { useMemo, useState } from 'react'
import { DndContext, DragOverlay } from '@dnd-kit/core'
import type { AppView } from './appTypes'
import { PlannerView } from './planner/PlannerView'
import { MealCard } from './planner/PlannerSlots'
import { usePlannerController } from './planner/usePlannerController'
import { MealsView } from './meals/MealsView'
import { MealForm } from './meals/MealForm'
import { MealLibraryManager } from './meals/MealLibraryManager'
import { CookingView } from './meals/CookingView'
import { useMealsController } from './meals/useMealsController'
import { ShoppingView } from './shopping/ShoppingView'
import { useShoppingController } from './shopping/useShoppingController'
import { usePersistentAppState } from './state/usePersistentAppState'
import { SyncConflictDialog } from './state/SyncConflictDialog'
import { SyncStatusIndicator } from './state/SyncStatusIndicator'
import { formatRange, getWeekDates, getWeekDatesForDateKey } from './utils/dates'

function App() {
  const [view, setView] = useState<AppView>('planner')
  const [weekOffset, setWeekOffset] = useState(0)
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset])

  const {
    state,
    storageReady,
    undoAction,
    syncStatus,
    syncConflict,
    conflictVisible,
    update,
    updateWithUndo,
    undoLastAction,
    resolveConflict,
    deferConflict,
    reviewConflict,
  } = usePersistentAppState()

  const planner = usePlannerController({
    state,
    weekOffset,
    weekDates,
    setView,
    update,
    updateWithUndo,
  })

  const meals = useMealsController({
    state,
    setView,
    update,
    updateWithUndo,
  })

  const shopping = useShoppingController({
    state,
    weekDates,
    update,
    updateWithUndo,
  })

  if (!storageReady || !state) {
    return <div className="loading-screen"><div className="loading-card">Loading Meal Planner…</div></div>
  }

  return (
    <DndContext sensors={planner.sensors} onDragStart={planner.handleDragStart} onDragEnd={planner.handleDragEnd}>
      <div className="app-shell">
        <header className="topbar">
          <div>
            <div className="eyebrow">PERSONAL</div>
            <h1>Meal Planner</h1>
          </div>
          <div className="topbar-actions">
            <SyncStatusIndicator status={syncStatus} onReview={reviewConflict} />
            {view === 'planner' && <button className="text-button" onClick={planner.clearWeek}>Clear week</button>}
            {view === 'shopping' && <button className="text-button" onClick={shopping.clearShoppingList}>Clear shopping list</button>}
          </div>
        </header>

        <main className="content">
          {view === 'planner' && (
            <PlannerView
              state={state}
              weekDates={weekDates}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              addMeal={planner.addMeal}
              addMealToSlot={planner.addMealToSlot}
              removeMeal={planner.removeMeal}
              updatePlannerNote={planner.updatePlannerNote}
              addPlannerRow={planner.addPlannerRow}
              removePlannerRow={planner.removePlannerRow}
              onCopyWeek={planner.openCopyWeek}
              proteinCategories={state.proteinCategories}
            />
          )}

          {view === 'meals' && (
            <MealsView
              meals={state.meals}
              ingredients={state.ingredients}
              onNew={meals.openNewMeal}
              onManageLibrary={meals.openLibraryManager}
              onStartCooking={meals.startCooking}
              onEdit={meals.openEditMeal}
              onDelete={meals.deleteMeal}
              onDuplicate={meals.duplicateMeal}
              proteinCategories={state.proteinCategories}
            />
          )}

          {view === 'shopping' && (
            <ShoppingView
              shopping={shopping.shopping}
              manualItems={shopping.manualShopping}
              onToggle={shopping.toggleShopping}
              onAddManual={shopping.addManualShoppingItem}
              onToggleManual={shopping.toggleManualShoppingItem}
              onDeleteManual={shopping.deleteManualShoppingItem}
              onClearChecked={shopping.clearCheckedShopping}
              history={state.shoppingHistory}
              onAddHistory={shopping.addHistoryItemToShopping}
              onDeleteHistory={shopping.deleteShoppingHistoryItem}
              weekDates={weekDates}
              weekOffset={weekOffset}
              setWeekOffset={setWeekOffset}
              ingredients={state.ingredients}
              shoppingCategories={shopping.orderedShoppingCategories}
              onSetItemCategory={shopping.setShoppingItemCategory}
              onAddShoppingCategory={shopping.addShoppingCategory}
              onMoveShoppingCategory={shopping.moveShoppingCategory}
              onDeleteShoppingCategory={shopping.deleteShoppingCategory}
            />
          )}
        </main>

        <nav className="bottom-nav">
          <button className={view === 'planner' ? 'active' : ''} onClick={() => setView('planner')}>
            <span>▦</span><small>Planner</small>
          </button>
          <button className={view === 'meals' ? 'active' : ''} onClick={() => setView('meals')}>
            <span>☷</span><small>Meals</small>
          </button>
          <button className={view === 'shopping' ? 'active' : ''} onClick={() => setView('shopping')}>
            <span>✓</span><small>Shopping</small>
            {(shopping.shopping.some((item) => !item.checked) || shopping.manualShopping.some((item) => !item.checked)) && <i />}
          </button>
        </nav>

        {meals.showMealForm && (
          <MealForm
            meal={meals.editingMeal}
            ingredients={state.ingredients}
            proteinCategories={state.proteinCategories}
            duplicateMode={meals.duplicateMode}
            onCancel={meals.closeMealForm}
            onSave={meals.saveMeal}
          />
        )}

        {meals.showLibraryManager && (
          <MealLibraryManager
            meals={state.meals}
            ingredients={state.ingredients}
            proteinCategories={state.proteinCategories}
            onClose={meals.closeLibraryManager}
            onCreateIngredient={meals.createIngredient}
            onDeleteIngredient={meals.deleteIngredient}
            onCreateProteinCategory={meals.createProteinCategory}
            onDeleteProteinCategory={meals.deleteProteinCategory}
          />
        )}

        {meals.cookingMeal && (
          <CookingView meal={meals.cookingMeal} ingredients={state.ingredients} onClose={meals.closeCooking} />
        )}

        {planner.showCopyWeek && (
          <div className="modal-backdrop" onClick={planner.closeCopyWeek}>
            <div
              className="modal copy-week-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="copy-week-title"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-header">
                <div>
                  <div className="eyebrow">COPY WEEK</div>
                  <h2 id="copy-week-title">Copy into {formatRange(weekDates)}</h2>
                </div>
                <button type="button" onClick={planner.closeCopyWeek} aria-label="Close">×</button>
              </div>

              {planner.copyableWeekKeys.length > 0 ? (
                <>
                  <label>
                    Source week
                    <select
                      value={planner.copySourceWeekKey}
                      onChange={(event) => planner.setCopySourceWeekKey(event.target.value)}
                    >
                      {planner.copyableWeekKeys.map((weekKey) => {
                        const dates = getWeekDatesForDateKey(weekKey)
                        return (
                          <option key={weekKey} value={weekKey}>
                            {formatRange(dates)} · {dates[6].getFullYear()}
                          </option>
                        )
                      })}
                    </select>
                  </label>

                  <p className="copy-week-note">
                    This replaces this week’s planned meals, notes, and custom rows. Generated shopping checkmarks are reset; manual shopping items are kept.
                  </p>
                </>
              ) : (
                <div className="copy-week-empty">There are no other populated weeks to copy.</div>
              )}

              <div className="modal-actions">
                <button type="button" className="secondary" onClick={planner.closeCopyWeek}>Cancel</button>
                <button
                  type="button"
                  className="primary"
                  disabled={!planner.copySourceWeekKey}
                  onClick={() => planner.copyWeek(planner.copySourceWeekKey)}
                >
                  Copy week
                </button>
              </div>
            </div>
          </div>
        )}

        {undoAction && (
          <div className="undo-snackbar" role="status" aria-live="polite">
            <span>{undoAction.message}</span>
            <button type="button" onClick={undoLastAction}>Undo</button>
          </div>
        )}

        {conflictVisible && syncConflict && (
          <SyncConflictDialog
            conflict={syncConflict}
            onResolve={resolveConflict}
            onDefer={deferConflict}
          />
        )}
      </div>

      <DragOverlay>
        {planner.activeMeal ? (
          <MealCard
            meal={planner.activeMeal}
            overlay
            ingredients={state.ingredients}
            proteinCategories={state.proteinCategories}
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

export default App
