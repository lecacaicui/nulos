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
 *   invite_user_id uuid references auth.users(id) on delete set null,
 *   invite_username text,
 *   statut text not null default 'en_attente' check (statut in ('en_attente', 'en_cours', 'termine')),
 *   cree_le timestamptz not null default now()
 * );
 *
 * RLS : lecture ouverte à tous les connectés, écriture directe (insert/
 * update/delete) réservée à l'hôte. L'invité rejoint/quitte uniquement via
 * les fonctions rejoindre_lobby / quitter_lobby (SECURITY DEFINER), voir
 * migration_lobbies_2_rejoindre.sql.
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
 *
 * Supprime d'abord tout ancien lobby « en_attente » appartenant à ce même
 * utilisateur : ça nettoie les lobbies orphelins laissés par un
 * rechargement/fermeture de page qui n'a pas pu passer par annulerLobby.
 */
export async function creerLobby(userId, username, tentativesRestantes = 5) {
  await db.from('battlogy_lobbies').delete()
    .eq('hote_user_id', userId).eq('statut', 'en_attente')

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

/**
 * Rejoint un lobby existant à partir de son code (passe par une fonction
 * BDD sécurisée, voir migration_lobbies_2_rejoindre.sql). Retourne
 * { ok, lobby } ou { ok: false, error } (introuvable / déjà complet /
 * propre lobby...).
 */
export async function rejoindreLobby(code, username) {
  const { data, error } = await db.rpc('rejoindre_lobby', { p_code: code, p_username: username })
  if (error) { console.error('rejoindreLobby a échoué :', error); return { ok: false, error } }
  return { ok: true, lobby: data }
}

/** Quitte un lobby précédemment rejoint (libère la place d'invité). */
export async function quitterLobby(lobbyId) {
  const { error } = await db.rpc('quitter_lobby', { p_lobby_id: lobbyId })
  return { ok: !error, error }
}

/**
 * Écoute en temps réel les changements d'un lobby précis (arrivée/départ
 * de l'invité, annulation par l'hôte...). `onChange` est appelé avec la
 * ligne à jour, ou `null` si le lobby a été supprimé.
 * Retourne une fonction à appeler pour arrêter l'écoute — à ne pas
 * oublier : chaque abonnement actif consomme le quota Realtime du projet.
 */
export function ecouterLobby(lobbyId, onChange) {
  const canal = db.channel('lobby-' + lobbyId)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'battlogy_lobbies', filter: `id=eq.${lobbyId}` },
      (payload) => onChange(payload.new))
    .on('postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'battlogy_lobbies', filter: `id=eq.${lobbyId}` },
      () => onChange(null))
    .subscribe()

  return () => db.removeChannel(canal)
}

/** Jeton d'accès de la session en cours, nécessaire pour quitterLobbyBeacon
 * (appelée hors du cycle de vie normal de la page, donc sans pouvoir
 * attendre un appel asynchrone classique). */
export async function recupererJetonAcces() {
  const { data } = await db.auth.getSession()
  return data?.session?.access_token ?? null
}

/**
 * Version « best-effort » de annulerLobby/quitterLobby, pensée pour un
 * handler `pagehide` (fermeture d'onglet ou rechargement) : une requête
 * fetch classique risque de ne pas avoir le temps d'aboutir une fois la
 * page en train de se décharger, donc on utilise `keepalive` pour que le
 * navigateur termine la requête même après le déchargement.
 * Ce n'est pas garanti à 100 % (selon navigateur/OS), mais couvre la
 * grande majorité des cas de fermeture/rechargement normaux.
 */
