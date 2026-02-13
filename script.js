// Importações do Firebase (v9 modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Configuração do Firebase (suas credenciais)
const firebaseConfig = {
  apiKey: "AIzaSyDp2zZ3t-UqUWUWA1HBhtuJ7R3OKCiXsGo",
  authDomain: "stockcontrol-a2cbd.firebaseapp.com",
  projectId: "stockcontrol-a2cbd",
  storageBucket: "stockcontrol-a2cbd.firebasestorage.app",
  messagingSenderId: "239590677778",
  appId: "1:239590677778:web:03b3a2e31221f7476fa7cb",
  measurementId: "G-11GSQSYHKP"
};

// Inicializa Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// ---------- AGUARDAR DOM CARREGAR ----------
document.addEventListener('DOMContentLoaded', async function() {
  // ---------- CONSTANTES ----------
  const SECRETARIAS = {
    saude: 'Saúde',
    educacao: 'Educação',
    obras: 'Obras',
    assistencia: 'Assistência Social',
    agricola: 'Agricultura',
    administracao: 'Coordenação Geral'
  };
  const LOW_STOCK_THRESHOLD = 5;
  const UNIDADES = ['UND', 'CX', 'PCT', 'FD'];

  // ---------- CLASSE PRINCIPAL (Firestore) ----------
  class EstoqueApp {
    constructor() {
      this.usuarioLogado = null;
      this.secretariaAtual = 'saude';
      this.produtos = [];           // cache local
      this.itensBaixa = [];          // cache local (pendentes)
      this.logs = [];                // cache local
      this.searchTerm = '';
      this.sortBy = 'nome';
      this.sortDirection = 'asc';
      this.currentPage = 1;
      this.pageSize = 8;
      this.filtroData = '';
    }

    // ----- CARREGAR TODOS OS DADOS DO FIRESTORE -----
    async iniciar() {
      await this.carregarProdutos();
      await this.carregarBaixasPendentes();
      await this.carregarLogs();
    }

    async carregarProdutos() {
      try {
        const querySnapshot = await getDocs(collection(db, "PRODUTOS"));
        this.produtos = [];
        querySnapshot.forEach((doc) => {
          this.produtos.push({ id: doc.id, ...doc.data() });
        });
        console.log("Produtos carregados:", this.produtos.length);
      } catch (error) {
        console.error("Erro ao carregar produtos:", error);
        alert("Erro ao carregar produtos: " + error.message);
      }
    }

    async carregarBaixasPendentes() {
      try {
        const querySnapshot = await getDocs(collection(db, "BAIXAS PENDENTES"));
        this.itensBaixa = [];
        querySnapshot.forEach((doc) => {
          this.itensBaixa.push({ id: doc.id, ...doc.data() });
        });
        console.log("Baixas pendentes carregadas:", this.itensBaixa.length);
      } catch (error) {
        console.error("Erro ao carregar baixas pendentes:", error);
        alert("Erro ao carregar baixas pendentes: " + error.message);
      }
    }

    async carregarLogs() {
      try {
        const querySnapshot = await getDocs(query(collection(db, "LOGS"), orderBy("timestamp", "desc")));
        this.logs = [];
        querySnapshot.forEach((doc) => {
          this.logs.push({ id: doc.id, ...doc.data() });
        });
        console.log("Logs carregados:", this.logs.length);
      } catch (error) {
        console.error("Erro ao carregar logs:", error);
        alert("Erro ao carregar logs: " + error.message);
      }
    }

    // ----- USUÁRIOS (coleção "cadastro" com campos "nome" e "senha") -----
    async verificarUsuario(nome, senha) {
      try {
        console.log(`Verificando usuário: ${nome} / ${senha}`);
        const q = query(
          collection(db, "cadastro"),
          where("nome", "==", nome),
          where("senha", "==", senha)
        );
        const snapshot = await getDocs(q);
        console.log("Documentos encontrados:", snapshot.size);
        if (!snapshot.empty) {
          snapshot.forEach(doc => console.log("Usuário encontrado:", doc.id, doc.data()));
        }
        return !snapshot.empty;
      } catch (error) {
        console.error("Erro na verificação de usuário:", error);
        if (error.code === 'failed-precondition') {
          alert("Erro de índice! Por favor, acesse o console do Firebase e crie o índice composto para a coleção 'cadastro' com os campos 'nome' e 'senha'.");
        } else {
          alert("Erro ao verificar usuário: " + error.message);
        }
        return false;
      }
    }

    async registrarUsuario(nome, senha) {
      try {
        // Verifica se já existe
        const q = query(collection(db, "cadastro"), where("nome", "==", nome));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) return false;

        await addDoc(collection(db, "cadastro"), {
          nome,
          senha,
          sistema: "almoxarifado", // campo adicional opcional
          criadoEm: Timestamp.now()
        });
        console.log(`Usuário ${nome} cadastrado com sucesso.`);
        return true;
      } catch (error) {
        console.error("Erro ao registrar usuário:", error);
        alert("Erro ao cadastrar usuário: " + error.message);
        return false;
      }
    }

    // Garante que o usuário padrão exista
    async garantirUsuarioPadrao() {
      try {
        const q = query(collection(db, "cadastro"), where("nome", "==", "valdeni"));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          console.log("Usuário padrão não encontrado. Criando...");
          await addDoc(collection(db, "cadastro"), {
            nome: "valdeni",
            senha: "Valdeni1", // exatamente como no print
            sistema: "almoxarifado",
            criadoEm: Timestamp.now()
          });
          console.log("Usuário padrão criado: valdeni / Valdeni1");
        } else {
          console.log("Usuário padrão já existe.");
        }
      } catch (error) {
        console.error("Erro ao garantir usuário padrão:", error);
        alert("Erro ao criar usuário padrão: " + error.message);
      }
    }

    // ----- LOGS -----
    async adicionarLog(secretaria, acao, detalhes) {
      try {
        const log = {
          timestamp: Timestamp.now(),
          usuario: this.usuarioLogado || 'sistema',
          secretaria,
          acao,
          detalhes
        };
        const docRef = await addDoc(collection(db, "LOGS"), log);
        this.logs.unshift({ id: docRef.id, ...log });
      } catch (error) {
        console.error("Erro ao adicionar log:", error);
      }
    }

    getLogsPorSecretaria(secretaria) {
      return this.logs.filter(l => l.secretaria === secretaria);
    }

    // ----- PRODUTOS -----
    async adicionarProduto(secretaria, nome, quantidade, unidade) {
      try {
        const produto = {
          secretaria,
          nome,
          quantidade,
          unidade,
          criadoEm: Timestamp.now()
        };
        const docRef = await addDoc(collection(db, "PRODUTOS"), produto);
        this.produtos.push({ id: docRef.id, ...produto });
        await this.adicionarLog(secretaria, 'CADASTRO', `Produto "${nome}" (${quantidade} ${unidade})`);
        return produto;
      } catch (error) {
        console.error("Erro ao adicionar produto:", error);
        alert("Erro ao adicionar produto: " + error.message);
      }
    }

    async editarProduto(id, nome, quantidade, unidade) {
      try {
        const prodRef = doc(db, "PRODUTOS", id);
        const produtoAntigo = this.produtos.find(p => p.id === id);
        if (!produtoAntigo) return;

        await updateDoc(prodRef, {
          nome,
          quantidade,
          unidade,
          atualizadoEm: Timestamp.now()
        });

        produtoAntigo.nome = nome;
        produtoAntigo.quantidade = quantidade;
        produtoAntigo.unidade = unidade;

        await this.adicionarLog(produtoAntigo.secretaria, 'EDIÇÃO',
          `Produto alterado: ${produtoAntigo.nome} → ${nome} (${quantidade} ${unidade})`);
      } catch (error) {
        console.error("Erro ao editar produto:", error);
        alert("Erro ao editar produto: " + error.message);
      }
    }

    async excluirProduto(id) {
      try {
        const produto = this.produtos.find(p => p.id === id);
        if (!produto) return;

        await deleteDoc(doc(db, "PRODUTOS", id));

        // Remove também de baixas pendentes que referenciam este produto
        const baixasParaRemover = this.itensBaixa.filter(b => b.produtoId === id);
        for (let b of baixasParaRemover) {
          await deleteDoc(doc(db, "BAIXAS PENDENTES", b.id));
        }
        this.itensBaixa = this.itensBaixa.filter(b => b.produtoId !== id);
        this.produtos = this.produtos.filter(p => p.id !== id);

        await this.adicionarLog(produto.secretaria, 'EXCLUSÃO',
          `Produto "${produto.nome}" (${produto.quantidade} ${produto.unidade}) removido`);
      } catch (error) {
        console.error("Erro ao excluir produto:", error);
        alert("Erro ao excluir produto: " + error.message);
      }
    }

    async adicionarQuantidade(id, incremento) {
      try {
        const produto = this.produtos.find(p => p.id === id);
        if (!produto) return;

        const novaQtd = produto.quantidade + incremento;
        await updateDoc(doc(db, "PRODUTOS", id), { quantidade: novaQtd });
        produto.quantidade = novaQtd;
        await this.adicionarLog(produto.secretaria, 'ENTRADA',
          `+${incremento} ${produto.unidade} em "${produto.nome}"`);
      } catch (error) {
        console.error("Erro ao adicionar quantidade:", error);
        alert("Erro ao adicionar quantidade: " + error.message);
      }
    }

    // ----- BAIXAS PENDENTES -----
    async adicionarBaixa(produtoId, secretaria, nome, quantidade, unidade) {
      try {
        // Verifica se já existe pendência para este produto
        const existente = this.itensBaixa.find(b => b.produtoId === produtoId && b.secretaria === secretaria);
        if (existente) {
          // Atualiza a quantidade
          const baixaRef = doc(db, "BAIXAS PENDENTES", existente.id);
          await updateDoc(baixaRef, { quantidade });
          existente.quantidade = quantidade;
        } else {
          const baixa = {
            produtoId,
            secretaria,
            nome,
            quantidade,
            unidade,
            criadoEm: Timestamp.now()
          };
          const docRef = await addDoc(collection(db, "BAIXAS PENDENTES"), baixa);
          this.itensBaixa.push({ id: docRef.id, ...baixa });
        }
      } catch (error) {
        console.error("Erro ao adicionar baixa:", error);
        alert("Erro ao adicionar baixa: " + error.message);
      }
    }

    async removerBaixa(baixaId) {
      try {
        await deleteDoc(doc(db, "BAIXAS PENDENTES", baixaId));
        this.itensBaixa = this.itensBaixa.filter(b => b.id !== baixaId);
      } catch (error) {
        console.error("Erro ao remover baixa:", error);
        alert("Erro ao remover baixa: " + error.message);
      }
    }

    async confirmarBaixas(secretaria) {
      try {
        const itensParaConfirmar = this.itensBaixa.filter(b => b.secretaria === secretaria);
        let total = 0;

        for (let item of itensParaConfirmar) {
          const produto = this.produtos.find(p => p.id === item.produtoId);
          if (produto && produto.quantidade >= item.quantidade) {
            // Reduz estoque
            const novaQtd = produto.quantidade - item.quantidade;
            await updateDoc(doc(db, "PRODUTOS", produto.id), { quantidade: novaQtd });
            produto.quantidade = novaQtd;

            // Registra log
            await this.adicionarLog(secretaria, 'BAIXA',
              `Produto "${item.nome}" (${item.quantidade} ${item.unidade}) retirado do estoque`);

            // Remove baixa pendente
            await deleteDoc(doc(db, "BAIXAS PENDENTES", item.id));
            total++;
          }
        }

        // Atualiza cache removendo as confirmadas
        this.itensBaixa = this.itensBaixa.filter(b => b.secretaria !== secretaria);
        return total;
      } catch (error) {
        console.error("Erro ao confirmar baixas:", error);
        alert("Erro ao confirmar baixas: " + error.message);
        return 0;
      }
    }

    // ----- FILTROS E PAGINAÇÃO -----
    getProdutosFiltrados(secretaria) {
      let lista = this.produtos.filter(p => p.secretaria === secretaria);
      if (this.searchTerm) {
        const term = this.searchTerm.toLowerCase();
        lista = lista.filter(p => p.nome.toLowerCase().includes(term));
      }
      lista.sort((a, b) => {
        let valA = a[this.sortBy];
        let valB = b[this.sortBy];
        if (this.sortBy === 'quantidade') {
          valA = Number(valA);
          valB = Number(valB);
        } else {
          valA = String(valA).toLowerCase();
          valB = String(valB).toLowerCase();
        }
        if (valA < valB) return this.sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
      return lista;
    }

    getBaixasPorData(secretaria, dataISO) {
      if (!dataISO) return [];
      const inicio = new Date(dataISO);
      inicio.setHours(0, 0, 0, 0);
      const fim = new Date(dataISO);
      fim.setHours(23, 59, 59, 999);

      return this.logs.filter(log =>
        log.secretaria === secretaria &&
        log.acao === 'BAIXA' &&
        log.timestamp.toDate() >= inicio &&
        log.timestamp.toDate() <= fim
      );
    }

    getTotalProdutos() { return this.produtos.length; }
    getTotalItens() { return this.produtos.reduce((acc, p) => acc + p.quantidade, 0); }

    temProdutosNaSecretaria(secretaria) {
      return this.produtos.some(p => p.secretaria === secretaria);
    }

    temBaixasNaSecretaria(secretaria) {
      return this.logs.some(l => l.secretaria === secretaria && l.acao === 'BAIXA');
    }
  }

  // ---------- UI ----------
  class UI {
    constructor(app) {
      this.app = app;
      this.modal = document.getElementById('modal');
      this.modalTitle = document.getElementById('modalTitle');
      this.modalBody = document.getElementById('modalBody');
      this.notification = document.getElementById('notification');
      this.notifText = document.getElementById('notificationText');
      this.debounceTimer = null;
    }

    notificar(msg, tipo = 'success') {
      this.notification.className = 'notification';
      this.notification.classList.add(tipo);
      this.notifText.innerText = msg;
      this.notification.classList.add('show');
      const icon = this.notification.querySelector('i');
      if (tipo === 'success') icon.className = 'fas fa-check-circle';
      else if (tipo === 'error') icon.className = 'fas fa-exclamation-circle';
      else icon.className = 'fas fa-info-circle';
      setTimeout(() => this.notification.classList.remove('show'), 3000);
    }

    abrirModal(titulo, conteudoHTML) {
      this.modalTitle.innerHTML = `<i class="fas fa-${titulo.includes('Editar') ? 'edit' : titulo.includes('Usuário') ? 'user-plus' : 'info'}"></i> ${titulo}`;
      this.modalBody.innerHTML = conteudoHTML;
      this.modal.style.display = 'flex';
    }

    fecharModal() {
      this.modal.style.display = 'none';
    }

    refresh() {
      this.atualizarTabela();
      this.atualizarEstatisticas();
      this.atualizarPainelBaixa();
      this.atualizarBotoesCondicionais();
      this.atualizarFiltroData();
      const nomeSpan = document.getElementById('nomeSecretariaAtual');
      if (nomeSpan) nomeSpan.innerText = SECRETARIAS[this.app.secretariaAtual];
      const cadastroSec = document.getElementById('cadastroSecretaria');
      if (cadastroSec) cadastroSec.value = this.app.secretariaAtual;
    }

    atualizarBotoesCondicionais() {
      const container = document.getElementById('acoesSecretariaContainer');
      if (this.app.temProdutosNaSecretaria(this.app.secretariaAtual)) {
        container.classList.remove('hidden');
      } else {
        container.classList.add('hidden');
      }
    }

    atualizarFiltroData() {
      const container = document.getElementById('dataFiltroContainer');
      if (this.app.temBaixasNaSecretaria(this.app.secretariaAtual)) {
        container.classList.remove('hidden');
      } else {
        container.classList.add('hidden');
      }
    }

    atualizarTabela() {
      const tbody = document.getElementById('tableBody');
      const emptyMsg = document.getElementById('emptyMessage');
      const produtosSec = this.app.getProdutosFiltrados(this.app.secretariaAtual);
      
      const totalPages = Math.ceil(produtosSec.length / this.app.pageSize) || 1;
      if (this.app.currentPage > totalPages) this.app.currentPage = totalPages;
      const start = (this.app.currentPage - 1) * this.app.pageSize;
      const pageItems = produtosSec.slice(start, start + this.app.pageSize);

      tbody.innerHTML = '';
      if (produtosSec.length === 0) {
        emptyMsg.classList.remove('hidden');
      } else {
        emptyMsg.classList.add('hidden');
        pageItems.forEach(prod => {
          const naLista = this.app.itensBaixa.some(b => b.produtoId === prod.id && b.secretaria === this.app.secretariaAtual);
          const lowStock = prod.quantidade <= LOW_STOCK_THRESHOLD;
          const row = document.createElement('tr');
          row.className = lowStock ? 'low-stock' : '';
          row.innerHTML = `
            <td style="padding: 12px; font-weight: 500;">${prod.nome}</td>
            <td style="padding: 12px;"><strong>${prod.quantidade}</strong></td>
            <td style="padding: 12px;">${prod.unidade}</td>
            <td style="padding: 12px; display: flex; gap: 6px;">
              <button class="btn btn-sm" data-action="editar" data-id="${prod.id}" style="background: #fbbf24; color: black; padding: 6px 12px; border-radius: 6px;"><i class="fas fa-edit"></i></button>
              <button class="btn btn-sm" data-action="adicionar" data-id="${prod.id}" style="background: var(--primary); color: white; padding: 6px 12px; border-radius: 6px;"><i class="fas fa-plus"></i></button>
              <button class="btn btn-sm" data-action="baixa" data-id="${prod.id}" style="background: ${naLista ? 'var(--success)' : 'var(--danger)'}; color: white; padding: 6px 12px; border-radius: 6px;">
                <i class="fas ${naLista ? 'fa-check' : 'fa-minus-circle'}"></i>
              </button>
              <button class="btn btn-sm" data-action="excluir" data-id="${prod.id}" style="background: var(--danger); color: white; padding: 6px 12px; border-radius: 6px;"><i class="fas fa-trash"></i></button>
            </td>
          `;
          tbody.appendChild(row);
        });
      }

      document.getElementById('pageInfo').innerText = `Página ${this.app.currentPage} de ${totalPages}`;
      document.getElementById('prevPage').disabled = this.app.currentPage <= 1;
      document.getElementById('nextPage').disabled = this.app.currentPage >= totalPages;
    }

    atualizarEstatisticas() {
      document.getElementById('totalProdutos').innerText = this.app.getTotalProdutos();
      document.getElementById('totalItens').innerText = this.app.getTotalItens();
    }

    atualizarPainelBaixa() {
      const panel = document.getElementById('baixaPanel');
      const container = document.getElementById('baixaListaContainer');
      const itens = this.app.itensBaixa.filter(b => b.secretaria === this.app.secretariaAtual);
      
      if (itens.length === 0) {
        panel.classList.add('hidden');
        return;
      }
      panel.classList.remove('hidden');
      container.innerHTML = itens.map(item => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #fef3c7; border-radius: 8px; margin-bottom: 8px;">
          <span><strong>${item.nome}</strong> (${item.quantidade} ${item.unidade})</span>
          <button class="btn btn-sm btn-danger" data-action="removerBaixa" data-id="${item.id}" style="background: var(--danger); color: white; border: none; padding: 6px 12px; border-radius: 6px;">
            <i class="fas fa-times"></i>
          </button>
        </div>
      `).join('');
    }
  }

  // ---------- INSTÂNCIA GLOBAL ----------
  const appEstoque = new EstoqueApp();
  const ui = new UI(appEstoque);

  // ---------- GARANTIR USUÁRIO PADRÃO ANTES DE QUALQUER COISA ----------
  await appEstoque.garantirUsuarioPadrao();

  // ---------- CONTROLE DE LOGIN ----------
  async function verificarLogin() {
    const usuarioLogado = localStorage.getItem('almoxarifado_usuario');
    if (usuarioLogado) {
      // Verifica se o usuário ainda existe no Firestore
      try {
        const q = query(collection(db, "cadastro"), where("nome", "==", usuarioLogado));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          appEstoque.usuarioLogado = usuarioLogado;
          document.getElementById('loginScreen').style.display = 'none';
          document.getElementById('mainSystem').classList.remove('hidden');
          document.getElementById('loggedUser').innerText = usuarioLogado;
          await appEstoque.iniciar();
          ui.refresh();
          return;
        }
      } catch (error) {
        console.error("Erro ao verificar login salvo:", error);
      }
    }
    // Se não estiver logado, mostra tela de login
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainSystem').classList.add('hidden');
  }

  // ---------- EVENT LISTENERS ----------
  function bindEvents() {
    // LOGIN
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = document.getElementById('username').value.trim();
      const senha = document.getElementById('password').value;
      const valido = await appEstoque.verificarUsuario(nome, senha);
      if (valido) {
        localStorage.setItem('almoxarifado_usuario', nome);
        appEstoque.usuarioLogado = nome;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainSystem').classList.remove('hidden');
        document.getElementById('loggedUser').innerText = nome;
        await appEstoque.iniciar();
        ui.notificar('Login realizado com sucesso!', 'success');
        ui.refresh();
      } else {
        ui.notificar('Credenciais inválidas. Tente "valdeni" / "Valdeni1".', 'error');
      }
    });

    // LOGOUT
    document.getElementById('logoutBtn').addEventListener('click', () => {
      localStorage.removeItem('almoxarifado_usuario');
      document.getElementById('loginScreen').style.display = 'flex';
      document.getElementById('mainSystem').classList.add('hidden');
      appEstoque.usuarioLogado = null;
    });

    // CADASTRO DE NOVO USUÁRIO
    document.getElementById('cadastrarUsuarioBtn').addEventListener('click', () => {
      ui.abrirModal('Cadastrar Novo Usuário', `
        <div class="form-group">
          <label>Nome de usuário</label>
          <input type="text" id="novoUsername" class="w-100" placeholder="ex: joao.silva">
        </div>
        <div class="form-group">
          <label>Senha</label>
          <input type="password" id="novaSenha" class="w-100" placeholder="********">
        </div>
        <div class="form-group">
          <label>Confirmar senha</label>
          <input type="password" id="confirmSenha" class="w-100" placeholder="********">
        </div>
        <button id="salvarUsuarioBtn" class="btn btn-success w-100">
          <i class="fas fa-save"></i> Cadastrar
        </button>
      `);

      document.getElementById('salvarUsuarioBtn').addEventListener('click', async function handler() {
        const nome = document.getElementById('novoUsername').value.trim();
        const senha = document.getElementById('novaSenha').value;
        const confirm = document.getElementById('confirmSenha').value;

        if (!nome || !senha) {
          ui.notificar('Preencha todos os campos', 'error');
          return;
        }
        if (senha !== confirm) {
          ui.notificar('As senhas não coincidem', 'error');
          return;
        }
        const registrado = await appEstoque.registrarUsuario(nome, senha);
        if (registrado) {
          ui.notificar('Usuário cadastrado com sucesso!', 'success');
          ui.fecharModal();
        } else {
          ui.notificar('Nome de usuário já existe', 'error');
        }
      }, { once: true });
    });

    // TABS (secretarias)
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        this.classList.add('active');
        appEstoque.secretariaAtual = this.dataset.sec;
        appEstoque.currentPage = 1;
        ui.refresh();
      });
    });

    // CADASTRAR PRODUTO
    document.getElementById('btnCadastrar').addEventListener('click', async () => {
      const sec = document.getElementById('cadastroSecretaria').value;
      const nome = document.getElementById('produtoNome').value.trim();
      const qtd = parseInt(document.getElementById('produtoQtd').value, 10);
      const unidade = document.getElementById('produtoUnidade').value;
      if (!nome) return ui.notificar('Digite o nome do produto', 'error');
      if (qtd < 1) return ui.notificar('Quantidade mínima é 1', 'error');
      
      // Verifica se já existe (case insensitive)
      const existe = appEstoque.produtos.find(p => p.secretaria === sec && p.nome.toLowerCase() === nome.toLowerCase());
      if (existe) {
        if (confirm(`Produto "${nome}" já existe. Deseja somar ${qtd} unidades?`)) {
          await appEstoque.adicionarQuantidade(existe.id, qtd);
          ui.notificar(`${qtd} unidades adicionadas`, 'success');
          ui.refresh();
        }
      } else {
        await appEstoque.adicionarProduto(sec, nome, qtd, unidade);
        ui.notificar('Produto cadastrado com sucesso!', 'success');
        document.getElementById('produtoNome').value = '';
        document.getElementById('produtoQtd').value = 1;
        ui.refresh();
      }
    });

    // PESQUISA
    document.getElementById('searchInput').addEventListener('input', (e) => {
      clearTimeout(ui.debounceTimer);
      ui.debounceTimer = setTimeout(() => {
        appEstoque.searchTerm = e.target.value;
        appEstoque.currentPage = 1;
        ui.atualizarTabela();
      }, 300);
    });

    // ORDENAÇÃO
    document.getElementById('sortNome').addEventListener('click', () => {
      appEstoque.sortBy = 'nome';
      appEstoque.sortDirection = appEstoque.sortDirection === 'asc' ? 'desc' : 'asc';
      ui.refresh();
    });
    document.getElementById('sortQtd').addEventListener('click', () => {
      appEstoque.sortBy = 'quantidade';
      appEstoque.sortDirection = appEstoque.sortDirection === 'asc' ? 'desc' : 'asc';
      ui.refresh();
    });

    // PAGINAÇÃO
    document.getElementById('prevPage').addEventListener('click', () => {
      if (appEstoque.currentPage > 1) { appEstoque.currentPage--; ui.atualizarTabela(); }
    });
    document.getElementById('nextPage').addEventListener('click', () => {
      const total = Math.ceil(appEstoque.getProdutosFiltrados(appEstoque.secretariaAtual).length / appEstoque.pageSize);
      if (appEstoque.currentPage < total) { appEstoque.currentPage++; ui.atualizarTabela(); }
    });

    // DELEGAÇÃO DE EVENTOS NA TABELA (ações)
    document.getElementById('tableBody').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const action = btn.dataset.action;
      const id = btn.dataset.id; // id é string (Firestore)
      const produto = appEstoque.produtos.find(p => p.id === id);
      if (!produto) return;

      if (action === 'editar') {
        ui.abrirModal('Editar Produto', `
          <div class="form-group">
            <label>Nome</label>
            <input type="text" id="editNome" value="${produto.nome}" class="w-100">
          </div>
          <div style="display: flex; gap: 12px;">
            <div style="flex:2;">
              <label>Quantidade</label>
              <input type="number" id="editQtd" value="${produto.quantidade}" min="0" class="w-100">
            </div>
            <div style="flex:1;">
              <label>Unidade</label>
              <select id="editUnidade" class="w-100">
                ${UNIDADES.map(u => `<option value="${u}" ${produto.unidade === u ? 'selected' : ''}>${u}</option>`).join('')}
              </select>
            </div>
          </div>
          <button id="saveEditBtn" class="btn btn-primary w-100" style="margin-top: 24px; padding: 14px;">Salvar alterações</button>
        `);
        document.getElementById('saveEditBtn').addEventListener('click', async function handler() {
          const novoNome = document.getElementById('editNome').value.trim();
          const novaQtd = parseInt(document.getElementById('editQtd').value, 10);
          const novaUnidade = document.getElementById('editUnidade').value;
          if (!novoNome || isNaN(novaQtd) || novaQtd < 0) return ui.notificar('Preencha corretamente', 'error');
          await appEstoque.editarProduto(id, novoNome, novaQtd, novaUnidade);
          ui.fecharModal();
          ui.notificar('Produto atualizado', 'success');
          ui.refresh();
        }, { once: true });
      }
      else if (action === 'adicionar') {
        const addQtd = prompt('Quantidade a adicionar:', '1');
        if (addQtd) {
          const inc = parseInt(addQtd, 10);
          if (!isNaN(inc) && inc > 0) {
            await appEstoque.adicionarQuantidade(id, inc);
            ui.notificar(`+${inc} unidades adicionadas`, 'success');
            ui.refresh();
          }
        }
      }
      else if (action === 'baixa') {
        const naLista = appEstoque.itensBaixa.some(b => b.produtoId === id && b.secretaria === appEstoque.secretariaAtual);
        if (naLista) {
          // Encontrar o id da baixa pendente
          const baixa = appEstoque.itensBaixa.find(b => b.produtoId === id && b.secretaria === appEstoque.secretariaAtual);
          if (baixa) {
            await appEstoque.removerBaixa(baixa.id);
            ui.notificar('Removido da lista de baixa', 'success');
            ui.refresh();
          }
        } else {
          ui.abrirModal('Agendar Baixa', `
            <p><strong>${produto.nome}</strong> - Estoque: ${produto.quantidade} ${produto.unidade}</p>
            <div class="form-group">
              <label>Quantidade para baixa</label>
              <input type="number" id="baixaQtd" min="1" max="${produto.quantidade}" value="1" class="w-100">
            </div>
            <button id="confirmarBaixaBtn" class="btn btn-primary w-100" style="margin-top: 24px; padding: 14px;">Adicionar à lista</button>
          `);
          document.getElementById('confirmarBaixaBtn').addEventListener('click', async function handler() {
            const qtdBaixa = parseInt(document.getElementById('baixaQtd').value, 10);
            if (qtdBaixa > produto.quantidade) return ui.notificar('Quantidade maior que estoque', 'error');
            if (qtdBaixa < 1) return ui.notificar('Quantidade inválida', 'error');
            await appEstoque.adicionarBaixa(id, appEstoque.secretariaAtual, produto.nome, qtdBaixa, produto.unidade);
            ui.fecharModal();
            ui.notificar('Adicionado à lista de baixa', 'success');
            ui.refresh();
          }, { once: true });
        }
      }
      else if (action === 'excluir') {
        if (confirm(`Excluir ${produto.nome} permanentemente?`)) {
          await appEstoque.excluirProduto(id);
          ui.notificar('Produto excluído', 'success');
          ui.refresh();
        }
      }
    });

    // REMOVER BAIXA VIA PAINEL
    document.getElementById('baixaListaContainer').addEventListener('click', async (e) => {
      const btn = e.target.closest('button');
      if (btn && btn.dataset.action === 'removerBaixa') {
        const id = btn.dataset.id;
        await appEstoque.removerBaixa(id);
        ui.notificar('Removido da lista de baixa', 'success');
        ui.refresh();
      }
    });

    // BOTÃO GERAR REQUISIÇÃO
    document.getElementById('btnGerarRequisicao').addEventListener('click', () => {
      const itens = appEstoque.itensBaixa.filter(b => b.secretaria === appEstoque.secretariaAtual);
      if (itens.length === 0) return ui.notificar('Nenhum item na lista', 'error');
      
      const data = new Date();
      const conteudo = `
        <div style="text-align: center; margin-bottom: 20px;">
          <h3>REQUISIÇÃO DE BAIXA</h3>
          <p><strong>Secretaria:</strong> ${SECRETARIAS[appEstoque.secretariaAtual]}</p>
          <p><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')} - ${data.toLocaleTimeString('pt-BR')}</p>
          <p><strong>Responsável:</strong> ${document.getElementById('loggedUser').innerText}</p>
        </div>
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Produto</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Quantidade</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Unidade</th></tr></thead>
          <tbody>
            ${itens.map(i => `<tr><td style="padding:8px;">${i.nome}</td><td style="padding:8px;">${i.quantidade}</td><td style="padding:8px;">${i.unidade}</td></tr>`).join('')}
          </tbody>
        </table>
        <div style="margin-top: 40px; display: flex; justify-content: space-between;">
          <span>________________________<br>Assinatura solicitante</span>
          <span>________________________<br>Assinatura almoxarife</span>
        </div>
        <div style="margin-top: 30px; display: flex; gap: 10px;">
          <button id="imprimirReqBtn" class="btn btn-primary" style="flex: 1; background: var(--primary); color: white; padding: 12px;"><i class="fas fa-print"></i> Imprimir</button>
          <button id="confirmarBaixasBtn" class="btn btn-success" style="flex: 3; background: var(--success); color: white; padding: 12px;"><i class="fas fa-check-circle"></i> Confirmar todas as baixas</button>
        </div>
      `;
      ui.abrirModal('Requisição de Baixa', conteudo);
      
      document.getElementById('imprimirReqBtn').addEventListener('click', () => window.print(), { once: true });
      document.getElementById('confirmarBaixasBtn').addEventListener('click', async () => {
        const total = await appEstoque.confirmarBaixas(appEstoque.secretariaAtual);
        ui.fecharModal();
        ui.notificar(`${total} baixa(s) confirmadas`, 'success');
        ui.refresh();
      }, { once: true });
    });

    // FECHAR MODAL
    document.getElementById('closeModalBtn').addEventListener('click', () => ui.fecharModal());
    window.addEventListener('click', (e) => { if (e.target === ui.modal) ui.fecharModal(); });

    // RELATÓRIO DA SECRETARIA
    document.getElementById('btnRelatorio').addEventListener('click', () => {
      const produtos = appEstoque.getProdutosFiltrados(appEstoque.secretariaAtual);
      if (produtos.length === 0) return ui.notificar('Nenhum produto para relatório', 'error');
      const linhas = produtos.map(p => `<tr><td style="padding:8px;">${p.nome}</td><td style="padding:8px;">${p.quantidade}</td><td style="padding:8px;">${p.unidade}</td></tr>`).join('');
      ui.abrirModal(`Relatório - ${SECRETARIAS[appEstoque.secretariaAtual]}`, `
        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Produto</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Quantidade</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Unidade</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        <button id="printRelBtn" class="btn btn-primary w-100" style="margin-top: 24px; padding: 14px;"><i class="fas fa-print"></i> Imprimir</button>
      `);
      document.getElementById('printRelBtn').addEventListener('click', () => window.print(), { once: true });
    });

    // LIMPAR ESTOQUE
    document.getElementById('btnLimparEstoque').addEventListener('click', () => {
      const nomeSec = SECRETARIAS[appEstoque.secretariaAtual];
      ui.abrirModal(`Limpar Estoque - ${nomeSec}`, `
        <p style="font-size: 1.1rem; margin-bottom: 20px;">
          <i class="fas fa-exclamation-triangle" style="color: var(--warning);"></i>
          Tem certeza que deseja apagar TODO o estoque da secretaria <strong>${nomeSec}</strong>?
        </p>
        <p style="margin-bottom: 16px;">Esta ação não pode ser desfeita.</p>
        <div style="margin-bottom: 24px;">
          <label style="display: flex; align-items: center; gap: 12px; font-weight: normal;">
            <input type="checkbox" id="confirmClearCheckbox">
            <span>Sim, eu entendo e desejo continuar.</span>
          </label>
        </div>
        <button id="btnConfirmClear" class="btn btn-danger w-100" disabled style="padding: 14px;">
          <i class="fas fa-trash-alt"></i> Limpar Estoque
        </button>
      `);
      const chk = document.getElementById('confirmClearCheckbox');
      const btnConfirm = document.getElementById('btnConfirmClear');
      chk.addEventListener('change', () => {
        btnConfirm.disabled = !chk.checked;
      });
      btnConfirm.addEventListener('click', async () => {
        // Remove todos os produtos da secretaria atual
        const produtosParaRemover = appEstoque.produtos.filter(p => p.secretaria === appEstoque.secretariaAtual);
        for (let prod of produtosParaRemover) {
          await deleteDoc(doc(db, "PRODUTOS", prod.id));
        }
        // Remove baixas pendentes da secretaria
        const baixasParaRemover = appEstoque.itensBaixa.filter(b => b.secretaria === appEstoque.secretariaAtual);
        for (let b of baixasParaRemover) {
          await deleteDoc(doc(db, "BAIXAS PENDENTES", b.id));
        }
        // Atualiza caches
        appEstoque.produtos = appEstoque.produtos.filter(p => p.secretaria !== appEstoque.secretariaAtual);
        appEstoque.itensBaixa = appEstoque.itensBaixa.filter(b => b.secretaria !== appEstoque.secretariaAtual);
        await appEstoque.adicionarLog(appEstoque.secretariaAtual, 'LIMPEZA', `Todo o estoque da secretaria ${nomeSec} foi removido`);
        ui.fecharModal();
        ui.notificar(`Estoque da ${nomeSec} limpo com sucesso!`, 'success');
        ui.refresh();
      }, { once: true });
    });

    // VISUALIZAR LOG DA SECRETARIA
    document.getElementById('btnVisualizarLog').addEventListener('click', () => {
      const logs = appEstoque.getLogsPorSecretaria(appEstoque.secretariaAtual);
      if (logs.length === 0) {
        ui.notificar('Nenhum log encontrado para esta secretaria', 'info');
        return;
      }
      const linhas = logs.map(log => {
        const data = log.timestamp.toDate().toLocaleString('pt-BR');
        return `<tr>
          <td style="padding:8px;">${data}</td>
          <td style="padding:8px;">${log.usuario}</td>
          <td style="padding:8px;">${log.acao}</td>
          <td style="padding:8px;">${log.detalhes}</td>
        </tr>`;
      }).join('');
      ui.abrirModal(`Log de Atividades - ${SECRETARIAS[appEstoque.secretariaAtual]}`, `
        <div style="max-height: 400px; overflow-y: auto;">
          <table style="width:100%; border-collapse:collapse; font-size: 0.9rem;">
            <thead>
              <tr><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Data/Hora</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Usuário</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Ação</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Detalhes</th></tr>
            </thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
      `);
    });

    // FILTRO POR DATA
    const filtroData = document.getElementById('filtroData');
    if (filtroData) {
      filtroData.addEventListener('change', (e) => {
        appEstoque.filtroData = e.target.value;
        const btnContainer = document.getElementById('btnRelatorioBaixaContainer');
        if (appEstoque.filtroData) {
          const [ano, mes, dia] = appEstoque.filtroData.split('-');
          document.getElementById('dataSelecionadaSpan').innerText = `${dia}/${mes}/${ano}`;
          btnContainer.style.display = 'block';
        } else {
          btnContainer.style.display = 'none';
        }
      });
    }

    // BOTÃO RELATÓRIO DE BAIXA NO DIA
    document.getElementById('btnRelatorioBaixa').addEventListener('click', () => {
      if (!appEstoque.filtroData) return;
      const baixas = appEstoque.getBaixasPorData(appEstoque.secretariaAtual, appEstoque.filtroData);
      if (baixas.length === 0) {
        ui.notificar('Nenhuma baixa registrada nesta data', 'info');
        return;
      }
      const linhas = baixas.map(b => {
        return `<tr><td style="padding:8px;">${b.timestamp.toDate().toLocaleTimeString('pt-BR')}</td><td style="padding:8px;">${b.detalhes}</td></tr>`;
      }).join('');
      ui.abrirModal(`Relatório de Baixas - ${SECRETARIAS[appEstoque.secretariaAtual]}`, `
        <p><strong>Data:</strong> ${new Date(appEstoque.filtroData).toLocaleDateString('pt-BR')}</p>
        <div style="max-height: 400px; overflow-y: auto; margin-top: 16px;">
          <table style="width:100%; border-collapse:collapse;">
            <thead><tr><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Horário</th><th style="border-bottom:1px solid #e2e8f0; padding:8px;">Descrição</th></tr></thead>
            <tbody>${linhas}</tbody>
          </table>
        </div>
        <button id="printBaixaRelBtn" class="btn btn-primary w-100" style="margin-top: 24px; padding: 14px;"><i class="fas fa-print"></i> Imprimir</button>
      `);
      document.getElementById('printBaixaRelBtn').addEventListener('click', () => window.print(), { once: true });
    });
  }

  // Inicialização
  await verificarLogin();
  bindEvents();
});