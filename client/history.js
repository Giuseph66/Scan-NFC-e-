// client/history.js

// --- Referências aos elementos do DOM ---
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const refreshBtn = document.getElementById('refreshBtn');
const historyTableBody = document.querySelector('#historyTable tbody');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');

// --- Variáveis de estado ---
let currentPage = 1;
const itemsPerPage = 10; // Deve ser consistente com o backend
let totalPages = 1;
let currentSearchTerm = '';
let allNotas = []; // Armazena todas as notas para filtro local
let filteredNotas = []; // Notas filtradas
let searchTimeoutId;
const SEARCH_DELAY = 500; // 500ms de delay

// --- Funções de Utilidade ---
function formatDate(dateString) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('pt-BR', options);
}

function truncateString(str, maxLen = 30) {
    if (!str) return '-';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

// --- Funções de API ---
async function fetchAllNotas() {
    try {
        // Busca todas as notas sem paginação para filtro local
        const response = await fetch('/api/notas?limit=1000'); // Limite alto para pegar todas
        if (!response.ok) throw new Error(`Erro ao buscar notas: ${response.status}`);

        const data = await response.json();
        allNotas = data.notas || [];
        return allNotas;
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        showError('Erro ao Carregar', `Não foi possível carregar o histórico: ${error.message}`);
        return [];
    }
}

function filterNotas(searchTerm) {
    if (!searchTerm.trim()) {
        filteredNotas = [...allNotas];
    } else {
        const term = searchTerm.toLowerCase();
        filteredNotas = allNotas.filter(nota => 
            (nota.nomeEmitente && nota.nomeEmitente.toLowerCase().includes(term)) ||
            (nota.chave && nota.chave.toLowerCase().includes(term))
        );
    }
    
    // Atualiza paginação baseada nos resultados filtrados
    totalPages = Math.ceil(filteredNotas.length / itemsPerPage);
    currentPage = 1; // Reset para primeira página ao filtrar
    
    renderFilteredTable();
    updatePagination();
}

function renderFilteredTable() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const notasToShow = filteredNotas.slice(startIndex, endIndex);
    
    renderTable(notasToShow);
}

function updatePagination() {
    pageInfo.textContent = `Página ${currentPage} de ${totalPages} (${filteredNotas.length} notas)`;

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages || totalPages === 0;
}

function renderTable(notas) {
    historyTableBody.innerHTML = ''; // Limpa a tabela

    if (notas.length === 0) {
        const message = currentSearchTerm ? 
            `Nenhuma NFC-e encontrada para "${currentSearchTerm}".` : 
            'Nenhuma NFC-e encontrada.';
        historyTableBody.innerHTML = `<tr><td colspan="5">${message}</td></tr>`;
        return;
    }

    notas.forEach(nota => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${nota.id}</td>
            <td>${truncateString(nota.chave, 20)}</td>
            <td>${truncateString(nota.nomeEmitente)}</td>
            <td>${formatDate(nota.createdAt)}</td>
            <td>
                <button class="view-btn" data-id="${nota.id}">Ver Detalhes</button>
            </td>
        `;
        historyTableBody.appendChild(row);
    });

    // Adiciona event listeners aos botões de "Ver Detalhes"
    document.querySelectorAll('.view-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const id = e.target.getAttribute('data-id');
            window.location.href = `details.html?id=${id}`; // Redireciona para a página de detalhes
        });
    });
}

// Função de debounce para busca
function debounceSearch() {
    clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => {
        currentSearchTerm = searchInput.value.trim();
        filterNotas(currentSearchTerm);
    }, SEARCH_DELAY);
}

// --- Event Listeners ---
searchBtn.addEventListener('click', () => {
    currentSearchTerm = searchInput.value.trim();
    filterNotas(currentSearchTerm);
});

searchInput.addEventListener('input', debounceSearch);

searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        renderFilteredTable();
        updatePagination();
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        renderFilteredTable();
        updatePagination();
    }
});

// Botão de refresh para verificar novas notas
refreshBtn.addEventListener('click', async () => {
    refreshBtn.disabled = true;
    refreshBtn.textContent = '🔄 Verificando...';
    
    try {
        // Força verificação de novas notas
        if (typeof checkNewNotas === 'function') {
            await checkNewNotas();
        }
        
        // Recarrega todas as notas
        await fetchAllNotas();
        filterNotas(currentSearchTerm);
        
        showSuccess('Lista Atualizada', 'Histórico atualizado com sucesso!');
    } catch (error) {
        console.error('Erro ao atualizar:', error);
        showError('Erro ao Atualizar', 'Não foi possível atualizar a lista.');
    } finally {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Atualizar';
    }
});

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    await fetchAllNotas();
    filterNotas(currentSearchTerm);
});