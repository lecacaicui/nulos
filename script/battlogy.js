// ==========================================================================
// BLOBATTLE — logique de jeu
// ==========================================================================
// Voir le commentaire en haut de blobattle.html pour le principe général.
// Résumé :
// - Chaque base (sauf les bases neutres) produit progressivement des blobs,
//   jusqu'à une capacité maximale propre à chaque base (proportionnelle à
//   sa taille) — un fin arc autour de la base indique son remplissage.
// - Cliquer sur une de ses propres bases la sélectionne (halo blanc).
//   Cliquer ensuite sur une autre base envoie la moitié des blobs de la
//   base sélectionnée vers cette base, sous forme d'un groupe qui voyage
//   à vitesse constante.
// - À l'arrivée : si la base cible appartient au même camp, les blobs
//   s'ajoutent. Sinon ils sont soustraits à la défense ; si la défense
//   tombe à 0 ou moins, la base change de camp avec les blobs restants.
// - Partie gagnée quand l'adversaire n'a plus aucune base, perdue quand
//   le joueur n'a plus aucune base.
// - Ce module ne dépend d'aucune API externe (pas de Supabase) : la partie
//   est entièrement locale, contre une IA simple.
// ==========================================================================

const canvas = document.getElementById('blobattle-canvas')
const ctx = canvas.getContext('2d')

const overlay = document.getElementById('blobattle-overlay')
const overlayTitle = document.getElementById('overlay-title')
const overlayText = document.getElementById('overlay-text')
const btnStart = document.getElementById('btn-start')
const btnReset = document.getElementById('btn-reset')

const elStatPlayer = document.getElementById('stat-player')
const elStatEnemy = document.getElementById('stat-enemy')
const elStatBases = document.getElementById('stat-bases')
const elStatTime = document.getElementById('stat-time')

const elMessage = document.getElementById('blobattle-message')

const TEXTE_INTRO = "Conquiers les bases adverses avec tes blobs. Une base produit automatiquement des unités. Sélectionne une base puis une destination pour attaquer."

// ----- Couleurs par camp -----
const COULEURS = {
  player: '#3b82f6',
  enemy: '#ef4444',
  neutral: '#9ca3af'
}

// ----- Paramètres de jeu -----
const NB_BASES = 9
const RAYON_MIN = 26
const RAYON_MAX = 46
const DISTANCE_MIN_ENTRE_BASES = 120
const MARGE_CARTE = 60
const VITESSE_ENVOI = 90            // px/seconde pour les groupes de blobs en transit
const PRODUCTION_PAR_RAYON = 0.09   // blobs/seconde par pixel de rayon (bases joueur/ennemi uniquement)
const CAPACITE_PAR_RAYON = 2.5      // capacité max = rayon * ce facteur (~65 à ~115 selon la base)
const UNITS_DEPART_JOUEUR = 12
const UNITS_DEPART_ENNEMI = 12
const UNITS_MIN_POUR_ATTAQUER = 2
const DELAI_IA_MS = 1400

// ----- État de la partie -----
let bases = []
let envois = []            // groupes de blobs en transit
let baseSelectionnee = null
let pointeur = null        // position souris, pour la ligne de visée
let etat = 'menu'          // 'menu' | 'jeu' | 'fini'
let tempsEcoule = 0
let dernierTimestamp = 0
let idAnimation = null
let prochaineActionIA = 0
let messageTimeoutId = null

