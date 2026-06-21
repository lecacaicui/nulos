import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Schéma attendu côté Supabase (table `annonces`) :
 *
 * create table annonces (
 *   id uuid primary key default gen_random_uuid(),
 *   titre text not null,
 *   contenu text not null,
 *   auteur_username text not null,
 *   date_creation timestamptz not null default now(),
 *   date_publication timestamptz not null default now()
 * );
 *
 * `date_creation` n'est posée qu'à l'insertion (jamais modifiée ensuite).
 * `date_publication` est remise à jour à chaque sauvegarde (création OU
 * modification), pour refléter la dernière fois où l'annonce a été publiée.
 *
 * Penser à activer la RLS et à n'autoriser l'écriture (insert/update/delete)
 * qu'aux comptes admin/super_admin, la lecture étant ouverte à tous.
 */

/** Récupère les annonces visibles sur l'accueil, les plus récentes en premier. */
export async function chargerAnnonces() {
  const { data, error } = await db.from('annonces')
    .select('*')
    .order('date_publication', { ascending: false })
  if (error || !data) return []
  return data
}

/** Liste complète des annonces pour l'administration (identique à chargerAnnonces, séparé pour la clarté). */
export async function adminListerAnnonces() {
  const { data, error } = await db.from('annonces')
    .select('*')
    .order('date_publication', { ascending: false })
  if (error) { console.error('adminListerAnnonces :', error); return [] }
  return data
}

/**
 * Crée ou met à jour une annonce.
 * - Création (pas d'id) : date_creation ET date_publication posées à maintenant.
 * - Modification (id fourni) : date_creation conservée, date_publication remise à maintenant.
 */
export async function adminSauvegarderAnnonce({ id, titre, contenu, auteur_username }) {
  const maintenant = new Date().toISOString()

  if (!id) {
    const { error } = await db.from('annonces').insert([{
      titre, contenu, auteur_username,
      date_creation: maintenant,
      date_publication: maintenant
    }])
    if (error) { console.error('adminSauvegarderAnnonce (création) :', error); return { ok: false, error } }
    return { ok: true }
  }

  const { error } = await db.from('annonces')
    .update({ titre, contenu, auteur_username, date_publication: maintenant })
    .eq('id', id)
  if (error) { console.error('adminSauvegarderAnnonce (modification) :', error); return { ok: false, error } }
  return { ok: true }
}

/** Supprime définitivement une annonce. */
export async function adminSupprimerAnnonce(id) {
  const { error } = await db.from('annonces').delete().eq('id', id)
  return { ok: !error, error }
}
