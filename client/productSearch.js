// client/productSearch.js

// --- Referências aos elementos do DOM ---
const searchInput = document.getElementById('searchProductInput');
const productsTableBody = document.querySelector('#productsTable tbody');
const searchMessage = document.getElementById('searchMessage');

// --- Variáveis para debounce ---
let searchTimeoutId;
const SEARCH_DELAY = 300; // ms

// --- Funções de Utilidade ---
function formatCurrency(value) {
    if (value === null || value === undefined || value === '') return '-';
    // Converte formato brasileiro para decimal
    const valorLimpo = String(value).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(valorLimpo);
    if (isNaN(num)) return '-';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// --- Funções de API ---
async function searchProducts(term) {
    if (!term) {
        clearResults();
        return;
    }

    try {
        showMessage('Buscando produtos...', 'info');
        productsTableBody.innerHTML = ''; // Limpa resultados anteriores

        const response = await fetch(`/api/notas/itens/buscar?q=${encodeURIComponent(term)}`);
        
        if (!response.ok) {
            if (response.status === 400) {
                const data = await response.json();
                throw new Error(data.message);
            } else {
                throw new Error(`Erro na busca: ${response.status} ${response.statusText}`);
            }
        }

        const data = await response.json();
        
        if (data.itens.length === 0) {
            showMessage('Nenhum produto encontrado para o termo buscado.', 'info');
            productsTableBody.innerHTML = `<tr><td colspan="7">Nenhum produto encontrado.</td></tr>`;
            return;
        }

        renderTable(data.itens);
        showMessage(`Encontrados ${data.total} itens.`, 'success');
        showSuccess('Busca Concluída', `Encontrados ${data.total} produtos com o termo "${termo}"`);
    } catch (error) {
        console.error("Erro na busca:", error);
        showMessage(`Erro: ${error.message}`, 'error');
        productsTableBody.innerHTML = `<tr><td colspan="7">Erro ao buscar produtos: ${error.message}</td></tr>`;
        showError('Erro na Busca', `Não foi possível buscar produtos: ${error.message}`);
    }
}

function renderTable(itens) {
    productsTableBody.innerHTML = ''; // Limpa a tabela

    itens.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${item.descricao || '-'}</td>
            <td>${item.unidade || '-'}</td>
            <td>${formatCurrency(item.valorUnitario)}</td>
            <td>${item.emitente?.nome || '-'}</td> <!-- Nome da empresa -->
            <td>
                <a href="details.html?id=${item.notaFiscalId}" target="_blank">Ver Nota</a>
            </td>
        `;
        productsTableBody.appendChild(row);
    });
}

function showMessage(message, type = '') {
    searchMessage.textContent = message;
    searchMessage.className = 'status-message';
    if (type) {
        searchMessage.classList.add(type);
    }
    searchMessage.style.display = 'block';
}

function clearResults() {
    productsTableBody.innerHTML = '';
    searchMessage.style.display = 'none';
}

// --- Função de Debounce ---
function debounceSearch() {
    clearTimeout(searchTimeoutId);
    searchTimeoutId = setTimeout(() => {
        const term = searchInput.value.trim();
        searchProducts(term);
    }, SEARCH_DELAY);
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    searchInput.addEventListener('input', debounceSearch);
});