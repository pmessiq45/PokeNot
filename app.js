/* ==========================================================================
   STATE MANAGEMENT & GLOBAL CONFIG
   ========================================================================== */
const GOOGLE_CLIENT_ID = "SEU_CLIENT_ID_DO_GOOGLE.apps.googleusercontent.com"; // Insira aqui seu Client ID real do Google Cloud Console

// Credenciais do Firebase Firestore (Insira aqui as chaves do seu projeto Firebase)
const firebaseConfig = {
  apiKey: "AIzaSyB9_0Hcf9mNyj075ZfXkP6kPlHOSJBVfHI",
  authDomain: "pokenot-db.firebaseapp.com",
  projectId: "pokenot-db",
  storageBucket: "pokenot-db.firebasestorage.app",
  messagingSenderId: "606255297926",
  appId: "1:606255297926:web:ee0b18d9afdabba6c3e807"
};

// Detecção de status de banco de dados
let db = null;
let isFirebaseActive = false;

// Inicializa a conexão com o Firebase Firestore se configurado
function initFirebase() {
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    try {
      firebase.initializeApp(firebaseConfig);
      db = firebase.firestore();
      isFirebaseActive = true;
      console.log("Firebase Firestore ativado com sucesso!");
    } catch (e) {
      console.error("Erro ao conectar no Firebase Firestore:", e);
    }
  } else {
    console.log("Firebase não configurado. Operando em Modo Local (localStorage).");
  }
  updateDbStatusUI();
}

// Atualiza os indicadores de conexão na tela
function updateDbStatusUI() {
  const headerBadge = document.getElementById("header-db-status");
  const loginBadge = document.querySelector("#login-db-status span");
  
  const bgClass = isFirebaseActive ? "online" : "offline";
  const icon = isFirebaseActive ? "fa-solid fa-cloud" : "fa-solid fa-cloud-sun";
  const text = isFirebaseActive ? "Nuvem Ativa" : "Modo Local";
  
  if (headerBadge) {
    headerBadge.className = `db-status-badge ${bgClass}`;
    headerBadge.innerHTML = `<i class="${icon}"></i> ${text}`;
  }
  
  if (loginBadge) {
    loginBadge.className = bgClass;
    loginBadge.innerHTML = `<i class="${icon}"></i> ${text}`;
  }
}

// --- Funções Auxiliares de Abstração do Banco de Dados ---

// Busca usuários cadastrados
async function dbGetUsers() {
  if (isFirebaseActive) {
    try {
      const snapshot = await db.collection("users").get();
      const users = {};
      snapshot.forEach(doc => {
        users[doc.id] = doc.data();
      });
      return users;
    } catch (e) {
      console.error("Erro ao buscar usuários do Firestore:", e);
    }
  }
  return JSON.parse(localStorage.getItem("pokenot_users")) || {};
}

// Salva um usuário
async function dbSaveUser(username, userData) {
  if (isFirebaseActive) {
    try {
      await db.collection("users").doc(username).set(userData);
      return;
    } catch (e) {
      console.error("Erro ao salvar usuário no Firestore:", e);
    }
  }
  const users = JSON.parse(localStorage.getItem("pokenot_users")) || {};
  users[username] = userData;
  localStorage.setItem("pokenot_users", JSON.stringify(users));
}

// Busca propostas de trocas do mercado
async function dbGetMarketTrades() {
  if (isFirebaseActive) {
    try {
      const snapshot = await db.collection("trades").get();
      const trades = [];
      snapshot.forEach(doc => {
        trades.push(doc.data());
      });
      // Ordenar por data decrescente localmente
      return trades.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    } catch (e) {
      console.error("Erro ao obter propostas do Firestore:", e);
    }
  }
  return JSON.parse(localStorage.getItem("pokenot_market_trades")) || [];
}

// Adiciona uma nova proposta de troca no mercado
async function dbAddTrade(trade) {
  trade.timestamp = Date.now();
  if (isFirebaseActive) {
    try {
      await db.collection("trades").doc(trade.id).set(trade);
      return;
    } catch (e) {
      console.error("Erro ao salvar troca no Firestore:", e);
    }
  }
  const trades = JSON.parse(localStorage.getItem("pokenot_market_trades")) || [];
  trades.unshift(trade);
  localStorage.setItem("pokenot_market_trades", JSON.stringify(trades));
}

// Cancela uma proposta de troca ativa do usuário
async function dbCancelTrade(tradeId) {
  if (isFirebaseActive) {
    try {
      await db.collection("trades").doc(tradeId).delete();
      return;
    } catch (e) {
      console.error("Erro ao excluir troca no Firestore:", e);
    }
  }
  let trades = JSON.parse(localStorage.getItem("pokenot_market_trades")) || [];
  trades = trades.filter(t => t.id !== tradeId);
  localStorage.setItem("pokenot_market_trades", JSON.stringify(trades));
}

// Conclui uma troca no mercado de trocas
async function dbCompleteTrade(tradeId, trade) {
  if (isFirebaseActive) {
    try {
      await db.collection("trades").doc(tradeId).update({ status: "completed" });
      return;
    } catch (e) {
      console.error("Erro ao concluir troca no Firestore:", e);
    }
  }
  let trades = JSON.parse(localStorage.getItem("pokenot_market_trades")) || [];
  const idx = trades.findIndex(t => t.id === tradeId);
  if (idx !== -1) {
    trades[idx].status = "completed";
    localStorage.setItem("pokenot_market_trades", JSON.stringify(trades));
  }
}

let currentUser = null;
let currentTab = "binder";
let currentPage = 1;
const SLOTS_PER_PAGE = 12; // 6 na esquerda, 6 na direita

// Modais ativos
let activeSlotIndex = null;
let viewedUser = null; // null = visualizar o próprio usuário ativo, string = nome de outro usuário

// Função utilitária para prevenir XSS escapando HTML especial
function escapeHTML(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Criptografia de senhas usando SHA-256 (Web Crypto API)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Inicializar e limpar Trocas do Mercado e NPCs do localStorage
function initMarketTrades() {
  // Executar limpeza única dos dados de NPCs e do mercado de trocas legado para a versão web
  if (!localStorage.getItem("pokenot_cleaned_v1")) {
    localStorage.removeItem("pokenot_collection_Ash");
    localStorage.removeItem("pokenot_collection_Misty");
    localStorage.removeItem("pokenot_collection_Brock");
    localStorage.removeItem("pokenot_collection_Gary");
    
    // Limpar completamente o mercado de trocas legado
    localStorage.setItem("pokenot_market_trades", JSON.stringify([]));
    localStorage.setItem("pokenot_cleaned_v1", "true");
  }
}

/* ==========================================================================
   INITIALIZATION & EVENT LISTENERS
   ========================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  initFirebase();
  initMarketTrades();
  initGoogleSignIn();
  checkSession();

  // Login & Sign Up Forms Listeners
  document.getElementById("form-signin").addEventListener("submit", handleSignIn);
  document.getElementById("form-signup").addEventListener("submit", handleSignUp);

  // Add Card & Edit Card Forms Listeners
  document.getElementById("form-add-card").addEventListener("submit", saveNewCard);
  document.getElementById("form-edit-card").addEventListener("submit", saveEditedCard);

  // Create Trade Form Listener
  document.getElementById("form-create-trade").addEventListener("submit", handleCreateTrade);
  
  // Change Password Form Listener
  document.getElementById("form-change-password").addEventListener("submit", handleChangePassword);
  
  // Enter key support for modal search inputs
  document.getElementById("add-search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchTcgCards("add");
    }
  });
  document.getElementById("edit-search-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      searchTcgCards("edit");
    }
  });
});

// Verifica se já existe um usuário logado na sessão ativa
async function checkSession() {
  const sessionUser = sessionStorage.getItem("pokenot_current_user");
  if (sessionUser) {
    await loginUser(sessionUser);
  } else {
    showScreen("login");
  }
}

/* ==========================================================================
   GOOGLE OAUTH AUTHENTICATION & SIMULATION
   ========================================================================== */

// Inicializa a integração com o login do Google (ou ativa simulação se não houver Client ID)
function initGoogleSignIn() {
  const btnContainer = document.getElementById("google-signin-btn");
  if (!btnContainer) return;

  if (GOOGLE_CLIENT_ID.includes("SEU_CLIENT_ID")) {
    // Renderiza botão simulado amigável
    btnContainer.innerHTML = `
      <button type="button" class="btn btn-google" onclick="simulateGoogleLogin()">
        <i class="fa-brands fa-google text-google"></i> Entrar com o Google (Simulado)
      </button>
    `;
  } else {
    if (typeof google === "undefined") {
      // Caso a rede bloqueie o SDK do Google ou o usuário esteja offline
      btnContainer.innerHTML = `
        <button type="button" class="btn btn-google" onclick="simulateGoogleLogin()">
          <i class="fa-brands fa-google text-google"></i> Entrar com o Google (Simulado - Offline)
        </button>
      `;
      return;
    }
    
    // Inicialização oficial do Google Sign-In
    google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredentialResponse
    });
    
    google.accounts.id.renderButton(
      btnContainer,
      { theme: "dark", size: "large", width: "100%", text: "signin_with" }
    );
  }
}

