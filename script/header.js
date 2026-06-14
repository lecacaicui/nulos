import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

// base : chemin relatif vers la racine du site
// '' si la page est à la racine (index.html), '../' si la page est dans pages/
export async function chargerHeader(base = '') {
  const html = await fetch(base + 'header.html').then(r => r.text())
  document.getElementById('header-placeholder').innerHTML = html

  const username = localStorage.getItem('username')
  const niveau   = localStorage.getItem('niveau')
  const authEl   = document.getElementById('header-auth')

  // Logo -> accueil
  document.querySelector('.header-logo').setAttribute('href', base + 'index.html')

  // Lien Administration, visible uniquement si niveau === 'admin'
  const adminLink = document.getElementById('header-admin-link')
  if (niveau === 'admin') {
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
