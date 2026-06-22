import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// ===== Configuration des raretés =====
// 'secret' existe dans le schéma mais reste volontairement absente de cet
// objet d'affichage tant qu'elle n'est pas utilisée : voir RARETES_VISIBLES.
export const RARETES = {
  commun:     { label: 'Commun',     couleur: '#9ca3af', texte: '#000000', ordre: 1 },
  rare:       { label: 'Rare',       couleur: '#00ff40', texte: '#000000', ordre: 2 },
  epique:     { label: 'Épique',     couleur: '#6a00ff', texte: '#000000', ordre: 3 },
  legendaire: { label: 'Légendaire', couleur: '#fffb00', texte: '#000000', ordre: 4 },
  cosmique:   { label: 'Cosmique',   couleur: '#e200e6', texte: '#000000', ordre: 5 },
  secret:     { label: '???',        couleur: '#000000', texte: '#e6e6e6', ordre: 99 }
}

// Raretés affichées dans les interfaces (légendes, filtres...).
// 'secret' est exclue ici : elle existe en base pour une utilisation future,
// mais ne doit pas apparaître dans l'UI tant qu'elle n'est pas activée.
export const RARETES_VISIBLES = Object.keys(RARETES).filter(r => r !== 'secret')

/** Récupère la liste des loot box actives, triées pour l'affichage. */
export async function chargerLootBoxes() {
  const { data, error } = await db.from('loot_boxes')
    .select('*')
    .eq('actif', true)
    .order('ordre', { ascending: true })
  if (error || !data) return []
  return data
}

/** Récupère le pool de créatures (avec poids de tirage) pour une loot box donnée. */
export async function chargerPoolLootBox(lootBoxId) {
  const { data, error } = await db.from('loot_box_creatures')
    .select('poids, creatures(*)')
    .eq('loot_box_id', lootBoxId)
  if (error || !data) return []
  return data
    .filter(ligne => ligne.creatures && ligne.creatures.actif)
    .map(ligne => ({ ...ligne.creatures, poids: ligne.poids }))
}

/** Tire une créature au hasard dans un pool, pondéré par `poids`. */
export function tirerCreature(pool) {
  const poidsTotal = pool.reduce((somme, c) => somme + Number(c.poids), 0)
  if (poidsTotal <= 0) return null
  let tirage = Math.random() * poidsTotal
  for (const c of pool) {
    tirage -= Number(c.poids)
    if (tirage <= 0) return c
  }
  return pool[pool.length - 1]
}

/** Retourne la collection complète de l'utilisateur : Map creature_id -> ligne BDD. */
export async function chargerCollection(userId) {
  if (!userId) return new Map()
  const { data, error } = await db.from('creatures_utilisateurs')
    .select('*')
    .eq('user_id', userId)
  if (error || !data) return new Map()
  return new Map(data.map(l => [l.creature_id, l]))
}

/**
 * Ouvre une loot box pour l'utilisateur :
 * - débite le prix (vérifié et appliqué côté appelant, voir lootbox.html)
 * - tire une créature dans le pool
 * - si déjà possédée : revente automatique (retourne le gain en pièces)
 * - sinon : ajoutée à la collection (pas encore équipée)
 * Retourne { creature, estDoublon, gainVente }.
 */
export async function ouvrirLootBox(userId, lootBoxId) {
  const pool = await chargerPoolLootBox(lootBoxId)
  if (pool.length === 0) throw new Error('Cette loot box ne contient aucune créature configurée.')

  const creature = tirerCreature(pool)
  const collection = await chargerCollection(userId)
  const dejaPossedee = collection.has(creature.id)

  if (dejaPossedee) {
    // Doublon : pas d'insertion, on signale juste la revente.
    // Le gain en pièces doit être crédité côté appelant (qui gère `pieces`).
    return { creature, estDoublon: true, gainVente: creature.prix_vente }
  }

  const { error } = await db.from('creatures_utilisateurs')
    .insert([{ user_id: userId, creature_id: creature.id, equipee: false }])
  if (error) throw error

  return { creature, estDoublon: false, gainVente: 0 }
}

/**
 * Équipe une créature (et déséquipe automatiquement l'ancienne, une seule
 * créature active à la fois — voir l'index unique partiel côté BDD).
 */
export async function equiperCreature(userId, creatureId) {
  if (!userId) return false
  // Déséquipe tout ce qui était équipé
  const { error: errDeq } = await db.from('creatures_utilisateurs')
    .update({ equipee: false })
    .eq('user_id', userId)
    .eq('equipee', true)
  if (errDeq) { console.error('equiperCreature (déséquipement) a échoué :', errDeq); return false }

  const { error: errEq } = await db.from('creatures_utilisateurs')
    .update({ equipee: true })
    .eq('user_id', userId)
    .eq('creature_id', creatureId)
  if (errEq) { console.error('equiperCreature a échoué :', errEq); return false }

  return true
}