// Decodifica o Token JWT do Google de forma nativa no cliente
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));

    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error("Erro ao decodificar JWT do Google:", e);
    return null;
  }
}

// Callback invocado após autenticação bem-sucedida oficial do Google
async function handleGoogleCredentialResponse(response) {
  const payload = parseJwt(response.credential);
  if (!payload) {
    showToast("Erro de autenticação com o Google.", "error");
    return;
  }
  
  const email = payload.email;
  const name = payload.name;
  const picture = payload.picture;
  
  await loginOrRegisterGoogleUser(email, name, picture);
}

// Simulação de login social para fins de teste sem Client ID
async function simulateGoogleLogin() {
  showToast("Conectando ao Google...", "info");
  setTimeout(async () => {
    const mockEmail = "treinador.teste@pokenot.com";
    const mockName = "Treinador Teste";
    const mockPicture = ""; // Sem avatar real na simulação local
    await loginOrRegisterGoogleUser(mockEmail, mockName, mockPicture);
  }, 800);
}

// Registra e faz o login do usuário autenticado por rede social
async function loginOrRegisterGoogleUser(email, name, picture) {
  const users = await dbGetUsers();
  
  // O nome de usuário interno será derivado do email
  const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  
  if (!users[username]) {
    users[username] = {
      password: "", // Usuários Google não utilizam senha local
      email: email,
      fullName: name,
      avatarUrl: picture,
      isGoogleUser: true,
      allowPublicView: false,
      logs: [
        {
          timestamp: new Date().toLocaleString("pt-BR"),
          action: "sistema",
          message: "Conta criada e autenticada com sucesso via Google."
        }
      ]
    };
    await dbSaveUser(username, users[username]);

    // Inicializar fichário vazio com 36 slots
    const emptyCollection = new Array(36).fill(null);
    emptyCollection[0] = {
      name: "Pikachu",
      imageUrl: "https://images.pokemontcg.io/xy12/35.png",
      type: "Electric",
      set: "XY Evolutions",
      quantity: 1,
      shiny: false,
      notes: "Meu primeiro card Pokémon!"
    };
    
    // Configurar temporariamente viewedUser como null para permitir a gravação inicial correta
    const oldViewed = viewedUser;
    viewedUser = null;
    const oldCurrentUser = currentUser;
    currentUser = username;
    await saveCollection(emptyCollection);
    viewedUser = oldViewed;
    currentUser = oldCurrentUser;
  } else {
    // Sincronizar dados mais recentes do Google
    users[username].email = email;
    users[username].fullName = name;
    if (picture) users[username].avatarUrl = picture;
    users[username].isGoogleUser = true;
    await dbSaveUser(username, users[username]);
  }
  
  sessionStorage.setItem("pokenot_current_user", username);
  await loginUser(username);
  await addLogEntry("sistema", "Sessão iniciada via Google.");
  showToast(`Bem-vindo, Treinador ${name}!`, "success");
}

/* ==========================================================================
   AUTHENTICATION LOGIC (LOGIN & CADASTRO)
   ========================================================================== */
function switchLoginTab(tab) {
  const btnSignin = document.getElementById("btn-tab-signin");
  const btnSignup = document.getElementById("btn-tab-signup");
  const formSignin = document.getElementById("form-signin");
  const formSignup = document.getElementById("form-signup");
  const signinError = document.getElementById("signin-error");
  const signupError = document.getElementById("signup-error");

  signinError.classList.add("hidden");
  signupError.classList.add("hidden");

  if (tab === "signin") {
    btnSignin.classList.add("active");
    btnSignup.classList.remove("active");
    formSignin.classList.remove("hidden");
    formSignup.classList.add("hidden");
  } else {
    btnSignin.classList.remove("active");
    btnSignup.classList.add("active");
    formSignin.classList.add("hidden");
    formSignup.classList.remove("hidden");
  }
}

async function handleSignIn(e) {
  e.preventDefault();
  const usernameInput = document.getElementById("signin-username").value.trim();
  const passwordInput = document.getElementById("signin-password").value;
  const signinError = document.getElementById("signin-error");

  const users = await dbGetUsers();

  if (users[usernameInput]) {
    const hashedInput = await hashPassword(passwordInput);
    const storedPwd = users[usernameInput].password;

    if (storedPwd === hashedInput || storedPwd === passwordInput) {
      // Migração automática de senhas antigas para hash SHA-256
      if (storedPwd === passwordInput) {
        users[usernameInput].password = hashedInput;
        await dbSaveUser(usernameInput, users[usernameInput]);
      }
      
      signinError.classList.add("hidden");
      sessionStorage.setItem("pokenot_current_user", usernameInput);
      await loginUser(usernameInput);
      await addLogEntry("sistema", "Acesso efetuado no sistema.");
      showToast("Bem-vindo de volta, Treinador!", "success");
      return;
    }
  }
  
  signinError.classList.remove("hidden");
  showToast("Falha no login. Verifique seus dados.", "error");
}

async function handleSignUp(e) {
  e.preventDefault();
  const usernameInput = document.getElementById("signup-username").value.trim();
  const passwordInput = document.getElementById("signup-password").value;
  const signupError = document.getElementById("signup-error");

  const users = await dbGetUsers();

  if (users[usernameInput]) {
    signupError.textContent = "Nome de usuário já está em uso.";
    signupError.classList.remove("hidden");
    showToast("Nome de usuário já cadastrado.", "error");
  } else {
    const hashedPassword = await hashPassword(passwordInput);
    users[usernameInput] = { 
      password: hashedPassword,
      allowPublicView: false,
      logs: [
        {
          timestamp: new Date().toLocaleString("pt-BR"),
          action: "sistema",
          message: "Conta de treinador criada com sucesso. Fichário inicializado."
        }
      ]
    };
    await dbSaveUser(usernameInput, users[usernameInput]);

    // Inicializar fichário vazio com 36 slots
    const emptyCollection = new Array(36).fill(null);
    emptyCollection[0] = {
      name: "Pikachu",
      imageUrl: "https://images.pokemontcg.io/xy12/35.png",
      type: "Electric",
      set: "XY Evolutions",
      quantity: 1,
      shiny: false,
      notes: "Meu primeiro card Pokémon!"
    };
    
    // Configurar temporariamente viewedUser como null para permitir a gravação inicial correta
    const oldViewed = viewedUser;
    viewedUser = null;
    const oldCurrentUser = currentUser;
    currentUser = usernameInput;
    await saveCollection(emptyCollection);
    viewedUser = oldViewed;
    currentUser = oldCurrentUser;

    signupError.classList.add("hidden");
    sessionStorage.setItem("pokenot_current_user", usernameInput);
    await loginUser(usernameInput);
    showToast("Conta criada com sucesso! Fichário pronto.", "success");
  }
}

