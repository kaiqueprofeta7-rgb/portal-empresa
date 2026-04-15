// ============================================================
// CONFIGURAÇÃO SUPABASE
// ============================================================
// IMPORTANTE: Nunca coloque as credenciais diretamente aqui.
// Crie um arquivo config.js separado (listado no .gitignore)
// com o seguinte conteúdo:
//
//   const SB_URL = "https://SEU_PROJETO.supabase.co";
//   const SB_KEY = "sua_chave_publishable_aqui";
//
// E inclua no HTML ANTES de auth.js:
//   <script src="config.js"></script>
//
// O arquivo config.js nunca deve ser enviado ao GitHub.
// Adicione ao .gitignore:
//   config.js

if (typeof SB_URL === 'undefined' || typeof SB_KEY === 'undefined') {
    console.error('[auth.js] config.js não encontrado ou variáveis SB_URL/SB_KEY não definidas.');
}

const _supabase = supabase.createClient(SB_URL, SB_KEY);

// ============================================================
// INICIALIZAÇÃO — DOMContentLoaded
// ============================================================
document.addEventListener("DOMContentLoaded", function () {
    const path = window.location.pathname;
    const isLoginPage = path.includes('index.html') || path === '/' || path.endsWith('/');

    // Aplica o tema salvo
    if (localStorage.getItem('theme') === 'dark') {
        document.documentElement.classList.add('dark');
        document.body.classList.add('dark');
    }

    // Página de login: apenas vincula o botão de tema e encerra
    if (isLoginPage) {
        const themeBtn = document.getElementById('theme-btn');
        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const isDark = document.documentElement.classList.contains('dark');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
            });
        }
        return;
    }

    // Páginas internas: verifica sessão e carrega sidebar
    const user = verificarSessao();
    if (!user) {
        window.location.href = 'index.html';
        return;
    }

    const sidebarPlaceholder = document.getElementById('sidebar-placeholder');
    if (sidebarPlaceholder) {
        fetch('sidebar.html')
            .then(r => r.text())
            .then(html => {
                sidebarPlaceholder.innerHTML = html;
                if (typeof inicializarMenu === 'function') inicializarMenu();
                aplicarPermissoesSidebar(user);
            })
            .catch(err => console.error('[auth.js] Erro ao carregar sidebar:', err));
    }
});

// ============================================================
// LOGIN
// ============================================================
async function realizarLogin() {
    const loginInput = document.getElementById('login');
    const senhaInput = document.getElementById('senha');
    const msgLogin   = document.getElementById('msg-login');
    const btn        = document.querySelector('.signin .submit-button');

    if (!loginInput || !senhaInput) return;

    const userVal = loginInput.value.toLowerCase().trim();
    const passVal = senhaInput.value;

    if (!userVal || !passVal) {
        if (msgLogin) msgLogin.innerText = "Preencha todos os campos!";
        return;
    }

    if (btn) { btn.disabled = true; btn.innerText = "Aguarde..."; }

    try {
        const { data, error } = await _supabase.rpc('rpc_login_seguro', {
            p_login: userVal,
            p_senha: passVal
        });

        if (error) throw error;

        if (data && data[0] && data[0].valido) {
            localStorage.setItem('usuarioLogado', JSON.stringify(data[0].dados_usuario));
            window.location.href = 'inicio.html';
        } else {
            if (msgLogin) {
                msgLogin.innerText = "Usuário ou senha incorretos.";
                msgLogin.style.color = "var(--primary-color)";
            }
        }
    } catch (err) {
        console.error('[auth.js] Erro no login:', err);
        if (msgLogin) msgLogin.innerText = "Erro de conexão com o banco.";
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "Entrar no Sistema"; }
    }
}

