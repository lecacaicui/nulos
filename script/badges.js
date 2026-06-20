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

// Récupère, pour l'utilisateur donné, un Map badge_id -> date d'obtention (string ISO).
export async function chargerBadgesUtilisateur(userId) {
  if (!userId) return new Map()
  const { data, error } = await db.from('badges_utilisateurs')
    .select('badge_id, obtenu_le')
    .eq('user_id', userId)
  if (error || !data) return new Map()
  return new Map(data.map(b => [b.badge_id, b.obtenu_le]))
}

// Calcule le taux d'obtention (en %) de chaque badge, parmi les comptes
// qui ne sont PAS super_admin. Retourne un objet { badge_id: pourcentage }.
export async function chargerTauxObtention() {
  const resultat = {}

  // 1) Liste des user_id à compter : tous les profils sauf super_admin.
  const { data: profils, error: errProfils } = await db.from('profils')
    .select('user_id')
    .neq('niveau', 'super_admin')
  if (errProfils || !profils) return resultat

  const idsValides = new Set(profils.map(p => p.user_id))
  const totalComptes = idsValides.size
  if (totalComptes === 0) return resultat

  // 2) Tous les badges obtenus, qu'on filtre ensuite côté client sur idsValides
  //    (évite une jointure complexe ; le volume reste raisonnable pour ce site).
  const { data: obtentions, error: errObtentions } = await db.from('badges_utilisateurs')
    .select('badge_id, user_id')
  if (errObtentions || !obtentions) return resultat

  const compteurs = {}
  for (const o of obtentions) {
    if (!idsValides.has(o.user_id)) continue
    compteurs[o.badge_id] = (compteurs[o.badge_id] ?? 0) + 1
  }

  for (const b of BADGES) {
    const nb = compteurs[b.id] ?? 0
    resultat[b.id] = Math.round((nb / totalComptes) * 100)
  }

  return resultat
}

// Débloque un badge pour l'utilisateur s'il ne l'a pas déjà.
// Idempotent : peut être appelée plusieurs fois sans créer de doublon
// (clé primaire composite user_id + badge_id côté BDD).
export async function debloquerBadge(userId, badgeId) {
  if (!userId || !badgeId) return
  const { error } = await db.from('badges_utilisateurs')
    .upsert({ user_id: userId, badge_id: badgeId }, { onConflict: 'user_id,badge_id', ignoreDuplicates: true })
  if (error) console.error('debloquerBadge a échoué :', error)
}
