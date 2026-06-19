import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// Liste des badges du site, dans l'ordre d'affichage souhaité sur le profil.
// `image` = nom de fichier dans le dossier /pictures/ (à uploader, voir migration.sql).
export const BADGES = [
  {
    id: 'demineur_facile',
    image: 'badgedemineur3.png',
    titre: 'Démineur — Facile',
    description: "Gagner une partie de Démineur en niveau Facile."
  },
  {
    id: 'demineur_moyen',
    image: 'badgedemineur2.png',
    titre: 'Démineur — Moyen',
    description: "Gagner une partie de Démineur en niveau Moyen."
  },
  {
    id: 'demineur_difficile',
    image: 'badgedemineur1.png',
    titre: 'Démineur — Difficile',
    description: "Gagner une partie de Démineur en niveau Difficile."
  },
  {
    id: 'clicker_1m',
    image: 'badgepascontent1m.png',
    titre: 'Clicker — 1 million',
    description: "Produire 1 000 000 de pièces au total dans le Clicker."
  },
  {
    id: 'clicker_10m',
    image: 'badgepascontent10m.png',
    titre: 'Clicker — 10 millions',
    description: "Produire 10 000 000 de pièces au total dans le Clicker."
  },
  {
    id: 'clicker_100m',
    image: 'badgepascontent100m.png',
    titre: 'Clicker — 100 millions',
    description: "Produire 100 000 000 de pièces au total dans le Clicker."
  }
]

// Débloque un badge pour l'utilisateur s'il ne l'a pas déjà.
// Idempotent : peut être appelée plusieurs fois sans créer de doublon
// (clé primaire composite user_id + badge_id côté BDD).
export async function debloquerBadge(userId, badgeId) {
  if (!userId || !badgeId) return
  const { error } = await db.from('badges_utilisateurs')
    .upsert({ user_id: userId, badge_id: badgeId }, { onConflict: 'user_id,badge_id', ignoreDuplicates: true })
  if (error) console.error('debloquerBadge a échoué :', error)
}

// Récupère l'ensemble des badge_id déjà obtenus par l'utilisateur.
export async function chargerBadgesUtilisateur(userId) {
  if (!userId) return new Set()
  const { data, error } = await db.from('badges_utilisateurs')
    .select('badge_id')
    .eq('user_id', userId)
  if (error || !data) return new Set()
  return new Set(data.map(b => b.badge_id))
}