// ============================================================
// CADASTRO
// ============================================================
async function cadastrarUsuario() {
    const loginInput  = document.getElementById('reg-login');
    const senhaInput  = document.getElementById('reg-senha');
    const msgCadastro = document.getElementById('msg-cadastro');
    const btn         = document.getElementById('btn-cadastro');

    if (!loginInput || !senhaInput) return;

    const login = loginInput.value.toLowerCase().trim();
    const senha = senhaInput.value;

    if (!login || !senha) {
        if (msgCadastro) {
            msgCadastro.innerText = "Preencha login e senha!";
            msgCadastro.style.color = "#f59e0b";
        }
        return;
    }

    if (btn) { btn.disabled = true; btn.innerText = "Registrando..."; }

    // Permissões NUNCA vêm do frontend.
    // Novos usuários são criados sem permissões — um admin as concede
    // depois pela tela de Configurações > Gestão de Usuários.
    const payload = {
        login:       login,
        senha:       senha,
        perm_agendar: false,
        perm_agenda:  false,
        perm_config:  false,
        data:         new Date().toISOString(),
        is_master:    false
    };

    const { error } = await _supabase.from('usuarios').insert([payload]);

    if (error) {
        // Erro 23505: login duplicado no Postgres
        if (error.code === "23505") {
            if (msgCadastro) {
                msgCadastro.innerText = "Este usuário já existe! Escolha outro nome.";
                msgCadastro.style.color = "#dc143c";
            }
            loginInput.focus();
        } else {
            if (msgCadastro) msgCadastro.innerText = "Erro: " + error.message;
        }
    } else {
        if (msgCadastro) {
            msgCadastro.innerText = "Usuário cadastrado com sucesso!";
            msgCadastro.style.color = "#10b981";
        }
        alert("Cadastro realizado! Aguarde um administrador liberar seu acesso.");
        window.location.reload();
    }

    if (btn) { btn.disabled = false; btn.innerText = "Registrar Conta"; }
}

// ============================================================
// SIDEBAR — PERMISSÕES E MENU
// ============================================================
function aplicarPermissoesSidebar(user) {
    const userDisplay = document.getElementById('user-display-name');
    if (userDisplay) userDisplay.innerText = user.login;

    // Acessa cada elemento com verificação de existência para evitar erros
    const navAgendar      = document.getElementById('nav-agendar');
    const navAgenda       = document.getElementById('nav-agenda');
    const navAgendaMensal = document.getElementById('nav-agenda-mensal');
    const navConfig       = document.getElementById('nav-config');

    if (navAgendar && user.perm_agendar)           navAgendar.style.display = 'block';
    if (navAgenda && user.perm_agenda)             navAgenda.style.display = 'block';
    if (navAgendaMensal && user.perm_agenda)       navAgendaMensal.style.display = 'block';
    if (navConfig && (user.perm_config || user.is_master)) navConfig.style.display = 'block';
}

function inicializarMenu() {
    const body      = document.querySelector('body');
    const sidebar   = body.querySelector('nav');
    const toggle    = body.querySelector('.toggle');
    const modeSwitch = body.querySelector('.toggle-switch');
    const modeText  = body.querySelector('.mode-text');

    if (toggle) toggle.addEventListener('click', () => sidebar.classList.toggle('close'));

    if (modeSwitch) {
        modeSwitch.addEventListener('click', () => {
            body.classList.toggle('dark');
            document.documentElement.classList.toggle('dark');
            const isDark = document.documentElement.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            if (modeText) modeText.innerText = isDark ? "Modo Claro" : "Modo Escuro";
        });
    }
}

// ============================================================
// LOGOUT E SESSÃO
// ============================================================
function fazerLogout() {
    localStorage.removeItem('usuarioLogado');
    window.location.href = 'index.html';
}

function verificarSessao() {
    return JSON.parse(localStorage.getItem('usuarioLogado'));
}

// Exporta funções para o escopo global (chamadas via HTML e outros scripts)
window.realizarLogin    = realizarLogin;
window.cadastrarUsuario = cadastrarUsuario;
window.fazerLogout      = fazerLogout;
window.verificarSessao  = verificarSessao;