async function loginUser(username) {
  currentUser = username;
  viewedUser = null;
  document.getElementById("binder-readonly-banner").classList.add("hidden");
  
  // Garantir que o botão de organizar reapareça
  const organizeBtn = document.querySelector("#screen-binder .toolbar-left button");
  if (organizeBtn) organizeBtn.style.display = "inline-flex";
  
  const users = await dbGetUsers();
  const user = users[username] || {};

  // Atualizar Header
  document.getElementById("header-username").textContent = user.fullName || username;
  
  const avatarEl = document.getElementById("header-avatar");
  if (user.avatarUrl) {
    avatarEl.innerHTML = `<img src="${escapeHTML(user.avatarUrl)}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
    avatarEl.style.padding = "0";
  } else {
    avatarEl.textContent = username.substring(0, 1).toUpperCase();
    avatarEl.style.padding = ""; // Resetar preenchimento
  }
  
  document.getElementById("app-header").classList.remove("hidden");

  // Resetar visualização
  currentPage = 1;
  await switchTab("binder");
}

// Evento de Logout
document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem("pokenot_current_user");
  currentUser = null;
  document.getElementById("app-header").classList.add("hidden");
  showScreen("login");
  showToast("Você saiu da conta.", "warning");
});

/* ==========================================================================
   NAVIGATION & TABS CONTROL
   ========================================================================== */
function showScreen(screen) {
  const screens = ["login", "binder", "trade", "community", "settings"];
  screens.forEach(s => {
    const el = document.getElementById(`screen-${s}`);
    if (s === screen) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });
}

async function switchTab(tab) {
  currentTab = tab;
  const btnBinder = document.getElementById("tab-binder");
  const btnTrade = document.getElementById("tab-trade");
  const btnCommunity = document.getElementById("tab-community");
  const btnSettings = document.getElementById("tab-settings");

  [btnBinder, btnTrade, btnCommunity, btnSettings].forEach(btn => {
    if (btn) btn.classList.remove("active");
  });

  if (tab === "binder") {
    if (btnBinder) btnBinder.classList.add("active");
    showScreen("binder");
    await renderBinderGrid();
  } else if (tab === "trade") {
    if (btnTrade) btnTrade.classList.add("active");
    showScreen("trade");
    await loadTradeTab();
  } else if (tab === "community") {
    if (btnCommunity) btnCommunity.classList.add("active");
    showScreen("community");
    await loadCommunityTab();
  } else if (tab === "settings") {
    if (btnSettings) btnSettings.classList.add("active");
    showScreen("settings");
    await loadSettingsTab();
  }
}

/* ==========================================================================
   FICHÁRIO (BINDER) RENDERING & CONTROLS
   ========================================================================== */
async function getCollection(target = null) {
  const targetUser = target || viewedUser || currentUser;
  if (isFirebaseActive) {
    try {
      const doc = await db.collection("collections").doc(targetUser).get();
      if (doc.exists) {
        return doc.data().slots || new Array(36).fill(null);
      }
      return new Array(36).fill(null);
    } catch (e) {
      console.error("Erro ao obter coleção do Firestore:", e);
    }
  }
  const key = `pokenot_collection_${targetUser}`;
  return JSON.parse(localStorage.getItem(key)) || new Array(36).fill(null);
}

// Salva a coleção
async function saveCollection(collection) {
  if (viewedUser) return; // Segurança: impede gravação no fichário de terceiros
  if (isFirebaseActive) {
    try {
      await db.collection("collections").doc(currentUser).set({ slots: collection });
      return;
    } catch (e) {
      console.error("Erro ao salvar coleção no Firestore:", e);
    }
  }
  const key = `pokenot_collection_${currentUser}`;
  localStorage.setItem(key, JSON.stringify(collection));
}

// Renderiza a grade de cartas 4x3 (6 cards na esquerda e 6 na direita)
async function renderBinderGrid() {
  const collection = await getCollection();
  const leftGrid = document.getElementById("grid-left-slots");
  const rightGrid = document.getElementById("grid-right-slots");
  
  leftGrid.innerHTML = "";
  rightGrid.innerHTML = "";

  const pageStartOffset = (currentPage - 1) * SLOTS_PER_PAGE;

  const searchQuery = document.getElementById("binder-search").value.trim().toLowerCase();
  const filterType = document.getElementById("binder-filter-type").value;

  // Renderizar 6 slots na Esquerda
  for (let i = 0; i < 6; i++) {
    const slotIdx = pageStartOffset + i;
    const card = collection[slotIdx];
    leftGrid.appendChild(createSlotElement(card, slotIdx, searchQuery, filterType));
  }

  // Renderizar 6 slots na Direita
  for (let i = 6; i < 12; i++) {
    const slotIdx = pageStartOffset + i;
    const card = collection[slotIdx];
    rightGrid.appendChild(createSlotElement(card, slotIdx, searchQuery, filterType));
  }

  // Atualizar Indicador de Página
  document.getElementById("binder-page-number").textContent = `Página ${currentPage}`;
  
  // Atualizar Stats
  updateCollectionStats(collection);
}

// Cria o elemento de slot do card (vazio ou preenchido com estampa real)
function createSlotElement(card, slotIdx, searchQuery, filterType) {
  const slotEl = document.createElement("div");
  slotEl.className = "card-slot";

  // Se o slot estiver vazio
  if (!card) {
    slotEl.classList.add("empty");
    if (viewedUser) {
      // No modo de leitura, slots vazios são neutros e não clicáveis
      slotEl.innerHTML = `<div class="slot-add-btn" style="opacity: 0.1;"><i class="fa-solid fa-ban"></i></div>`;
      slotEl.style.cursor = "default";
      slotEl.style.pointerEvents = "none";
      return slotEl;
    }
    slotEl.innerHTML = `
      <div class="slot-add-btn">
        <i class="fa-solid fa-plus-circle"></i>
        <span>Adicionar</span>
      </div>
    `;
    if (searchQuery !== "" || filterType !== "all") {
      slotEl.style.opacity = "0.2";
      slotEl.style.pointerEvents = "none";
    } else {
      slotEl.addEventListener("click", () => openAddCardModal(slotIdx));
    }
    return slotEl;
  }

  // Aplicar busca/filtros
  let showCard = true;

  if (searchQuery !== "" && !card.name.toLowerCase().includes(searchQuery)) {
    showCard = false;
  }

  if (filterType !== "all") {
    if (filterType === "shiny" && !card.shiny) {
      showCard = false;
    } else if (filterType === "repeated" && card.quantity <= 1) {
      showCard = false;
    } else if (filterType !== "shiny" && filterType !== "repeated" && card.type !== filterType) {
      showCard = false;
    }
  }

  if (!showCard) {
    slotEl.style.opacity = "0.15";
  }

  slotEl.classList.add("filled");

  const shinyClass = card.shiny ? "shiny" : "";
  const duplicateBadge = card.quantity > 1 ? `<div class="duplicate-badge">x${card.quantity}</div>` : "";
  const imageToShow = card.imageUrl || "https://images.pokemontcg.io/cardback.png";
  
  let titleParts = [card.name];
  if (card.set) titleParts.push(card.set);
  if (card.number) titleParts.push(card.number);
  const titleText = titleParts.join(" - ");

  slotEl.innerHTML = `
    ${duplicateBadge}
    <div class="pokemon-card real-card ${shinyClass}" data-type="${escapeHTML(card.type)}" title="${escapeHTML(titleText)}">
      <img class="real-card-img" src="${escapeHTML(imageToShow)}" alt="${escapeHTML(card.name)}" onerror="this.src='https://images.pokemontcg.io/cardback.png'">
      <div class="shiny-overlay"></div>
    </div>
  `;

  if (viewedUser) {
    slotEl.style.cursor = "default";
  } else {
    slotEl.addEventListener("click", () => openEditCardModal(slotIdx));
  }
  return slotEl;
}

// Trocar páginas do fichário
async function changePage(direction) {
  const collection = await getCollection();
  const maxPages = Math.ceil(collection.length / SLOTS_PER_PAGE);

  if (currentPage + direction < 1) {
    showToast("Você já está na primeira página.", "warning");
    return;
  }
  
  if (currentPage + direction > maxPages) {
    const newSlots = new Array(SLOTS_PER_PAGE).fill(null);
    const newCollection = [...collection, ...newSlots];
    await saveCollection(newCollection);
    showToast("Novas páginas foram adicionadas ao fichário!", "success");
  }

  currentPage += direction;
  await renderBinderGrid();
}

async function filterBinder() {
  await renderBinderGrid();
}

// Reorganiza a sequência eliminando espaços vazios entre os cards
async function organizeBinder() {
  const collection = await getCollection();
  const activeCards = collection.filter(card => card !== null);

  if (activeCards.length === 0) {
    showToast("Não há cartas no seu fichário para organizar.", "warning");
    return;
  }

  // Manter o mesmo tamanho original do fichário (mínimo de 36 slots)
  const originalLength = Math.max(36, collection.length);
  let newCollection = [...activeCards];
  while (newCollection.length < originalLength) {
    newCollection.push(null);
  }

  await saveCollection(newCollection);
  await addLogEntry("edição", "Reorganizou a sequência dos cards do fichário para remover espaços vazios.");
  currentPage = 1;
  await renderBinderGrid();
  showToast("Fichário reorganizado! Espaços vazios foram removidos.", "success");
}

// Traduz os tipos internos para exibição amigável
function translateType(type) {
  const translations = {
    "Normal": "Normal",
    "Fire": "Fogo",
    "Water": "Água",
    "Grass": "Planta",
    "Electric": "Elétrico",
    "Psychic": "Psíquico",
    "Fighting": "Lutador",
    "Ghost": "Fantasma",
    "Dragon": "Dragão",
    "Steel": "Aço",
    "Fairy": "Fada"
  };
  return translations[type] || type;
}

function updateCollectionStats(collection) {
  let total = 0;
  let shinies = 0;
  
  collection.forEach(card => {
    if (card) {
      total += parseInt(card.quantity || 1);
      if (card.shiny) shinies += parseInt(card.quantity || 1);
    }
  });

  document.getElementById("stats-total-cards").textContent = `${total} Card${total !== 1 ? 's' : ''}`;
  document.getElementById("stats-shiny-cards").innerHTML = `<i class="fa-solid fa-sparkles"></i> ${shinies} Shiny`;
}

/* ==========================================================================
   MODAL ACTIONS: ADD / EDIT / PREVIEW & TCG API SEARCH
   ========================================================================== */
function openAddCardModal(slotIdx) {
  activeSlotIndex = slotIdx;
  document.getElementById("add-slot-index").textContent = slotIdx + 1;
  
  // Limpar formulário
  document.getElementById("form-add-card").reset();
  document.getElementById("add-search-input").value = "";
  document.getElementById("add-search-results").innerHTML = "";
  document.getElementById("add-search-results-wrapper").classList.add("hidden");
  document.getElementById("add-card-set").value = "";
  document.getElementById("add-card-number").value = "";
  
  // Atualizar preview básico
  updateCardPreviewUrl('add');
  toggleShinyOverlay('add');
  
  // Exibir Modal
  document.getElementById("modal-add-card").classList.remove("hidden");
}

async function openEditCardModal(slotIdx) {
  activeSlotIndex = slotIdx;
  document.getElementById("edit-slot-index").textContent = slotIdx + 1;
  
  const collection = await getCollection();
  const card = collection[slotIdx];

  if (!card) return;

  // Resetar busca no modal
  document.getElementById("edit-search-input").value = "";
  document.getElementById("edit-search-results").innerHTML = "";
  document.getElementById("edit-search-results-wrapper").classList.add("hidden");

  // Preencher campos
  document.getElementById("edit-card-name").value = card.name;
  document.getElementById("edit-card-image").value = card.imageUrl || "";
  document.getElementById("edit-card-type").value = card.type || "Normal";
  document.getElementById("edit-card-set").value = card.set || "";
  document.getElementById("edit-card-number").value = card.number || "";
  document.getElementById("edit-card-qty").value = card.quantity || 1;
  document.getElementById("edit-card-notes").value = card.notes || "";
  
  const shinyCheckbox = document.getElementById("edit-card-shiny");
  shinyCheckbox.checked = card.shiny || false;

  // Atualizar preview
  updateCardPreviewUrl('edit');
  toggleShinyOverlay('edit');

  // Exibir Modal
  document.getElementById("modal-edit-card").classList.remove("hidden");
}

function closeModal(modalType) {
  document.getElementById(`modal-${modalType}-card`).classList.add("hidden");
  activeSlotIndex = null;
}

// Busca cartas na API do Pokémon TCG
function searchTcgCards(mode) {
  const query = document.getElementById(`${mode}-search-input`).value.trim();
  if (!query) {
    showToast("Digite um nome de Pokémon para buscar.", "warning");
    return;
  }

  const resultsGrid = document.getElementById(`${mode}-search-results`);
  const wrapper = document.getElementById(`${mode}-search-results-wrapper`);

  // Mostrar Loading
  resultsGrid.innerHTML = `
    <div style="grid-column: 1/-1; text-align: center; padding: 1.5rem; color: var(--text-secondary);">
      <i class="fa-solid fa-spinner fa-spin fa-2x" style="margin-bottom:0.5rem; color:var(--primary);"></i>
      <p>Consultando base oficial do Pokémon TCG...</p>
    </div>
  `;
  wrapper.classList.remove("hidden");

  let apiQuery = "";
  // Tenta extrair padrões de numeração (ex: 034/086 ou 34)
  const slashNumberMatch = query.match(/\b(\d+)\/(\d+)\b/);
  const simpleNumberMatch = query.match(/\b(\d+)\b/);

  if (slashNumberMatch) {
    const cardNumber = slashNumberMatch[1];
    let cardName = query.replace(slashNumberMatch[0], "").replace(/\s+/g, " ").trim();
    // Remove códigos de coleção uppercase com 3-4 caracteres (ex: CRI, SVP, sv6)
    cardName = cardName.replace(/\b[A-Z0-9]{3,4}\b/gi, "").replace(/\s+/g, " ").trim();
    if (cardName) {
      apiQuery = `name:"${cardName}"* number:${cardNumber}`;
    } else {
      apiQuery = `number:${cardNumber}`;
    }
  } else if (simpleNumberMatch) {
    const cardNumber = simpleNumberMatch[1];
    let cardName = query.replace(simpleNumberMatch[0], "").replace(/\s+/g, " ").trim();
    cardName = cardName.replace(/\b[A-Z0-9]{3,4}\b/gi, "").replace(/\s+/g, " ").trim();
    if (cardName) {
      apiQuery = `name:"${cardName}"* number:${cardNumber}`;
    } else {
      apiQuery = `number:${cardNumber}`;
    }
  } else {
    apiQuery = `name:${query}*`;
  }

  // Realizar requisição para API (sem necessidade de API key para taxas moderadas)
  fetch(`https://api.pokemontcg.io/v2/cards?q=${encodeURIComponent(apiQuery)}&pageSize=16`)
    .then(response => {
      if (!response.ok) throw new Error("Erro na rede");
      return response.json();
    })
    .then(data => {
      resultsGrid.innerHTML = "";
      if (!data.data || data.data.length === 0) {
        resultsGrid.innerHTML = `
          <div style="grid-column: 1/-1; text-align: center; padding: 1rem; color: var(--text-muted);">
            Nenhuma carta encontrada. Tente buscar em inglês (Ex: Sprigatito, Charizard).
          </div>
        `;
        return;
      }

      data.data.forEach(card => {
        const item = document.createElement("div");
        item.className = "search-result-card";
        item.innerHTML = `<img src="${escapeHTML(card.images.small)}" alt="${escapeHTML(card.name)}" title="${escapeHTML(card.name)} - ${escapeHTML(card.set.name)}">`;
        
        item.addEventListener("click", () => {
          // Destacar item selecionado
          const siblings = resultsGrid.querySelectorAll(".search-result-card");
          siblings.forEach(s => s.classList.remove("selected"));
          item.classList.add("selected");

          // Preencher campos do formulário
          document.getElementById(`${mode}-card-name`).value = card.name;
          document.getElementById(`${mode}-card-image`).value = card.images.large || card.images.small;
          document.getElementById(`${mode}-card-set`).value = card.set.name;

          // Formatar número da carta (ex: 034/086)
          let cardNum = card.number || "";
          if (cardNum && card.set.printedTotal) {
            let total = parseInt(card.set.printedTotal);
            let numVal = parseInt(cardNum);
            if (!isNaN(numVal) && !isNaN(total)) {
              cardNum = String(numVal).padStart(String(total).length, '0');
            }
            cardNum = cardNum + '/' + card.set.printedTotal;
          }
          document.getElementById(`${mode}-card-number`).value = cardNum;

          if (card.types && card.types.length > 0) {
            document.getElementById(`${mode}-card-type`).value = mapTcgType(card.types[0]);
          }

          // Atualizar preview
          updateCardPreviewUrl(mode);
          showToast(`Estampa selecionada: ${card.name} (${card.set.name})`, "info");
        });

        resultsGrid.appendChild(item);
      });
    })
    .catch(err => {
      console.error(err);
      resultsGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 1rem; color: var(--danger);">
          Erro ao carregar do TCG API. Você ainda pode colar o link da imagem manualmente abaixo.
        </div>
      `;
      showToast("Falha ao buscar cartas online.", "error");
    });
}

// Mapeia os tipos em inglês da API para os filtros em português do Fichário
function mapTcgType(tcgType) {
  const mapping = {
    "Grass": "Grass",
    "Fire": "Fire",
    "Water": "Water",
    "Lightning": "Electric",
    "Psychic": "Psychic",
    "Fighting": "Fighting",
    "Darkness": "Psychic", 
    "Metal": "Steel",
    "Dragon": "Dragon",
    "Fairy": "Fairy",
    "Colorless": "Normal"
  };
  return mapping[tcgType] || "Normal";
}

// Atualiza o preview da imagem real no modal
function updateCardPreviewUrl(mode) {
  const imageUrl = document.getElementById(`${mode}-card-image`).value.trim();
  const previewImg = document.getElementById(`${mode}-preview-img`);
  
  if (imageUrl) {
    previewImg.src = imageUrl;
  } else {
    previewImg.src = "https://images.pokemontcg.io/cardback.png";
  }
}

// Atualiza o overlay holográfico de Shiny no modal
function toggleShinyOverlay(mode) {
  const shiny = document.getElementById(`${mode}-card-shiny`).checked;
  const previewContainer = document.getElementById(`${mode}-card-preview`);
  
  if (shiny) {
    previewContainer.classList.add("shiny");
  } else {
    previewContainer.classList.remove("shiny");
  }
}

// Processa e comprime uma imagem local para salvar no localStorage
function handleLocalFileSelect(mode) {
  const fileInput = document.getElementById(`${mode}-card-file`);
  const imageUrlInput = document.getElementById(`${mode}-card-image`);
  const file = fileInput.files[0];

  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Por favor, selecione um arquivo de imagem válido.", "error");
    return;
  }

  showToast("Carregando e otimizando imagem...", "info");

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      // Redimensionar e comprimir a imagem usando um Canvas
      const canvas = document.createElement("canvas");
      
      // Proporção padrão de carta TCG (ex: 300x420 pixels)
      const targetWidth = 300;
      const targetHeight = 420;
      
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      
      const ctx = canvas.getContext("2d");
      
      // Desenhar a imagem preenchendo o canvas proporcionalmente (cover)
      const imgRatio = img.width / img.height;
      const canvasRatio = targetWidth / targetHeight;
      let drawWidth, drawHeight, drawX, drawY;
      
      if (imgRatio > canvasRatio) {
        drawHeight = targetHeight;
        drawWidth = img.width * (targetHeight / img.height);
        drawX = (targetWidth - drawWidth) / 2;
        drawY = 0;
      } else {
        drawWidth = targetWidth;
        drawHeight = img.height * (targetWidth / img.width);
        drawX = 0;
        drawY = (targetHeight - drawHeight) / 2;
      }
      
      ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
      
      // Exportar como JPEG comprimido a 70% de qualidade (gera ~25kb)
      const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.7);
      
      imageUrlInput.value = compressedDataUrl;
      updateCardPreviewUrl(mode);
      showToast("Imagem local carregada e otimizada!", "success");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Salva o novo card no Fichário
async function saveNewCard(e) {
  e.preventDefault();
  const name = document.getElementById("add-card-name").value.trim();
  const imageUrl = document.getElementById("add-card-image").value.trim();
  const type = document.getElementById("add-card-type").value;
  const set = document.getElementById("add-card-set").value.trim();
  const number = document.getElementById("add-card-number").value.trim();
  const quantity = parseInt(document.getElementById("add-card-qty").value) || 1;
  const shiny = document.getElementById("add-card-shiny").checked;
  const notes = document.getElementById("add-card-notes").value.trim();

  const newCard = {
    name,
    imageUrl,
    type,
    set,
    number,
    quantity,
    shiny,
    notes
  };

  const collection = await getCollection();
  collection[activeSlotIndex] = newCard;
  await saveCollection(collection);
  await addLogEntry("registro", `Registrou o card "${name}" (${set || "Sem Coleção"}) no Slot ${activeSlotIndex + 1}.`);

  closeModal('add');
  await renderBinderGrid();
  showToast(`${name} registrado no Fichário!`, "success");
}

// Salva as alterações feitas no card selecionado
async function saveEditedCard(e) {
  e.preventDefault();
  const name = document.getElementById("edit-card-name").value.trim();
  const imageUrl = document.getElementById("edit-card-image").value.trim();
  const type = document.getElementById("edit-card-type").value;
  const set = document.getElementById("edit-card-set").value.trim();
  const number = document.getElementById("edit-card-number").value.trim();
  const quantity = parseInt(document.getElementById("edit-card-qty").value);
  const shiny = document.getElementById("edit-card-shiny").checked;
  const notes = document.getElementById("edit-card-notes").value.trim();

  const collection = await getCollection();

  if (quantity <= 0) {
    collection[activeSlotIndex] = null;
    await addLogEntry("exclusão", `Removeu o card "${name}" do Slot ${activeSlotIndex + 1} (Quantidade zerada).`);
    showToast(`${name} removido do fichário.`, "warning");
  } else {
    collection[activeSlotIndex] = {
      name,
      imageUrl,
      type,
      set,
      number,
      quantity,
      shiny,
      notes
    };
    await addLogEntry("edição", `Atualizou as informações do card "${name}" (${set || "Sem Coleção"}) no Slot ${activeSlotIndex + 1}.`);
    showToast(`Alterações em ${name} salvas!`, "success");
  }

  await saveCollection(collection);
  closeModal('edit');
  await renderBinderGrid();
}

// Esvazia por completo o slot
async function deleteCardFromSlot() {
  if (activeSlotIndex === null) return;
  
  const collection = await getCollection();
  const cardName = collection[activeSlotIndex]?.name || "Card";

  if (confirm(`Tem certeza que deseja esvaziar o Slot ${activeSlotIndex + 1}?`)) {
    collection[activeSlotIndex] = null;
    await saveCollection(collection);
    await addLogEntry("exclusão", `Removeu o card "${cardName}" do Slot ${activeSlotIndex + 1}.`);
    
    closeModal('edit');
    await renderBinderGrid();
    showToast(`${cardName} removido do fichário.`, "danger");
  }
}

/* ==========================================================================
   TELA DE TROCAS (TRADING SYSTEM)
   ========================================================================= */
async function loadTradeTab() {
  await populateMyCardsForTrade();
  await loadMarketTrades();
  await loadMyActiveTrades();
}

// Popula a seleção com cartas do usuário (recomendando as repetidas e permitindo as únicas com aviso)
async function populateMyCardsForTrade() {
  const collection = await getCollection();
  const select = document.getElementById("trade-my-card");
  
  select.innerHTML = '<option value="" disabled selected>Selecione um card do seu fichário...</option>';
  
  const repeatedCards = [];
  const singleCards = [];

  collection.forEach((card, idx) => {
    if (card) {
      if (card.quantity > 1) {
        repeatedCards.push({ card, idx });
      } else {
        singleCards.push({ card, idx });
      }
    }
  });

  if (repeatedCards.length === 0 && singleCards.length === 0) {
    const option = document.createElement("option");
    option.disabled = true;
    option.textContent = "Nenhum card disponível no fichário.";
    select.appendChild(option);
    return;
  }

  // 1. Mostrar as repetidas primeiro (com destaque)
  if (repeatedCards.length > 0) {
    const optGroup = document.createElement("optgroup");
    optGroup.label = "Recomendado: Cards Repetidos (Qtd > 1)";
    repeatedCards.forEach(({ card, idx }) => {
      const option = document.createElement("option");
      option.value = idx;
      const shinyText = card.shiny ? " (Shiny)" : "";
      const setInfo = card.set ? ` (${card.set})` : "";
      const numInfo = card.number ? ` #${card.number}` : "";
      option.textContent = `⭐ ${card.name}${setInfo}${numInfo}${shinyText} (Repetidas: ${card.quantity - 1})`;
      optGroup.appendChild(option);
    });
    select.appendChild(optGroup);
  }

  // 2. Mostrar as de cópia única depois (com aviso)
  if (singleCards.length > 0) {
    const optGroup = document.createElement("optgroup");
    optGroup.label = "Atenção: Cópia Única (Ficará sem o card se trocar)";
    singleCards.forEach(({ card, idx }) => {
      const option = document.createElement("option");
      option.value = idx;
      const shinyText = card.shiny ? " (Shiny)" : "";
      const setInfo = card.set ? ` (${card.set})` : "";
      const numInfo = card.number ? ` #${card.number}` : "";
      option.textContent = `⚠️ ${card.name}${setInfo}${numInfo}${shinyText} (Qtd: 1)`;
      optGroup.appendChild(option);
    });
    select.appendChild(optGroup);
  }
}

