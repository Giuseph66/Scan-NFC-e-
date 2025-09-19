// client/history.js

// --- Referências aos elementos do DOM ---
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const historyTableBody = document.querySelector('#historyTable tbody');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageInfo = document.getElementById('pageInfo');

// --- Variáveis de estado ---
let currentPage = 1;
const itemsPerPage = 10; // Deve ser consistente com o backend
let totalPages = 1;
let currentSearchTerm = '';

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
async function fetchNotas(page = 1, searchTerm = '') {
    try {
        let url = `/api/notas?page=${page}&limit=${itemsPerPage}`;
        if (searchTerm) {
            // O backend ainda não suporta busca, mas podemos preparar a URL
            // url += `&search=${encodeURIComponent(searchTerm)}`;
            // Por enquanto, vamos ignorar o searchTerm no frontend também
            // e focar na paginação.
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Erro ao buscar notas: ${response.status}`);

        const data = await response.json();
        renderTable(data.notas);
        updatePagination(data);
    } catch (error) {
        console.error("Erro ao carregar histórico:", error);
        historyTableBody.innerHTML = `<tr><td colspan="5">Erro ao carregar dados: ${error.message}</td></tr>`;
    }
}

function renderTable(notas) {
    historyTableBody.innerHTML = ''; // Limpa a tabela

    if (notas.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="5">Nenhuma NFC-e encontrada.</td></tr>`;
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

function updatePagination(data) {
    currentPage = data.page;
    totalPages = data.pages;

    pageInfo.textContent = `Página ${currentPage} de ${totalPages}`;

    prevPageBtn.disabled = currentPage === 1;
    nextPageBtn.disabled = currentPage === totalPages;
}

// --- Event Listeners ---
searchBtn.addEventListener('click', () => {
    currentSearchTerm = searchInput.value.trim();
    currentPage = 1; // Reseta para a primeira página ao fazer uma nova busca
    fetchNotas(currentPage, currentSearchTerm);
});

searchInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        searchBtn.click();
    }
});

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) {
        currentPage--;
        fetchNotas(currentPage, currentSearchTerm);
    }
});

nextPageBtn.addEventListener('click', () => {
    if (currentPage < totalPages) {
        currentPage++;
        fetchNotas(currentPage, currentSearchTerm);
    }
});

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    fetchNotas(currentPage, currentSearchTerm);
});