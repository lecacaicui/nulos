import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = 'https://uqjciekcfrxscfwztttt.supabase.co'
const SUPABASE_KEY = 'sb_publishable_Ly-L4hecBE_r-k4qd5zTkQ_VmaKUASz'
const db = createClient(SUPABASE_URL, SUPABASE_KEY)

export async function chargerHeader() {
  const html = await fetch('header.html').then(r => r.text())
  document.getElementById('header-placeholder').innerHTML = html

  const username = localStorage.getItem('username')
  const niveau   = localStorage.getItem('niveau')
  const authEl   = document.getElementById('header-auth')

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
      window.location.href = 'index.html'
    })
  } else {
    authEl.innerHTML = `
      <a class="header-btn header-btn-secondary" href="connexion.html">Se connecter</a>
      <a class="header-btn header-btn-primary" href="inscription.html">S'inscrire</a>
    `
  }
}

export async function chargerFooter() {
  const html = await fetch('footer.html').then(r => r.text())
  document.getElementById('footer-placeholder').innerHTML = html
}