/** Déséquipe la créature actuellement active, s'il y en a une. */
export async function deseqiperCreature(userId) {
  if (!userId) return false
  const { error } = await db.from('creatures_utilisateurs')
    .update({ equipee: false })
    .eq('user_id', userId)
    .eq('equipee', true)
  return !error
}

/** Retourne le multiplicateur de production de la créature équipée (1 si aucune). */
export async function chargerMultiplicateurEquipe(userId) {
  if (!userId) return 1
  const { data, error } = await db.from('creatures_utilisateurs')
    .select('creatures(multiplicateur)')
    .eq('user_id', userId)
    .eq('equipee', true)
    .maybeSingle()
  if (error || !data || !data.creatures) return 1
  return Number(data.creatures.multiplicateur) || 1
}


// ===========================================================================
// ===== Administration (super admin) — gestion complète en BDD =====
// ===========================================================================

/** Liste TOUTES les créatures (actives ou non), pour l'admin. */
export async function adminListerCreatures() {
  const { data, error } = await db.from('creatures').select('*').order('rarete').order('nom')
  if (error) { console.error('adminListerCreatures :', error); return [] }
  return data
}

/** Crée ou met à jour une créature (upsert sur id). */
export async function adminSauvegarderCreature(creature) {
  const { error } = await db.from('creatures').upsert(creature, { onConflict: 'id' })
  if (error) { console.error('adminSauvegarderCreature :', error); return { ok: false, error } }
  return { ok: true }
}

/** Active/désactive une créature (n'apparaît plus dans les tirages si inactive). */
export async function adminToggleActifCreature(creatureId, actif) {
  const { error } = await db.from('creatures').update({ actif }).eq('id', creatureId)
  return { ok: !error, error }
}

/** Supprime définitivement une créature (et ses liaisons via ON DELETE CASCADE). */
export async function adminSupprimerCreature(creatureId) {
  const { error } = await db.from('creatures').delete().eq('id', creatureId)
  return { ok: !error, error }
}

/** Liste TOUTES les loot box (actives ou non), pour l'admin. */
export async function adminListerLootBoxes() {
  const { data, error } = await db.from('loot_boxes').select('*').order('ordre')
  if (error) { console.error('adminListerLootBoxes :', error); return [] }
  return data
}

/** Crée ou met à jour une loot box (upsert sur id). */
export async function adminSauvegarderLootBox(lootBox) {
  const { error } = await db.from('loot_boxes').upsert(lootBox, { onConflict: 'id' })
  if (error) { console.error('adminSauvegarderLootBox :', error); return { ok: false, error } }
  return { ok: true }
}

/** Active/désactive une loot box (n'apparaît plus sur la page Loot Box si inactive). */
export async function adminToggleActifLootBox(lootBoxId, actif) {
  const { error } = await db.from('loot_boxes').update({ actif }).eq('id', lootBoxId)
  return { ok: !error, error }
}

/** Supprime définitivement une loot box (et ses liaisons via ON DELETE CASCADE). */
export async function adminSupprimerLootBox(lootBoxId) {
  const { error } = await db.from('loot_boxes').delete().eq('id', lootBoxId)
  return { ok: !error, error }
}

/** Liste les liaisons (creature_id + poids) d'une loot box donnée, pour l'admin. */
export async function adminListerLiaisons(lootBoxId) {
  const { data, error } = await db.from('loot_box_creatures')
    .select('*, creatures(nom, rarete, image)')
    .eq('loot_box_id', lootBoxId)
  if (error) { console.error('adminListerLiaisons :', error); return [] }
  return data
}

/** Ajoute (ou met à jour le poids d') une créature dans une loot box. */
export async function adminAjouterCreatureBox(lootBoxId, creatureId, poids) {
  const { error } = await db.from('loot_box_creatures')
    .upsert({ loot_box_id: lootBoxId, creature_id: creatureId, poids }, { onConflict: 'loot_box_id,creature_id' })
  return { ok: !error, error }
}

/** Retire une créature d'une loot box. */
export async function adminRetirerCreatureBox(lootBoxId, creatureId) {
  const { error } = await db.from('loot_box_creatures')
    .delete()
    .eq('loot_box_id', lootBoxId)
    .eq('creature_id', creatureId)
  return { ok: !error, error }
}