// ==========================================================================
// Génération de la carte
// ==========================================================================

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function genererBases() {
  const rect = canvas.getBoundingClientRect()
  const largeur = rect.width
  const hauteur = rect.height

  const positions = []
  let tentatives = 0

  while (positions.length < NB_BASES && tentatives < 3000) {
    tentatives++
    const candidate = {
      x: MARGE_CARTE + Math.random() * (largeur - MARGE_CARTE * 2),
      y: MARGE_CARTE + Math.random() * (hauteur - MARGE_CARTE * 2),
      r: RAYON_MIN + Math.random() * (RAYON_MAX - RAYON_MIN)
    }
    const tropProche = positions.some(p => distance(p, candidate) < DISTANCE_MIN_ENTRE_BASES)
    if (!tropProche) positions.push(candidate)
  }

  // La base la plus à gauche revient au joueur, la plus à droite à l'IA :
  // ça garantit un point de départ symétrique quel que soit le tirage.
  positions.sort((a, b) => a.x - b.x)

  return positions.map((p, i) => {
    let owner = 'neutral'
    let units = Math.floor(3 + Math.random() * 6)

    if (i === 0) { owner = 'player'; units = UNITS_DEPART_JOUEUR }
    else if (i === positions.length - 1) { owner = 'enemy'; units = UNITS_DEPART_ENNEMI }

    return {
      id: i,
      x: p.x,
      y: p.y,
      r: p.r,
      owner,
      units,
      capacite: Math.round(p.r * CAPACITE_PAR_RAYON),
      production: PRODUCTION_PAR_RAYON * p.r
    }
  })
}

// ==========================================================================
// Entrées (clic / tactile / survol)
// ==========================================================================

function coordonneesCanvas(evt) {
  const rect = canvas.getBoundingClientRect()
  let clientX, clientY
  if (evt.changedTouches && evt.changedTouches.length) {
    clientX = evt.changedTouches[0].clientX
    clientY = evt.changedTouches[0].clientY
  } else {
    clientX = evt.clientX
    clientY = evt.clientY
  }
  return { x: clientX - rect.left, y: clientY - rect.top }
}

function baseSousCurseur(pos) {
  for (const base of bases) {
    if (distance(base, pos) <= base.r) return base
  }
  return null
}

function gererClic(evt) {
  if (etat !== 'jeu') return
  const pos = coordonneesCanvas(evt)
  const base = baseSousCurseur(pos)

  if (!base) { baseSelectionnee = null; return }

  if (!baseSelectionnee) {
    if (base.owner !== 'player') {
      afficherMessage("Sélectionne d'abord une de tes bases (🟦).")
      return
    }
    if (Math.floor(base.units) < UNITS_MIN_POUR_ATTAQUER) {
      afficherMessage('Cette base doit avoir au moins 2 blobs pour attaquer.')
      return
    }
    baseSelectionnee = base
    return
  }

  if (base === baseSelectionnee) {
    baseSelectionnee = null
    return
  }

  envoyerBlobs(baseSelectionnee, base)
  baseSelectionnee = null
}

canvas.addEventListener('click', gererClic)
canvas.addEventListener('touchend', (evt) => { evt.preventDefault(); gererClic(evt) }, { passive: false })
canvas.addEventListener('mousemove', (evt) => { pointeur = coordonneesCanvas(evt) })
canvas.addEventListener('mouseleave', () => { pointeur = null })

// ==========================================================================
// Envoi de blobs & combat
// ==========================================================================

function envoyerBlobs(source, cible) {
  const quantite = Math.floor(source.units / 2)
  if (quantite < 1) return

  source.units -= quantite
  envois.push({
    x: source.x,
    y: source.y,
    versId: cible.id,
    proprietaire: source.owner,
    quantite
  })
}

function mettreAJourEnvois(dt) {
  for (let i = envois.length - 1; i >= 0; i--) {
    const e = envois[i]
    const cible = bases[e.versId]
    const dx = cible.x - e.x
    const dy = cible.y - e.y
    const dist = Math.hypot(dx, dy)
    const pas = VITESSE_ENVOI * dt

    if (dist <= pas) {
      appliquerArrivee(e, cible)
      envois.splice(i, 1)
      continue
    }

    e.x += (dx / dist) * pas
    e.y += (dy / dist) * pas
  }
}

