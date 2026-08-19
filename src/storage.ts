import { defaultShoppingCategories } from './types'
import type { AppState, Ingredient, Meal, ShoppingCategory } from './types'
import { seedProteinCategories, seedState } from './data'
import { sharedStateId, supabase, supabaseConfigured } from './supabase'
import { normalizeRecipeUrl } from './meals/recipeDetails'

const DB_NAME = 'meal-planner-db'
const DB_VERSION = 1
const STORE_NAME = 'app'
const STATE_KEY = 'state'
const LEGACY_KEY = 'meal-planner-state-v1'

function cloneSeed(): AppState {
  return JSON.parse(JSON.stringify(seedState)) as AppState
}

function normalizeShoppingCategories(state: Partial<AppState>): {
  shoppingCategories: ShoppingCategory[]
  shoppingCategoryOrder: string[]
} {
  const defaultIds = new Set(defaultShoppingCategories.map((category) => category.id))
  const requested = (state.shoppingCategories ?? [])
    .filter((category): category is ShoppingCategory =>
      Boolean(category && typeof category.id === 'string' && category.id.trim() && typeof category.name === 'string' && category.name.trim()),
    )
    .map((category) => ({ id: category.id.trim(), name: category.name.trim() }))

  const requestedById = new Map(requested.map((category) => [category.id, category]))
  const customCategories = requested.filter((category) => !defaultIds.has(category.id))
  const shoppingCategories = [
    ...defaultShoppingCategories.map((category) => requestedById.get(category.id) ?? { ...category }),
    ...customCategories,
  ]

  const validIds = new Set(shoppingCategories.map((category) => category.id))
  const seen = new Set<string>()
  const shoppingCategoryOrder: string[] = []

  for (const categoryId of state.shoppingCategoryOrder ?? []) {
    if (!validIds.has(categoryId) || seen.has(categoryId)) continue
    seen.add(categoryId)
    shoppingCategoryOrder.push(categoryId)
  }

  for (const category of shoppingCategories) {
    if (seen.has(category.id)) continue
    seen.add(category.id)
    shoppingCategoryOrder.push(category.id)
  }

  return { shoppingCategories, shoppingCategoryOrder }
}

export function normalizeState(state: Partial<AppState>): AppState {
  const seed = cloneSeed()

  const proteinCategories =
    state.proteinCategories && state.proteinCategories.length > 0
      ? state.proteinCategories
      : seedProteinCategories

  const categoryIds = new Set(proteinCategories.map((category) => category.id))
  const { shoppingCategories, shoppingCategoryOrder } = normalizeShoppingCategories(state)
  const shoppingCategoryIds = new Set(shoppingCategories.map((category) => category.id))

  const legacyIngredientProteinById: Record<string, string | null> = {
    chicken: 'chicken',
    'ground-beef': 'beef',
  }
  const ingredients = (state.ingredients ?? seed.ingredients).map((ingredient) => {
    const legacyIngredient = ingredient as Ingredient & {
      proteinCategoryId?: string | null
      shoppingCategoryId?: string | null
    }
    const requestedId =
      legacyIngredient.proteinCategoryId ??
      legacyIngredientProteinById[ingredient.id] ??
      null
    const requestedShoppingCategoryId = legacyIngredient.shoppingCategoryId ?? null

    return {
      ...ingredient,
      proteinCategoryId:
        requestedId && categoryIds.has(requestedId) ? requestedId : null,
      shoppingCategoryId:
        requestedShoppingCategoryId && shoppingCategoryIds.has(requestedShoppingCategoryId)
          ? requestedShoppingCategoryId
          : null,
    }
  })
  const legacyProteinToId: Record<string, string> = {
    Chicken: 'chicken',
    Beef: 'beef',
    Seafood: 'seafood',
    Pork: 'pork',
    None: 'none',
    Lamb: 'lamb',
  }

  const ingredientProteinById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient.proteinCategoryId]),
  )

  const planner: AppState['planner'] = {}

  for (const [day, rows] of Object.entries(state.planner ?? {})) {
    planner[day] = {}
    for (const [rowId, value] of Object.entries(rows)) {
      if (Array.isArray(value)) {
        planner[day][rowId] = value.filter((mealId): mealId is string => typeof mealId === 'string').slice(0, 3)
      } else if (typeof value === 'string' && value) {
        planner[day][rowId] = [value]
      } else {
        planner[day][rowId] = []
      }
    }
  }
  const meals = (state.meals ?? seed.meals).map((meal) => {
    const legacyMeal = meal as Meal & {
      protein?: string
      proteinCategoryId?: string
      proteinCategoryOverrideId?: string | null
    }

    const explicitOverride =
      legacyMeal.proteinCategoryOverrideId ??
      legacyMeal.proteinCategoryId ??
      (legacyMeal.protein ? legacyProteinToId[legacyMeal.protein] : undefined)
    const derivedProteinIds = new Set(
      meal.ingredients
        .map((item) => ingredientProteinById.get(item.ingredientId))
        .filter((id): id is string => Boolean(id)),
    )
    // Older versions wrote "none" directly onto meals. In the ingredient-driven
    // model, that stale value must not suppress a real protein ingredient.
    const migratedOverride =
      explicitOverride === 'none' && derivedProteinIds.size > 0
        ? null
        : explicitOverride && categoryIds.has(explicitOverride)
          ? explicitOverride
          : null

    return {
      ...meal,
      proteinCategoryOverrideId: migratedOverride,
      recipeUrl: normalizeRecipeUrl(typeof meal.recipeUrl === 'string' ? meal.recipeUrl : '') ?? '',
      notes: typeof meal.notes === 'string' ? meal.notes.trim() : '',
      instructions: Array.isArray(meal.instructions)
        ? meal.instructions
          .filter((step): step is string => typeof step === 'string')
          .map((step) => step.trim())
          .filter(Boolean)
        : [],
    }
  })
  const manualShoppingItems = Object.fromEntries(
    Object.entries(state.manualShoppingItems ?? {}).map(([weekKey, items]) => [
      weekKey,
      items.map((item) => ({
        ...item,
        ingredientId:
          item.ingredientId && ingredients.some((ingredient) => ingredient.id === item.ingredientId)
            ? item.ingredientId
            : null,
        quantity:
          typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0
            ? item.quantity
            : undefined,
        unit: typeof item.unit === 'string' && item.unit.trim() ? item.unit.trim() : undefined,
        shoppingCategoryId:
          item.shoppingCategoryId && shoppingCategoryIds.has(item.shoppingCategoryId)
            ? item.shoppingCategoryId
            : null,
      })),
    ]),
  )

  const shoppingHistory = (state.shoppingHistory ?? []).map((item) => ({
    ...item,
    shoppingCategoryId:
      item.shoppingCategoryId && shoppingCategoryIds.has(item.shoppingCategoryId)
        ? item.shoppingCategoryId
        : null,
  }))

  return {
    ingredients,
    meals,
    planner,
    shoppingChecked: state.shoppingChecked ?? {},
    manualShoppingItems,
    proteinCategories,
    plannerRowsByWeek: state.plannerRowsByWeek ?? {},
    shoppingHistory,
    plannerNotes: state.plannerNotes ?? {},
    shoppingPurchasesByWeek: state.shoppingPurchasesByWeek ?? {},
    shoppingCategories,
    shoppingCategoryOrder,
  }
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}
async function readIndexedDB(): Promise<AppState | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const request = tx.objectStore(STORE_NAME).get(STATE_KEY)
    request.onsuccess = () => resolve((request.result as AppState | undefined) ?? null)
    request.onerror = () => reject(request.error)
    tx.oncomplete = () => db.close()
    tx.onerror = () => db.close()
  })
}
async function writeIndexedDB(state: AppState): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(state, STATE_KEY)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error)
    }
  })
}
function readLegacyLocalStorage(): AppState | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AppState
    return normalizeState(parsed)
  } catch {
    return null
  }
}

