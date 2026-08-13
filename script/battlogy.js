import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
export const db = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Schéma attendu côté Supabase :
 *
 * create table battlogy_cartes_utilisateurs (
 *   user_id uuid not null references auth.users(id) on delete cascade,
 *   carte_id text not null,
 *   debloque_le timestamptz not null default now(),
 *   primary key (user_id, carte_id)
 * );
 *
 * create table battlogy_decks (
 *   user_id uuid primary key references auth.users(id) on delete cascade,
 *   cartes jsonb not null default '[]'::jsonb,   -- liste d'id de cartes, doublons permis, ordre libre
 *   mis_a_jour_le timestamptz not null default now()
 * );
 *
 * Penser à activer la RLS sur les deux tables et à restreindre
 * select/insert/update/delete à `user_id = auth.uid()` : chaque joueur ne
 * doit voir et modifier que ses propres cartes/deck.
 *
 * NOTE : les cartes elles-mêmes (stats, coût, etc.) restent en dur dans
 * battlogy.html (objet CARTES) pour l'instant — seule la liste des cartes
 * DÉBLOQUÉES par joueur est en BDD. Migrer les cartes elles-mêmes en BDD
 * est prévu plus tard (avec un système de règles/mécaniques par carte).
 */

// Cartes débloquées d'office pour tout nouveau joueur (voir
// garantirCartesDeDepart). Reprend simplement les cartes existantes
// aujourd'hui, pour ne rien changer à l'expérience actuelle : une future
// carte ajoutée à CARTES ne sera PAS automatiquement débloquée pour tout le
// monde — ça, ce sera le rôle d'une vraie mécanique de progression, à
// construire plus tard.
export const CARTES_DEPART = [
  'guerrier', 'archer', 'squelette', 'magicien', 'golem', 'statue', 'boule_de_feu', 'bombe_a_eau'
]

/** Renvoie l'ensemble (Set) des id de cartes débloquées par l'utilisateur. */
export async function chargerCartesDebloquees(userId) {
  if (!userId) return new Set()
  const { data, error } = await db.from('battlogy_cartes_utilisateurs')
    .select('carte_id')
    .eq('user_id', userId)
  if (error || !data) return new Set()
  return new Set(data.map(l => l.carte_id))
}

/**
 * Débloque une carte pour l'utilisateur si elle ne l'est pas déjà.
 * Idempotent (clé primaire composite user_id + carte_id côté BDD). Pas
 * encore appelée par une vraie mécanique de jeu — prête pour plus tard
 * (récompense, palier de progression, etc.).
 */
export async function debloquerCarte(userId, carteId) {
  if (!userId || !carteId) return
  const { error } = await db.from('battlogy_cartes_utilisateurs')
    .upsert({ user_id: userId, carte_id: carteId }, { onConflict: 'user_id,carte_id', ignoreDuplicates: true })
  if (error) console.error('debloquerCarte a échoué :', error)
}

/**
 * S'assure que le joueur possède au moins les cartes de départ (à appeler
 * une fois au chargement de la page). Ne touche à rien si le joueur a déjà
 * au moins une carte débloquée en BDD — ça ne concerne donc que les tout
 * premiers joueurs sans aucune ligne. Retourne l'ensemble à jour des
 * cartes débloquées.
 */
export async function garantirCartesDeDepart(userId) {
  if (!userId) return new Set()
  const dejaDebloquees = await chargerCartesDebloquees(userId)
  if (dejaDebloquees.size > 0) return dejaDebloquees

  const lignes = CARTES_DEPART.map(carte_id => ({ user_id: userId, carte_id }))
  const { error } = await db.from('battlogy_cartes_utilisateurs').insert(lignes)
  if (error) { console.error('garantirCartesDeDepart a échoué :', error); return dejaDebloquees }
  return new Set(CARTES_DEPART)
}

/** Charge la composition de deck sauvegardée (liste d'id, doublons permis), ou null si aucune. */
export async function chargerDeck(userId) {
  if (!userId) return null
  const { data, error } = await db.from('battlogy_decks')
    .select('cartes')
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !data) return null
  return Array.isArray(data.cartes) ? data.cartes : null
}

/** Sauvegarde (crée ou remplace) la composition de deck de l'utilisateur. */
export async function sauvegarderDeck(userId, liste) {
  if (!userId) return { ok: false }
  const { error } = await db.from('battlogy_decks')
    .upsert({ user_id: userId, cartes: liste, mis_a_jour_le: new Date().toISOString() }, { onConflict: 'user_id' })
  if (error) { console.error('sauvegarderDeck a échoué :', error); return { ok: false, error } }
  return { ok: true }
}