function appliquerArrivee(envoi, cible) {
  if (cible.owner === envoi.proprietaire) {
    cible.units += envoi.quantite
    return
  }

  cible.units -= envoi.quantite
  if (cible.units < 0) {
    cible.owner = envoi.proprietaire
    cible.units = -cible.units
  }
}

// ==========================================================================
// Production automatique
// ==========================================================================

function mettreAJourProduction(dt) {
  for (const base of bases) {
    if (base.owner === 'neutral') continue
    if (base.units >= base.capacite) continue
    base.units = Math.min(base.capacite, base.units + base.production * dt)
  }
}

// ==========================================================================
// IA adverse
// ==========================================================================

function jouerIA(maintenant) {
  if (maintenant < prochaineActionIA) return
  prochaineActionIA = maintenant + DELAI_IA_MS + Math.random() * 800

  const basesIA = bases.filter(b => b.owner === 'enemy' && b.units >= 4)
  if (basesIA.length === 0) return

  const source = basesIA.reduce((max, b) => (b.units > max.units ? b : max), basesIA[0])
  const ciblesPossibles = bases.filter(b => b.owner !== 'enemy')
  if (ciblesPossibles.length === 0) return

  // Score bas = cible intéressante : peu défendue et proche.
  let meilleureCible = null
  let meilleurScore = Infinity
  for (const cible of ciblesPossibles) {
    const score = cible.units + distance(source, cible) * 0.05
    if (score < meilleurScore) { meilleurScore = score; meilleureCible = cible }
  }
  if (!meilleureCible) return

  // Évite les attaques suicidaires : n'envoie que si l'avantage est net.
  if (Math.floor(source.units / 2) <= meilleureCible.units + 1) return

  envoyerBlobs(source, meilleureCible)
}

// ==========================================================================
// Rendu
// ==========================================================================

function redimensionnerCanvas() {
  const rect = canvas.getBoundingClientRect()
  const ratio = window.devicePixelRatio || 1
  canvas.width = Math.round(rect.width * ratio)
  canvas.height = Math.round(rect.height * ratio)
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
  if (etat !== 'menu') dessiner()
}

window.addEventListener('resize', redimensionnerCanvas)

function dessiner() {
  const rect = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)

  if (baseSelectionnee && pointeur) {
    ctx.beginPath()
    ctx.moveTo(baseSelectionnee.x, baseSelectionnee.y)
    ctx.lineTo(pointeur.x, pointeur.y)
    ctx.setLineDash([6, 6])
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.setLineDash([])
  }

  for (const base of bases) dessinerBase(base)
  for (const envoi of envois) dessinerEnvoi(envoi)
}