async function loadLocalState(): Promise<AppState> {
  try {
    const stored = await readIndexedDB()
    if (stored) return normalizeState(stored)
    const legacy = readLegacyLocalStorage()
    if (legacy) {
      await writeIndexedDB(legacy)
      localStorage.removeItem(LEGACY_KEY)
      return legacy
    }

    return normalizeState(cloneSeed())
  } catch {
    return readLegacyLocalStorage() ?? normalizeState(cloneSeed())
  }
}

async function cacheState(state: AppState): Promise<void> {
  try {
    await writeIndexedDB(state)
  } catch {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(state))
  }
}
async function readRemoteState(): Promise<AppState | null> {
  if (!supabaseConfigured) return null

  const { data, error } = await supabase
    .from('meal_planner_state')
    .select('state')
    .eq('id', sharedStateId)
    .maybeSingle()

  if (error) throw error
  if (!data?.state) return null

  return normalizeState(data.state as Partial<AppState>)
}

async function writeRemoteState(state: AppState): Promise<void> {
  if (!supabaseConfigured) return
  const { error } = await supabase
    .from('meal_planner_state')
    .upsert(
      {
        id: sharedStateId,
        state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

  if (error) throw error
}

export async function loadState(): Promise<AppState> {
  const local = await loadLocalState()

  if (!supabaseConfigured) {
    await cacheState(local)
    return local
  }

  try {
    const remote = await readRemoteState()
    if (remote) {
      await cacheState(remote)
      return remote
    }

    // First authenticated device seeds the shared row from its existing local data.
    await writeRemoteState(local)
    await cacheState(local)
    return local
  } catch (error) {
    console.warn('Remote meal-planner state unavailable; using local cache.', error)
    return local
  }
}

export async function saveState(state: AppState): Promise<void> {
  const normalized = normalizeState(state)
  // Always save locally first so the UI remains resilient offline.
  await cacheState(normalized)

  if (!supabaseConfigured) return

  try {
    await writeRemoteState(normalized)
  } catch (error) {
    console.warn('Could not sync meal-planner state to Supabase.', error)
  }
}

export function subscribeToRemoteState(
  onState: (state: AppState) => void,
): () => void {
  if (!supabaseConfigured) return () => undefined
  const channel = supabase
    .channel(`meal-planner-state-${sharedStateId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'meal_planner_state',
        filter: `id=eq.${sharedStateId}`,
      },
      (payload) => {
        const row = payload.new as { state?: Partial<AppState> } | undefined
        if (!row?.state) return
        const next = normalizeState(row.state)
        void cacheState(next)
        onState(next)
      },
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}
export async function resetState(): Promise<void> {
  try {
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(STATE_KEY)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } finally {
    localStorage.removeItem(LEGACY_KEY)
  }
}
