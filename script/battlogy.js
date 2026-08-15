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
 * battlogy.html (objet CARTES_SECOURS) tant que la table `battlogy_cartes`
 * est vide/inaccessible — voir chargerCartesJeu plus bas.
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

// ===========================================================================
// ===== Cartes (définitions de jeu) — gestion complète en BDD =============
// ===========================================================================
/**
 * Schéma réel côté Supabase (table `battlogy_cartes`), colonnes typées pour
 * les propriétés de sort/troupe + `options` en réserve pour tout le reste
 * (ex: zoneAttaque/zoneAttaqueHex du Magicien, qui n'ont pas de colonne
 * dédiée) :
 *
 * create table public.battlogy_cartes (
 *   id text not null,
 *   nom text not null,
 *   emoji text null,
 *   cout integer not null,
 *   categorie text not null default 'troupe'::text,
 *   pv integer null,
 *   degats integer null,
 *   porte integer null,
 *   vitesse_attaque numeric null,
 *   vitesse_marche numeric null,
 *   temps_activation integer null,
 *   nombre integer not null default 1,
 *   taille numeric not null default 1,
 *   type_attaque text null,
 *   placement_libre boolean not null default false,
 *   immobile boolean not null default false,
 *   effet_instantane boolean not null default false,
 *   zone_hex numeric null,
 *   degats_chateau_mult numeric null,
 *   repousse numeric null,
 *   actif boolean not null default true,
 *   ordre integer not null default 0,
 *   image text null,
 *   options jsonb not null default '{}'::jsonb,
 *   constraint battlogy_cartes_pkey primary key (id)
 * );
 *
 * Penser à activer la RLS et à n'autoriser l'écriture (insert/update/delete)
 * qu'aux comptes admin/super_admin, la lecture étant ouverte à tous.
 *
 * NOTE : `battlogy_cartes_utilisateurs` (plus haut dans ce fichier) reste
 * inchangée — elle continue de dire quelles cartes CHAQUE joueur a
 * débloquées. Ajouter une carte ici ne la débloque pour personne
 * automatiquement (voir le commentaire sur CARTES_DEPART).
 */

/**
 * Convertit une ligne BDD vers le format attendu par le moteur de jeu (objet
 * CARTES, voir battlogy.html). Lit d'abord les colonnes dédiées
 * (placement_libre, immobile, effet_instantane, zone_hex,
 * degats_chateau_mult, repousse), puis étale `options` par-dessus en
 * dernier : ça laisse `options` disponible pour tout ce qui n'a pas de
 * colonne dédiée (ex: zoneAttaque/zoneAttaqueHex du Magicien), et permet
 * aussi de surcharger ponctuellement une colonne typée si jamais besoin.
 */
function convertirCarteBDD(ligne) {
  return {
    id: ligne.id,
    nom: ligne.nom,
    emoji: ligne.emoji || null,
    image: ligne.image || null,
    cout: ligne.cout,
    pv: ligne.pv,
    degats: ligne.degats,
    porte: ligne.porte,
    vitesseAttaque: Number(ligne.vitesse_attaque),
    vitesseMarche: ligne.vitesse_marche,
    tempsActivation: ligne.temps_activation,
    nombre: ligne.nombre,
    taille: Number(ligne.taille),
    typeAttaque: ligne.type_attaque,
    categorie: ligne.categorie,
    placementLibre: !!ligne.placement_libre,
    immobile: !!ligne.immobile,
    effetInstantane: !!ligne.effet_instantane,
    ...(ligne.zone_hex != null ? { zoneHex: Number(ligne.zone_hex) } : {}),
    ...(ligne.degats_chateau_mult != null ? { degatsChateauMult: Number(ligne.degats_chateau_mult) } : {}),
    ...(ligne.repousse != null ? { repousse: Number(ligne.repousse) } : {}),
    ...(ligne.options || {})
  }
}

/**
 * Charge les cartes actives depuis la BDD, au format attendu par le jeu.
 * Retourne null si la table est vide ou inaccessible, pour laisser
 * battlogy.html se replier sur ses cartes en dur (CARTES_SECOURS).
 */
export async function chargerCartesJeu() {
  const { data, error } = await db.from('battlogy_cartes')
    .select('*')
    .eq('actif', true)
    .order('ordre', { ascending: true })
  if (error || !data || data.length === 0) return null
  const cartes = {}
  data.forEach(ligne => { cartes[ligne.id] = convertirCarteBDD(ligne) })
  return cartes
}

/** Liste TOUTES les cartes (actives ou non), pour l'administration. */
export async function adminListerCartes() {
  const { data, error } = await db.from('battlogy_cartes').select('*').order('ordre')
  if (error) { console.error('adminListerCartes :', error); return [] }
  return data
}

/** Crée ou met à jour une carte (upsert sur id). */
export async function adminSauvegarderCarte(carte) {
  const { error } = await db.from('battlogy_cartes').upsert(carte, { onConflict: 'id' })
  if (error) { console.error('adminSauvegarderCarte :', error); return { ok: false, error } }
  return { ok: true }
}

/** Active/désactive une carte (n'apparaît plus dans le jeu si inactive, sans la supprimer). */
export async function adminToggleActifCarte(id, actif) {
  const { error } = await db.from('battlogy_cartes').update({ actif }).eq('id', id)
  return { ok: !error, error }
}

/** Supprime définitivement une carte. */
export async function adminSupprimerCarte(id) {
  const { error } = await db.from('battlogy_cartes').delete().eq('id', id)
  return { ok: !error, error }
}