// Publica proposta de troca
async function handleCreateTrade(e) {
  e.preventDefault();
  const selectIndex = parseInt(document.getElementById("trade-my-card").value);
  const wantedName = document.getElementById("trade-wanted-card").value.trim();

  if (isNaN(selectIndex)) {
    showToast("Por favor, selecione uma carta do seu fichário.", "error");
    return;
  }

  const collection = await getCollection();
  const myCard = collection[selectIndex];

  if (!myCard || myCard.quantity < 1) {
    showToast("Operação inválida. Card indisponível para troca.", "error");
    return;
  }
  
  const newTrade = {
    id: `trade_${currentUser}_${Date.now()}`,
    trainer: currentUser,
    avatar: currentUser.substring(0,1).toUpperCase(),
    offered: {
      name: myCard.name,
      type: myCard.type,
      imageUrl: myCard.imageUrl,
      set: myCard.set || "",
      shiny: myCard.shiny,
      userSlotIndex: selectIndex 
    },
    wanted: wantedName || "Qualquer Card",
    status: "active"
  };

  await dbAddTrade(newTrade);

  document.getElementById("form-create-trade").reset();
  
  await loadTradeTab();
  showToast("Proposta de troca publicada!", "success");
}

async function loadMyActiveTrades() {
  const marketTrades = await dbGetMarketTrades();
  const container = document.getElementById("my-active-trades");
  
  container.innerHTML = "";

  const myActive = marketTrades.filter(t => t.trainer === currentUser && t.status === "active");

  if (myActive.length === 0) {
    container.innerHTML = `<p class="empty-text">Você não possui ofertas ativas de troca.</p>`;
    return;
  }

  myActive.forEach(trade => {
    const item = document.createElement("div");
    item.className = "user-trade-item";
    const shinyText = trade.offered.shiny ? " <i class='fa-solid fa-sparkles text-shiny'></i>" : "";
    const setInfo = trade.offered.set ? ` (${trade.offered.set})` : "";
    
    item.innerHTML = `
      <div class="trade-item-info">
        <div class="trade-item-labels">Oferecendo: <span>${escapeHTML(trade.offered.name)}${escapeHTML(setInfo)}${shinyText}</span></div>
        <div class="trade-item-wanted">Desejando: <strong>${escapeHTML(trade.wanted)}</strong></div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="cancelMyTrade('${escapeHTML(trade.id)}')" title="Cancelar Oferta">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

async function cancelMyTrade(tradeId) {
  await dbCancelTrade(tradeId);
  await loadTradeTab();
  showToast("Proposta cancelada.", "warning");
}

// Renderiza listagem do Mercado
async function loadMarketTrades() {
  const marketTrades = await dbGetMarketTrades();
  const container = document.getElementById("market-trades-list");
  
  container.innerHTML = "";

  const othersTrades = marketTrades.filter(t => t.trainer !== currentUser);

  if (othersTrades.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1" class="empty-text">Nenhuma proposta de troca disponível no mercado.</div>`;
    return;
  }

  const collection = await getCollection();

  othersTrades.forEach(trade => {
    const card = document.createElement("div");
    card.className = "market-trade-card";
    
    const shinyTag = trade.offered.shiny ? " <i class='fa-solid fa-sparkles text-shiny' title='Shiny'></i>" : "";
    const setInfo = trade.offered.set ? ` (${trade.offered.set})` : "";
    const isCompleted = trade.status === "completed";

    const isOptional = !trade.wanted || trade.wanted === "Qualquer Card";
    const userHasWanted = isOptional 
      ? collection.some(c => c !== null) 
      : collection.some(c => c && c.name.toLowerCase() === trade.wanted.toLowerCase());
    
    let btnAction = "";
    if (isCompleted) {
      btnAction = `<span class="trade-badge-status completed"><i class="fa-solid fa-check-double"></i> Concluída</span>`;
    } else {
      btnAction = `
        <button class="btn btn-sm btn-primary" onclick="acceptTrade('${escapeHTML(trade.id)}')" ${!userHasWanted ? 'disabled style="filter: grayscale(1); opacity:0.6;"' : ''}>
          Aceitar Troca <i class="fa-solid fa-right-left"></i>
        </button>
      `;
    }

    const warningText = !isCompleted && !userHasWanted 
      ? (isOptional 
          ? `<div class="trade-error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Fichário vazio</div>` 
          : `<div class="trade-error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Você não possui ${escapeHTML(trade.wanted)}</div>`)
      : "";

    card.innerHTML = `
      <div class="trade-card-header">
        <div class="trainer-info">
          <span class="trainer-avatar">${escapeHTML(trade.avatar)}</span>
          <span>Treinador ${escapeHTML(trade.trainer)}</span>
        </div>
        ${isCompleted ? "" : `<span class="trade-badge-status">Pendente</span>`}
      </div>

      <div class="trade-swap-visual">
        <div class="swap-side">
          <span>Recebe</span>
          <strong>${escapeHTML(trade.offered.name)}${escapeHTML(setInfo)}${shinyTag}</strong>
          <span class="type-dot" style="background-color: var(--type-${escapeHTML(trade.offered.type.toLowerCase())})">${translateType(trade.offered.type)}</span>
        </div>
        <div class="swap-arrow">
          <i class="fa-solid fa-arrow-right-arrow-left"></i>
        </div>
        <div class="swap-side">
          <span>Dá</span>
          <strong>${escapeHTML(trade.wanted)}</strong>
          <span class="type-dot" style="background-color: ${isOptional ? 'var(--primary)' : '#555'}; color: #fff;">${isOptional ? 'A Escolha' : 'Desejado'}</span>
        </div>
      </div>

      <div class="trade-card-footer">
        <div>
          ${warningText}
        </div>
        <div>
          ${btnAction}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

// Aceita propostas e atualiza os inventários persistidos
async function acceptTrade(tradeId) {
  const marketTrades = await dbGetMarketTrades();
  const tradeIdx = marketTrades.findIndex(t => t.id === tradeId);
  
  if (tradeIdx === -1) return;
  const trade = marketTrades[tradeIdx];

  const collection = await getCollection();
  let wantedCardIndex = -1;
  const isOptional = !trade.wanted || trade.wanted === "Qualquer Card";

  if (isOptional) {
    // Listar slots ocupados no fichário do usuário
    const availableCards = collection
      .map((c, idx) => c ? `${idx + 1}: ${c.name} (${c.shiny ? 'Shiny ' : ''}Qtd: ${c.quantity})` : null)
      .filter(Boolean);
      
    if (availableCards.length === 0) {
      showToast("Você não possui cartas no fichário para oferecer em troca.", "error");
      return;
    }
    
    const choice = prompt(`Esta proposta aceita qualquer card em troca!\nEscolha o número da carta do seu fichário que deseja entregar:\n\n${availableCards.join("\n")}`);
    if (choice === null) return; // Cancelou a operação
    
    const slotNum = parseInt(choice.trim());
    if (isNaN(slotNum) || slotNum < 1 || slotNum > collection.length || !collection[slotNum - 1]) {
      showToast("Escolha inválida ou slot vazio.", "error");
      return;
    }
    wantedCardIndex = slotNum - 1;
  } else {
    wantedCardIndex = collection.findIndex(c => c && c.name.toLowerCase() === trade.wanted.toLowerCase());
    if (wantedCardIndex === -1) {
      showToast(`Erro: Você não tem ${trade.wanted} no seu fichário.`, "error");
      return;
    }
  }

  // 1. Tirar a carta que você deu
  const myTradedCard = collection[wantedCardIndex];
  myTradedCard.quantity -= 1;
  
  if (myTradedCard.quantity <= 0) {
    collection[wantedCardIndex] = null;
  }

  // 2. Inserir a carta recebida
  const matchIdx = collection.findIndex(c => c && c.name.toLowerCase() === trade.offered.name.toLowerCase() && c.shiny === trade.offered.shiny);
  
  if (matchIdx !== -1) {
    collection[matchIdx].quantity += 1;
  } else {
    const emptyIdx = collection.indexOf(null);
    if (emptyIdx !== -1) {
      collection[emptyIdx] = {
        name: trade.offered.name,
        type: trade.offered.type,
        imageUrl: trade.offered.imageUrl,
        set: trade.offered.set || "",
        quantity: 1,
        shiny: trade.offered.shiny,
        notes: `Trocado com ${trade.trainer}`
      };
    } else {
      collection.push({
        name: trade.offered.name,
        type: trade.offered.type,
        imageUrl: trade.offered.imageUrl,
        set: trade.offered.set || "",
        quantity: 1,
        shiny: trade.offered.shiny,
        notes: `Trocado com ${trade.trainer}`
      });
      for (let s = 0; s < 11; s++) collection.push(null);
    }
  }

  await saveCollection(collection);

  // 3. Sincronizar coleção do outro treinador
  let otherCollection;
  if (isFirebaseActive) {
    try {
      const doc = await db.collection("collections").doc(trade.trainer).get();
      otherCollection = doc.exists ? doc.data().slots : new Array(36).fill(null);
    } catch (e) {
      console.error("Erro ao obter coleção do outro treinador no Firestore:", e);
    }
  } else {
    const otherUserCollectionKey = `pokenot_collection_${trade.trainer}`;
    otherCollection = JSON.parse(localStorage.getItem(otherUserCollectionKey));
  }
  
  if (otherCollection) {
    // Retirar a carta do outro
    const otherCardIdx = trade.offered.userSlotIndex !== undefined 
      ? trade.offered.userSlotIndex 
      : otherCollection.findIndex(c => c && c.name.toLowerCase() === trade.offered.name.toLowerCase() && c.shiny === trade.offered.shiny);

    if (otherCardIdx !== -1 && otherCollection[otherCardIdx]) {
      otherCollection[otherCardIdx].quantity -= 1;
      if (otherCollection[otherCardIdx].quantity <= 0) {
        otherCollection[otherCardIdx] = null;
      }
    }

    // Colocar a sua carta que ele queria na coleção dele
    const otherMatchIdx = otherCollection.findIndex(c => c && c.name.toLowerCase() === myTradedCard.name.toLowerCase() && c.shiny === myTradedCard.shiny);
    if (otherMatchIdx !== -1) {
      otherCollection[otherMatchIdx].quantity += 1;
    } else {
      const otherEmptyIdx = otherCollection.indexOf(null);
      if (otherEmptyIdx !== -1) {
        otherCollection[otherEmptyIdx] = {
          name: myTradedCard.name,
          type: myTradedCard.type,
          imageUrl: myTradedCard.imageUrl || "https://images.pokemontcg.io/cardback.png",
          set: myTradedCard.set || "",
          quantity: 1,
          shiny: myTradedCard.shiny,
          notes: `Trocado com ${currentUser}`
        };
      }
    }
    
    if (isFirebaseActive) {
      try {
        await db.collection("collections").doc(trade.trainer).set({ slots: otherCollection });
      } catch (e) {
        console.error("Erro ao salvar coleção do outro treinador no Firestore:", e);
      }
    } else {
      const otherUserCollectionKey = `pokenot_collection_${trade.trainer}`;
      localStorage.setItem(otherUserCollectionKey, JSON.stringify(otherCollection));
    }
  }

  // 4. Fechar negócio no Mercado
  await dbCompleteTrade(tradeId, trade);

  await loadTradeTab();
  showToast(`Troca concluída! Você recebeu ${trade.offered.name}.`, "success");
}

/* ==========================================================================
   TOAST POPUP FEEDBACK SYSTEM
   ========================================================================== */
function showToast(message, type = "info") {
  const container = document.getElementById("toast-container");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  let icon = "fa-circle-info";
  if (type === "success") icon = "fa-circle-check";
  if (type === "error") icon = "fa-circle-xmark";
  if (type === "warning") icon = "fa-triangle-exclamation";
  if (type === "danger") icon = "fa-trash";

  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span></span>
  `;
  toast.querySelector("span").textContent = message;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Abre a página de pesquisa da LigaPokémon para a carta atual em nova aba
function searchOnLigaPokemon() {
  const name = document.getElementById("edit-card-name").value.trim();
  const number = document.getElementById("edit-card-number").value.trim();
  
  if (!name) {
    showToast("Nome do card é obrigatório para pesquisar na LigaPokémon.", "warning");
    return;
  }
  
  let searchTerm = name;
  if (number) {
    searchTerm += " " + number;
  }
  
  const url = `https://www.ligapokemon.com.br/?view=cards/card&search=${encodeURIComponent(searchTerm)}`;
  window.open(url, "_blank");
}

/* ==========================================================================
   CONFIGURAÇÕES, PRIVACIDADE & HISTÓRICO DE LOGS
   ========================================================================== */

// Registra uma atividade no histórico de logs do usuário
// Registra uma atividade no histórico de logs do usuário
async function addLogEntry(actionType, message, targetUser = currentUser) {
  const users = await dbGetUsers();
  if (!users[targetUser]) return;
  if (!users[targetUser].logs) users[targetUser].logs = [];
  
  const timestamp = new Date().toLocaleString("pt-BR");
  users[targetUser].logs.unshift({
    timestamp,
    action: actionType.toLowerCase(),
    message
  });
  
  // Limitar histórico para as últimas 50 ações
  if (users[targetUser].logs.length > 50) {
    users[targetUser].logs = users[targetUser].logs.slice(0, 50);
  }
  
  await dbSaveUser(targetUser, users[targetUser]);
}

// Salva a alteração da privacidade do fichário público/privado
async function togglePrivacySetting() {
  const toggle = document.getElementById("settings-privacy-toggle");
  const users = await dbGetUsers();
  const user = users[currentUser];
  
  if (user) {
    user.allowPublicView = toggle.checked;
    await dbSaveUser(currentUser, user);
    
    const statusText = toggle.checked ? "público (compartilhado)" : "privado (oculto)";
    await addLogEntry("sistema", `Configuração de privacidade alterada para ${statusText}.`);
    showToast(`Seu fichário agora está ${statusText}!`, "success");
  }
}

// Altera a senha do usuário
async function handleChangePassword(e) {
  e.preventDefault();
  const currentPwd = document.getElementById("settings-current-password").value;
  const newPwd = document.getElementById("settings-new-password").value;
  const confirmPwd = document.getElementById("settings-confirm-password").value;
  
  const users = await dbGetUsers();
  const user = users[currentUser];
  
  if (!user) {
    showToast("Erro ao carregar usuário.", "error");
    return;
  }
  
  const hashedCurrent = await hashPassword(currentPwd);
  if (user.password !== hashedCurrent && user.password !== currentPwd) {
    showToast("Senha atual incorreta.", "error");
    return;
  }
  
  if (newPwd !== confirmPwd) {
    showToast("A nova senha e a confirmação não coincidem.", "error");
    return;
  }
  
  const hashedNew = await hashPassword(newPwd);
  user.password = hashedNew;
  await dbSaveUser(currentUser, user);
  
  document.getElementById("form-change-password").reset();
  await addLogEntry("sistema", "Senha de acesso alterada com sucesso.");
  await loadSettingsTab();
  showToast("Senha atualizada com sucesso!", "success");
}

// Esvazia os logs de atividades do usuário
async function clearUserLogs() {
  if (confirm("Tem certeza que deseja limpar todo o seu histórico de atividades?")) {
    const users = await dbGetUsers();
    const user = users[currentUser];
    if (user) {
      user.logs = [
        {
          timestamp: new Date().toLocaleString("pt-BR"),
          action: "sistema",
          message: "Histórico de atividades limpo."
        }
      ];
      await dbSaveUser(currentUser, user);
      await loadSettingsTab();
      showToast("Histórico de logs limpo.", "warning");
    }
  }
}

// Atualiza o painel de configurações
async function loadSettingsTab() {
  const users = await dbGetUsers();
  const user = users[currentUser] || {};
  
  // 1. Atualizar Informações de Perfil
  const profileAvatar = document.getElementById("settings-profile-avatar");
  const profileFullName = document.getElementById("settings-profile-fullname");
  const profileEmail = document.getElementById("settings-profile-email");
  const profileType = document.getElementById("settings-profile-type");
  
  if (profileFullName) profileFullName.textContent = user.fullName || currentUser;
  if (profileEmail) profileEmail.textContent = user.email || "Sem e-mail conectado";
  
  if (profileType) {
    if (user.isGoogleUser) {
      profileType.textContent = "Conta Google";
      profileType.className = "account-type-badge google-badge";
      profileType.style.background = "rgba(219, 68, 85, 0.15)";
      profileType.style.color = "#f87171";
      profileType.style.borderColor = "rgba(219, 68, 85, 0.3)";
    } else {
      profileType.textContent = "Conta Local";
      profileType.className = "account-type-badge";
      profileType.style.background = "rgba(59, 130, 246, 0.15)";
      profileType.style.color = "#60a5fa";
      profileType.style.borderColor = "rgba(59, 130, 246, 0.3)";
    }
  }
  
  if (profileAvatar) {
    if (user.avatarUrl) {
      profileAvatar.innerHTML = `<img src="${escapeHTML(user.avatarUrl)}" alt="Avatar" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; display: block;">`;
      profileAvatar.style.padding = "0";
    } else {
      profileAvatar.textContent = currentUser.substring(0, 1).toUpperCase();
      profileAvatar.innerHTML = currentUser.substring(0, 1).toUpperCase();
      profileAvatar.style.padding = ""; // Resetar preenchimento
    }
  }

  // Ocultar/Exibir formulário de alteração de senha dependendo do tipo de login
  const passwordSection = document.getElementById("settings-password-section");
  const googleNotice = document.getElementById("settings-google-notice");
  
  if (user.isGoogleUser) {
    if (passwordSection) passwordSection.classList.add("hidden");
    if (googleNotice) googleNotice.classList.remove("hidden");
  } else {
    if (passwordSection) passwordSection.classList.remove("hidden");
    if (googleNotice) googleNotice.classList.add("hidden");
  }

  // 2. Atualizar switch de privacidade
  const privacyToggle = document.getElementById("settings-privacy-toggle");
  if (privacyToggle) {
    privacyToggle.checked = user.allowPublicView || false;
  }
  
  // 3. Renderizar feed de logs
  const logsList = document.getElementById("settings-logs-list");
  if (logsList) {
    logsList.innerHTML = "";
    const logs = user.logs || [];
    
    if (logs.length === 0) {
      logsList.innerHTML = `<p class="empty-text" style="padding: 1rem;">Nenhuma atividade registrada.</p>`;
      return;
    }
    
    logs.forEach(log => {
      const logItem = document.createElement("div");
      logItem.className = "log-item";
      
      const badgeClass = log.action ? log.action.toLowerCase() : "sistema";
      
      logItem.innerHTML = `
        <div class="log-item-header">
          <span class="log-badge ${escapeHTML(badgeClass)}">${escapeHTML(badgeClass)}</span>
          <span class="log-time">${escapeHTML(log.timestamp)}</span>
        </div>
        <div class="log-msg">${escapeHTML(log.message)}</div>
      `;
      logsList.appendChild(logItem);
    });
  }
}

/* ==========================================================================
   COMUNIDADE & VISUALIZAÇÃO DE FICHÁRIOS
   ========================================================================== */

// Carrega os treinadores públicos da Comunidade
async function loadCommunityTab() {
  const grid = document.getElementById("community-trainers-grid");
  if (!grid) return;
  grid.innerHTML = "";

  const users = await dbGetUsers();
  const trainers = [];

  // Adicionar usuários reais com privacidade ativa
  for (const username of Object.keys(users)) {
    if (username !== currentUser && users[username].allowPublicView) {
      const collection = await getCollection(username);
      const totalCards = collection.reduce((acc, card) => acc + (card ? parseInt(card.quantity || 1) : 0), 0);
      
      trainers.push({
        username: username,
        avatar: username.substring(0, 1).toUpperCase(),
        totalCards: totalCards
      });
    }
  }

  // Atualizar contador da comunidade
  document.getElementById("stats-public-trainers").textContent = `${trainers.length} Compartilhado${trainers.length !== 1 ? 's' : ''}`;

  if (trainers.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1" class="empty-text">Nenhum fichário público compartilhado no momento.</div>`;
    return;
  }

  trainers.forEach(trainer => {
    const card = document.createElement("div");
    card.className = "trainer-card";
    
    card.innerHTML = `
      <div class="trainer-card-avatar">${escapeHTML(trainer.avatar)}</div>
      <div class="trainer-card-name">${escapeHTML(trainer.username)}</div>
      <div class="trainer-card-stats">${trainer.totalCards} Card${trainer.totalCards !== 1 ? 's' : ''} no Fichário</div>
      <button class="btn btn-sm btn-primary" onclick="viewTrainerBinder('${escapeHTML(trainer.username)}')">
        Visualizar Fichário <i class="fa-solid fa-book-open"></i>
      </button>
    `;
    grid.appendChild(card);
  });
}

// Redireciona a visualização para o Fichário no modo leitura
function viewTrainerBinder(username) {
  viewedUser = username;
  
  // Atualizar e exibir banner de modo leitura
  document.getElementById("readonly-trainer-name").textContent = username;
  document.getElementById("binder-readonly-banner").classList.remove("hidden");
  
  // Ocultar botão Organizar
  const organizeBtn = document.querySelector("#screen-binder .toolbar-left button");
  if (organizeBtn) organizeBtn.style.display = "none";
  
  currentPage = 1;
  switchTab("binder");
  showToast(`Visualizando o fichário público de ${username}`, "info");
}

// Sai do modo leitura e volta para Comunidade
function exitReadonlyBinder() {
  viewedUser = null;
  document.getElementById("binder-readonly-banner").classList.add("hidden");
  
  // Re-exibir botão Organizar
  const organizeBtn = document.querySelector("#screen-binder .toolbar-left button");
  if (organizeBtn) organizeBtn.style.display = "inline-flex";
  
  switchTab("community");
}