export function quitterLobbyBeacon(lobbyId, accessToken, role) {
  if (!lobbyId || !accessToken) return
  const headers = {
    apikey: SUPABASE_KEY,
    Authorization: 'Bearer ' + accessToken,
    'Content-Type': 'application/json'
  }
  if (role === 'hote') {
    fetch(`${SUPABASE_URL}/rest/v1/battlogy_lobbies?id=eq.${lobbyId}`, {
      method: 'DELETE', headers, keepalive: true
    }).catch(() => {})
  } else {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/quitter_lobby`, {
      method: 'POST', headers, keepalive: true,
      body: JSON.stringify({ p_lobby_id: lobbyId })
    }).catch(() => {})
  }
}

/**
 * Version « best-effort » pour signaler un ABANDON en cours de partie JcJ
 * (fermeture d'onglet ou rechargement pendant le combat lui-même — pas la
 * salle d'attente, voir quitterLobbyBeacon plus haut pour ce cas-là).
 *
 * Contrairement à envoyerEvenementPartie (qui passe par le canal WebSocket
 * déjà ouvert, non garanti de finir d'émettre pendant un déchargement de
 * page), celle-ci passe par l'API REST de diffusion Realtime de Supabase
 * avec `keepalive`, pour les mêmes raisons que quitterLobbyBeacon : une
 * requête fetch classique risque de ne pas avoir le temps d'aboutir une
 * fois la page en train de se décharger.
 *
 * `role` indique qui abandonne ('hote' ou 'invite') — voir surAbandon dans
 * ouvrirCanalPartie côté receveur (battlogy.html), qui décide qui gagne
 * par forfait selon ce rôle.
 */
export function envoyerAbandonBeacon(lobbyId, accessToken, role) {
  if (!lobbyId || !accessToken) return
  fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    keepalive: true,
    body: JSON.stringify({
      messages: [{ topic: 'partie-' + lobbyId, event: 'abandon', payload: { role }, private: false }]
    })
  }).catch(() => {})
}

// ═══════════════════════════════════════════════════════════════════════
// ═══ Partie JcJ (Joueur contre Joueur) ═══════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
//
// Modèle retenu : l'HÔTE fait tourner l'unique simulation du combat (les
// deux camps) — comme aujourd'hui contre le bot, seul le pool de spawn
// change (de aléatoire à piloté par les coups de l'invité). C'est la seule
// source de vérité : aucun risque que les deux écrans se contredisent sur
// l'issue de la partie. L'invité, lui, ne simule rien : il affiche les
// instantanés reçus de l'hôte et lui envoie ses coups. Chacun gère sa
// propre main/or en local (aucune latence réseau sur les actions du
// joueur), voir battlogy.html.
//
// Deux canaux Realtime distincts :
// - `lobby-<id>` (ecouterLobby ci-dessus) : la ligne BDD du lobby, pour la
//   salle d'attente (arrivée/départ de l'invité, annulation…).
// - `partie-<id>` (ci-dessous) : un canal "broadcast" pur (rien en BDD),
//   pour les messages haute fréquence de la partie elle-même (coups joués,
//   instantanés d'état, résultat final).

/**
 * Démarre la partie JcJ d'un lobby : passe son statut à 'en_cours'. Les
 * deux joueurs, abonnés via ecouterLobby, reçoivent la mise à jour et
 * démarrent chacun leur côté de la partie (voir battlogy.html). Seul
 * l'hôte doit appeler cette fonction (le bouton "Lancer la partie" n'est
 * affiché qu'à lui, côté salle d'attente, et seulement une fois l'invité
 * présent).
 */
export async function demarrerPartieLobby(lobbyId) {
  const { error } = await db.from('battlogy_lobbies')
    .update({ statut: 'en_cours' })
    .eq('id', lobbyId)
  return { ok: !error, error }
}

/**
 * Ouvre le canal Realtime "broadcast" dédié au déroulement d'une partie
 * JcJ précise. `gestionnaires` accepte, chacun optionnel :
 * - surCoupJoue(payload)  : un coup envoyé par l'autre joueur (host <- invité).
 * - surEtat(payload)      : un instantané de l'état du combat (invité <- hôte).
 * - surFinPartie(payload) : le résultat final (invité <- hôte).
 * - surCapaciteActivee(payload) : activation d'une capacité de troupe
 *   (ex: soin du Holy Dummy), host <- invité — même principe que
 *   surCoupJoue, voir recevoirCapaciteInvite dans battlogy.html.
 * Retourne le canal — à garder pour envoyerEvenementPartie et à fermer
 * avec fermerCanalPartie une fois la partie terminée/quittée.
 */
export function ouvrirCanalPartie(lobbyId, gestionnaires = {}) {
  const canal = db.channel('partie-' + lobbyId)
  if (gestionnaires.surCoupJoue)  canal.on('broadcast', { event: 'coup_joue' },  ({ payload }) => gestionnaires.surCoupJoue(payload))
  if (gestionnaires.surEtat)      canal.on('broadcast', { event: 'etat' },       ({ payload }) => gestionnaires.surEtat(payload))
  if (gestionnaires.surFinPartie) canal.on('broadcast', { event: 'fin_partie' }, ({ payload }) => gestionnaires.surFinPartie(payload))
  if (gestionnaires.surAbandon)   canal.on('broadcast', { event: 'abandon' },    ({ payload }) => gestionnaires.surAbandon(payload))
  if (gestionnaires.surCapaciteActivee) canal.on('broadcast', { event: 'capacite_activee' }, ({ payload }) => gestionnaires.surCapaciteActivee(payload))
  canal.subscribe()
  return canal
}

/** Envoie un évènement broadcast sur le canal de partie (voir ouvrirCanalPartie). */
export function envoyerEvenementPartie(canal, event, payload) {
  if (!canal) return
  canal.send({ type: 'broadcast', event, payload })
}

/** Ferme le canal de partie — à appeler en quittant/terminant la partie JcJ. */
export function fermerCanalPartie(canal) {
  if (canal) db.removeChannel(canal)
}
