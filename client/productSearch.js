// client/productSearch.js

// --- Referências aos elementos do DOM ---
const searchInput = document.getElementById('searchProductInput');
const productsTableBody = document.querySelector('#productsTable tbody');
const searchMessage = document.getElementById('searchMessage');
const aiWarningBox = document.getElementById('aiWarningBox');

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
            productsTableBody.innerHTML = `<tr><td colspan="8">Nenhum produto encontrado.</td></tr>`;
            aiWarningBox.style.display = 'none';
            return;
        }

        renderTable(data.itens);
        
        // Verifica se há itens encontrados pela IA
        const hasAIMatches = data.itens.some(item => item.matchPorIA);
        aiWarningBox.style.display = hasAIMatches ? 'block' : 'none';
        
        showMessage(`Encontrados ${data.total} itens.`, 'success');
    } catch (error) {
        console.error("Erro na busca:", error);
        showMessage(`Erro: ${error.message}`, 'error');
        productsTableBody.innerHTML = `<tr><td colspan="8">Erro ao buscar produtos: ${error.message}</td></tr>`;
        showError('Erro na Busca', `Não foi possível buscar produtos: ${error.message}`);
    }
}

function renderTable(itens) {
    productsTableBody.innerHTML = ''; // Limpa a tabela

    itens.forEach(item => {
        const row = document.createElement('tr');
        
        // Se foi encontrado pelo nome padronizado, adiciona classe especial
        if (item.matchPorIA) {
            row.classList.add('ai-match');
        }
        
        // Monta as células com dados padronizados
        const nomePadronizado = item.nomePadronizado 
            ? `<span class="ai-data" title="Nome padronizado por IA">${item.nomePadronizado}</span>` 
            : '-';
        
        const marca = item.marca 
            ? `<span class="ai-data">${item.marca}</span>` 
            : '-';
        
        const categoria = item.categoria 
            ? `<span class="ai-data">${item.categoria}</span>` 
            : '-';
        
        // Monta a URL com o termo de busca atual e a descrição do item
        const searchTerm = searchInput.value.trim();
        const itemDesc = item.descricao || '';
        const detailsUrl = `details.html?id=${item.notaFiscalId}&search=${encodeURIComponent(itemDesc)}&item=${encodeURIComponent(itemDesc)}`;
        
        row.innerHTML = `
            <td>${item.descricao || '-'}</td>
            <td>${nomePadronizado}</td>
            <td>${marca}</td>
            <td>${categoria}</td>
            <td>${item.unidade || '-'}</td>
            <td>${formatCurrency(item.valorUnitario)}</td>
            <td>${item.emitente?.nome || '-'}</td>
            <td>
                <a href="${detailsUrl}">Ver Nota</a>
            </td>
        `;
        
        // Se foi match por IA, adiciona aviso visual
        if (item.matchPorIA) {
            const firstCell = row.querySelector('td:first-child');
            firstCell.innerHTML = `
                <div class="ai-match-indicator">
                    <span class="ai-badge">🤖 IA</span>
                    ${item.descricao || '-'}
                </div>
            `;
        }
        
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
    aiWarningBox.style.display = 'none';
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