function dessinerBase(base) {
  ctx.beginPath()
  ctx.arc(base.x, base.y, base.r, 0, Math.PI * 2)
  ctx.fillStyle = COULEURS[base.owner]
  ctx.globalAlpha = base.owner === 'neutral' ? 0.55 : 0.9
  ctx.fill()
  ctx.globalAlpha = 1

  // Jauge de remplissage vers la capacité max (bases jouées uniquement :
  // les bases neutres ne produisent pas, la capacité n'y est pas visible).
  if (base.owner !== 'neutral') {
    const rempli = Math.min(1, base.units / base.capacite)
    ctx.beginPath()
    ctx.arc(base.x, base.y, base.r + 4, -Math.PI / 2, -Math.PI / 2 + rempli * Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  if (base === baseSelectionnee) {
    ctx.beginPath()
    ctx.arc(base.x, base.y, base.r + 9, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 3
    ctx.stroke()
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 15px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(Math.floor(base.units)), base.x, base.y)
}

function dessinerEnvoi(envoi) {
  ctx.beginPath()
  ctx.arc(envoi.x, envoi.y, 9, 0, Math.PI * 2)
  ctx.fillStyle = COULEURS[envoi.proprietaire]
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 10px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(String(envoi.quantite), envoi.x, envoi.y)
}

// ==========================================================================
// Statistiques & message
// ==========================================================================

function mettreAJourStats() {
  let unitsJoueur = 0
  let unitsEnnemi = 0
  let basesJoueur = 0

  for (const b of bases) {
    if (b.owner === 'player') { unitsJoueur += b.units; basesJoueur++ }
    else if (b.owner === 'enemy') unitsEnnemi += b.units
  }
  for (const e of envois) {
    if (e.proprietaire === 'player') unitsJoueur += e.quantite
    else unitsEnnemi += e.quantite
  }

  elStatPlayer.textContent = Math.floor(unitsJoueur)
  elStatEnemy.textContent = Math.floor(unitsEnnemi)
  elStatBases.textContent = basesJoueur

  const secondes = Math.floor(tempsEcoule)
  const mm = String(Math.floor(secondes / 60)).padStart(2, '0')
  const ss = String(secondes % 60).padStart(2, '0')
  elStatTime.textContent = `${mm}:${ss}`
}

function afficherMessage(texte) {
  elMessage.textContent = texte
  elMessage.classList.add('visible')
  clearTimeout(messageTimeoutId)
  messageTimeoutId = setTimeout(() => elMessage.classList.remove('visible'), 1800)
}

// ==========================================================================
// Fin de partie
// ==========================================================================

function verifierFinDePartie() {
  const basesJoueur = bases.filter(b => b.owner === 'player').length
  const basesEnnemi = bases.filter(b => b.owner === 'enemy').length

  if (basesJoueur === 0) { terminerPartie(false); return true }
  if (basesEnnemi === 0) { terminerPartie(true); return true }
  return false
}

function terminerPartie(victoire) {
  etat = 'fini'
  cancelAnimationFrame(idAnimation)

  overlayTitle.textContent = victoire ? '🎉 Victoire !' : '💀 Défaite'
  overlayText.textContent = victoire
    ? `Toutes les bases adverses sont tombées en ${elStatTime.textContent}.`
    : "L'adversaire a conquis toutes tes bases. Retente ta chance !"
  btnStart.textContent = 'Rejouer'
  overlay.classList.remove('cachee')
}

// ==========================================================================
// Boucle de jeu
// ==========================================================================

function boucle(timestamp) {
  if (etat !== 'jeu') return

  const dt = dernierTimestamp ? (timestamp - dernierTimestamp) / 1000 : 0
  dernierTimestamp = timestamp
  tempsEcoule += dt

  mettreAJourProduction(dt)
  mettreAJourEnvois(dt)
  jouerIA(timestamp)
  mettreAJourStats()
  dessiner()

  if (!verifierFinDePartie()) {
    idAnimation = requestAnimationFrame(boucle)
  }
}

// ==========================================================================
// Démarrage / réinitialisation
// ==========================================================================

function demarrerPartie() {
  redimensionnerCanvas()
  bases = genererBases()
  envois = []
  baseSelectionnee = null
  tempsEcoule = 0
  dernierTimestamp = 0
  prochaineActionIA = 0
  etat = 'jeu'

  overlay.classList.add('cachee')
  mettreAJourStats()

  idAnimation = requestAnimationFrame(boucle)
}

function reinitialiser() {
  cancelAnimationFrame(idAnimation)
  etat = 'menu'
  bases = []
  envois = []
  baseSelectionnee = null
  tempsEcoule = 0

  overlayTitle.textContent = 'Blobattle'
  overlayText.textContent = TEXTE_INTRO
  btnStart.textContent = 'Lancer la partie'
  overlay.classList.remove('cachee')

  elStatPlayer.textContent = '0'
  elStatEnemy.textContent = '0'
  elStatBases.textContent = '0'
  elStatTime.textContent = '00:00'

  const rect = canvas.getBoundingClientRect()
  ctx.clearRect(0, 0, rect.width, rect.height)
}

btnStart.addEventListener('click', demarrerPartie)
btnReset.addEventListener('click', reinitialiser)

// Prépare le canvas dès le chargement du module (avant tout clic sur "Lancer").
redimensionnerCanvas()
