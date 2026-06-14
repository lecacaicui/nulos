import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

const THEME_KEY = 'theme_couleurs'

// Applique le thème depuis Supabase et met à jour le cache localStorage.
// Le thème est déjà appliqué de façon synchrone par le snippet inline dans <head>
// avant le chargement du module — cette fonction sert uniquement à rafraîchir
// le cache pour les prochaines visites.
export async function appliquerTheme() {
  try {
    const { data, error } = await db.from('theme')
      .select('couleur_fond, couleur_conteneur, couleur_bordure, couleur_bouton')
      .eq('id', 1).single()
    if (!error && data) {
      appliquerCouleurs(data)
      localStorage.setItem(THEME_KEY, JSON.stringify(data))
    }
  } catch (e) {
    console.error('appliquerTheme a échoué :', e)
  }
}

// Applique un jeu de 4 couleurs aux variables CSS, sans toucher à la BDD.
export function appliquerCouleurs({ couleur_fond, couleur_conteneur, couleur_bordure, couleur_bouton }) {
  const racine = document.documentElement.style
  racine.setProperty('--couleur-fond', couleur_fond)
  racine.setProperty('--couleur-conteneur', couleur_conteneur)
  racine.setProperty('--couleur-bordure', couleur_bordure)
  racine.setProperty('--couleur-bouton', couleur_bouton)

  if (estSombre(couleur_fond)) {
    racine.setProperty('--couleur-texte', '#f1f1f1')
    racine.setProperty('--couleur-texte-faible', '#9ca3af')
  } else {
    racine.setProperty('--couleur-texte', '#1a1a1a')
    racine.setProperty('--couleur-texte-faible', '#6b7280')
  }
}

// À appeler dans sauvegarderTheme() (admin) pour vider le cache
// quand le super admin change le thème.
export function invaliderCacheTheme() {
  localStorage.removeItem(THEME_KEY)
}

function estSombre(hex) {
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const luminosite = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminosite < 0.5
}

export async function chargerHeader(base = '') {
  const html = await fetch(base + 'header.html').then(r => r.text())
  document.getElementById('header-placeholder').innerHTML = html

  const username = localStorage.getItem('username')
  const niveau   = localStorage.getItem('niveau')
  const authEl   = document.getElementById('header-auth')

  document.querySelector('.header-logo').setAttribute('href', base + 'index.html')

  const adminLink = document.getElementById('header-admin-link')
  if (niveau === 'admin' || niveau === 'super_admin') {
    adminLink.setAttribute('href', base + 'pages/admin.html')
    adminLink.style.display = 'inline'
  } else {
    adminLink.style.display = 'none'
  }

  if (username && niveau) {
    authEl.innerHTML = `
      <span class="header-username">${username}</span>
      <span class="header-tag tag-${niveau}">${niveau}</span>
      <button class="header-btn header-btn-secondary" id="btn-deco">Se déconnecter</button>
    `
    document.getElementById('btn-deco').addEventListener('click', async () => {
      await db.auth.signOut()
      localStorage.removeItem('username')
      localStorage.removeItem('niveau')
      window.location.href = base + 'index.html'
    })
  } else {
    authEl.innerHTML = `
      <a class="header-btn header-btn-secondary" href="${base}pages/connexion.html">Se connecter</a>
      <a class="header-btn header-btn-primary" href="${base}pages/inscription.html">S'inscrire</a>
    `
  }
}

export async function chargerFooter(base = '') {
  const html = await fetch(base + 'footer.html').then(r => r.text())
  document.getElementById('footer-placeholder').innerHTML = html
}
