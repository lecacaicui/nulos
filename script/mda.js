import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Schéma attendu côté Supabase (table `mda_ennemis`) :
 *
 * create table mda_ennemis (
 *   id text primary key,
 *   nom text not null,
 *   image text not null,
 *   pv integer not null,
 *   degats_attaque integer not null,
 *   delai_attaque integer not null default 4,   -- attaque tous les N tours
 *   effet_special text,                          -- théorique pour l'instant,
 *                                                 -- pas encore utilisé en jeu.
 *                                                 -- Plusieurs ennemis pourront
 *                                                 -- partager un même effet, et
 *                                                 -- certains effets seront à
 *                                                 -- terme des combinaisons de
 *                                                 -- deux effets ou plus.
 *   ordre integer not null default 0,
 *   actif boolean not null default true
 * );
 *
 * Penser à activer la RLS et à n'autoriser l'écriture (insert/update/delete)
 * qu'aux comptes super_admin, la lecture étant ouverte à tous.
 */

/** Récupère les ennemis actifs, triés pour l'écran de sélection du joueur. */
export async function chargerEnnemisMDA() {
  const { data, error } = await db.from('mda_ennemis')
    .select('*')
    .eq('actif', true)
    .order('ordre', { ascending: true })
  if (error || !data) return []
  return data
}

/** Liste TOUS les ennemis (actifs ou non), pour l'administration. */
export async function adminListerEnnemisMDA() {
  const { data, error } = await db.from('mda_ennemis').select('*').order('ordre')
  if (error) { console.error('adminListerEnnemisMDA :', error); return [] }
  return data
}

/** Crée ou met à jour un ennemi (upsert sur id). */
export async function adminSauvegarderEnnemiMDA(ennemi) {
  const { error } = await db.from('mda_ennemis').upsert(ennemi, { onConflict: 'id' })
  if (error) { console.error('adminSauvegarderEnnemiMDA :', error); return { ok: false, error } }
  return { ok: true }
}

/** Active/désactive un ennemi (n'apparaît plus dans l'écran de sélection si inactif). */
export async function adminToggleActifEnnemiMDA(id, actif) {
  const { error } = await db.from('mda_ennemis').update({ actif }).eq('id', id)
  return { ok: !error, error }
}

/** Supprime définitivement un ennemi. */
export async function adminSupprimerEnnemiMDA(id) {
  const { error } = await db.from('mda_ennemis').delete().eq('id', id)
  return { ok: !error, error }
}
