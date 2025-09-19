// client/details.js

// --- Referências aos elementos do DOM ---
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const notaDetails = document.getElementById('notaDetails');
const detailId = document.getElementById('detailId');
const detailChave = document.getElementById('detailChave');
const detailVersao = document.getElementById('detailVersao');
const detailAmbiente = document.getElementById('detailAmbiente');
const detailCIdToken = document.getElementById('detailCIdToken');
const detailVSig = document.getElementById('detailVSig');
const detailCreatedAt = document.getElementById('detailCreatedAt');
const detailCnpjEmitente = document.getElementById('detailCnpjEmitente');
const detailNomeEmitente = document.getElementById('detailNomeEmitente');
const detailIeEmitente = document.getElementById('detailIeEmitente');
const itensDetailTableBody = document.querySelector('#itensDetailTable tbody');

// --- Funções de Utilidade ---
function formatDate(dateString) {
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    return new Date(dateString).toLocaleDateString('pt-BR', options);
}

function formatCurrency(value) {
    if (value === null || value === undefined || value === '') return '-';
    // Converte formato brasileiro para decimal
    const valorLimpo = String(value).replace(/\s/g, '').replace(',', '.');
    const num = parseFloat(valorLimpo);
    if (isNaN(num)) return '-';
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getNotaIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

// --- Funções de API ---
async function fetchNotaDetails(id) {
    try {
        loadingMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        notaDetails.style.display = 'none';

        const response = await fetch(`/api/notas/${id}`);
        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('NFC-e não encontrada.');
            } else {
                throw new Error(`Erro ao buscar detalhes: ${response.status} ${response.statusText}`);
            }
        }

        const nota = await response.json();
        displayNotaDetails(nota);
    } catch (error) {
        console.error("Erro ao carregar detalhes da nota:", error);
        loadingMessage.style.display = 'none';
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
    }
}

function displayNotaDetails(nota) {
    loadingMessage.style.display = 'none';
    
    detailId.textContent = nota.id;
    detailChave.textContent = nota.chave || '-';
    detailVersao.textContent = nota.versao || '-';
    detailAmbiente.textContent = nota.ambiente === '1' ? 'Produção' : (nota.ambiente === '2' ? 'Homologação' : nota.ambiente || '-');
    detailCIdToken.textContent = nota.cIdToken || '-';
    detailVSig.textContent = nota.vSig || '-';
    detailCreatedAt.textContent = nota.createdAt ? formatDate(nota.createdAt) : '-';

    detailCnpjEmitente.textContent = nota.cnpjEmitente || '-';
    detailNomeEmitente.textContent = nota.nomeEmitente || '-';
    detailIeEmitente.textContent = nota.ieEmitente || '-';

    // Limpa e popula a tabela de itens
    itensDetailTableBody.innerHTML = '';
    if (nota.itens && nota.itens.length > 0) {
        nota.itens.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.codigo || '-'}</td>
                <td>${item.descricao || '-'}</td>
                <td>${item.quantidade || '-'}</td>
                <td>${item.unidade || '-'}</td>
                <td>${formatCurrency(item.valorUnitario)}</td>
                <td>${formatCurrency(item.valorTotal)}</td>
            `;
            itensDetailTableBody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6">Nenhum item encontrado para esta nota.</td>`;
        itensDetailTableBody.appendChild(row);
    }

    notaDetails.style.display = 'block';
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    const notaId = getNotaIdFromUrl();
    if (notaId) {
        fetchNotaDetails(notaId);
    } else {
        loadingMessage.style.display = 'none';
        errorMessage.textContent = 'ID da NFC-e não fornecido na URL.';
        errorMessage.style.display = 'block';
    }
});