import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
export const db = createClient(SUPABASE_URL, SUPABASE_KEY)

/**
 * Schéma attendu côté Supabase (table `battlogy_lobbies`), voir
 * migration_lobbies.sql :
 *
 * create table battlogy_lobbies (
 *   id uuid primary key default gen_random_uuid(),
 *   code text not null unique,
 *   hote_user_id uuid not null references auth.users(id) on delete cascade,
 *   hote_username text not null,
 *   statut text not null default 'en_attente' check (statut in ('en_attente', 'en_cours', 'termine')),
 *   cree_le timestamptz not null default now()
 * );
 *
 * RLS : lecture ouverte à tous les connectés, écriture (insert/update/delete)
 * réservée à l'hôte (auth.uid() = hote_user_id).
 */

// Caractères utilisés pour le code du lobby : lettres/chiffres sans les
// caractères ambigus à l'oral/à l'écrit (0/O, 1/I/L).
const CARACTERES_CODE = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function genererCodeLobby(longueur = 5) {
  let code = ''
  for (let i = 0; i < longueur; i++) {
    code += CARACTERES_CODE[Math.floor(Math.random() * CARACTERES_CODE.length)]
  }
  return code
}

/**
 * Crée un lobby pour l'utilisateur donné et retourne { ok, lobby } (ou
 * { ok: false, error }). En cas de collision de code (contrainte unique),
 * réessaie automatiquement avec un nouveau code.
 */
export async function creerLobby(userId, username, tentativesRestantes = 5) {
  const code = genererCodeLobby()
  const { data, error } = await db.from('battlogy_lobbies')
    .insert([{ code, hote_user_id: userId, hote_username: username }])
    .select()
    .single()

  if (error) {
    if (error.code === '23505' && tentativesRestantes > 0) {
      return creerLobby(userId, username, tentativesRestantes - 1)
    }
    console.error('creerLobby a échoué :', error)
    return { ok: false, error }
  }

  return { ok: true, lobby: data }
}

/** Annule (supprime) un lobby — à appeler quand l'hôte ferme la fenêtre d'attente. */
export async function annulerLobby(lobbyId) {
  const { error } = await db.from('battlogy_lobbies').delete().eq('id', lobbyId)
  return { ok: !error, error }
}
