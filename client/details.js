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
const detailNomeFantasia = document.getElementById('detailNomeFantasia');
const detailIeEmitente = document.getElementById('detailIeEmitente');
const detailSituacaoCadastral = document.getElementById('detailSituacaoCadastral');
const detailDataAbertura = document.getElementById('detailDataAbertura');
const detailCapitalSocial = document.getElementById('detailCapitalSocial');
const detailNaturezaJuridica = document.getElementById('detailNaturezaJuridica');
const detailEndereco = document.getElementById('detailEndereco');
const detailCep = document.getElementById('detailCep');
const detailMunicipio = document.getElementById('detailMunicipio');
const detailUf = document.getElementById('detailUf');
const detailTelefone = document.getElementById('detailTelefone');
const detailEmail = document.getElementById('detailEmail');
const itensDetailTableBody = document.querySelector('#itensDetailTable tbody');
const totalNota = document.getElementById('totalNota');
const viewSefazBtn = document.getElementById('viewSefazBtn');

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

function formatCNPJ(cnpj) {
    if (!cnpj) return '-';
    // Remove formatação existente
    const cnpjLimpo = cnpj.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) return cnpj;
    // Aplica máscara XX.XXX.XXX/XXXX-XX
    return cnpjLimpo.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

// --- Função para construir URL da SEFAZ ---
function buildSefazUrl(nota) {
    if (!nota) return null;
    
    const chave = nota.chave ? nota.chave.trim() : '';
    const versao = nota.versao ? nota.versao.trim() : '';
    const ambiente = nota.ambiente ? nota.ambiente.trim() : '';
    const cIdToken = nota.cIdToken ? nota.cIdToken.trim() : '';
    const vSig = nota.vSig ? nota.vSig.trim() : '';
    
    // Verifica se todos os campos necessários estão presentes
    if (!chave || !versao || !ambiente || !cIdToken || !vSig) {
        console.warn('Campos necessários para URL da SEFAZ não encontrados:', {
            chave: chave || 'VAZIO',
            versao: versao || 'VAZIO',
            ambiente: ambiente || 'VAZIO',
            cIdToken: cIdToken || 'VAZIO',
            vSig: vSig || 'VAZIO'
        });
        return null;
    }
    
    // Constrói a URL seguindo a regra especificada
    const url = `https://www.sefaz.mt.gov.br/nfce/consultanfce?p=${chave}|${versao}|${ambiente}|${cIdToken}|${vSig}`;
    return url;
}

function formatCEP(cep) {
    if (!cep) return '-';
    // Remove formatação existente
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return cep;
    // Aplica máscara XXXXX-XXX
    return cepLimpo.replace(/^(\d{5})(\d{3})$/, '$1-$2');
}

function formatPhone(phone) {
    if (!phone) return '-';
    // Remove formatação existente
    const phoneLimpo = phone.replace(/\D/g, '');
    if (phoneLimpo.length === 11) {
        // Aplica máscara (XX) XXXXX-XXXX
        return phoneLimpo.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
    } else if (phoneLimpo.length === 10) {
        // Aplica máscara (XX) XXXX-XXXX
        return phoneLimpo.replace(/^(\d{2})(\d{4})(\d{4})$/, '($1) $2-$3');
    }
    return phone;
}

function formatDateOnly(dateString) {
    if (!dateString) return '-';
    const options = { year: 'numeric', month: '2-digit', day: '2-digit' };
    return new Date(dateString).toLocaleDateString('pt-BR', options);
}

function getSituacaoBadge(situacao) {
    if (!situacao) return '-';
    
    const situacaoLower = situacao.toLowerCase();
    let badgeClass = 'badge-neutral';
    
    if (situacaoLower.includes('ativa')) {
        badgeClass = 'badge-success';
    } else if (situacaoLower.includes('suspensa') || situacaoLower.includes('inativa')) {
        badgeClass = 'badge-danger';
    } else if (situacaoLower.includes('baixada')) {
        badgeClass = 'badge-warning';
    }
    
    return `<span class="badge ${badgeClass}">${situacao}</span>`;
}

function calculateTotal(itens) {
    if (!itens || !Array.isArray(itens)) return 0;
    
    let total = 0;
    itens.forEach(item => {
        if (item.valorTotal) {
            // Converte formato brasileiro para decimal
            const valorLimpo = String(item.valorTotal).replace(/\s/g, '').replace(',', '.');
            const num = parseFloat(valorLimpo);
            if (!isNaN(num)) {
                total += num;
            }
        }
    });
    
    return total;
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

        const response = await fetch(`/api/notas/detalhes/${id}`);
        console.log(response);
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
        showError('Erro ao Carregar', `Não foi possível carregar os detalhes: ${error.message}`);
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

    // Dados básicos do emitente
    detailCnpjEmitente.textContent = formatCNPJ(nota.cnpjEmitente);
    detailNomeEmitente.textContent = nota.nomeEmitente || '-';
    detailNomeFantasia.textContent = nota.nomeFantasia || '-';
    detailIeEmitente.textContent = nota.ieEmitente || '-';
    
    // Dados enriquecidos do CNPJ
    detailSituacaoCadastral.innerHTML = getSituacaoBadge(nota.situacaoCadastral);
    detailDataAbertura.textContent = formatDateOnly(nota.dataAbertura);
    detailCapitalSocial.textContent = formatCurrency(nota.capitalSocial);
    detailNaturezaJuridica.textContent = nota.naturezaJuridica || '-';
    
    // Dados de endereço
    detailEndereco.textContent = nota.endereco || '-';
    detailCep.textContent = formatCEP(nota.cep);
    detailMunicipio.textContent = nota.municipio || '-';
    detailUf.textContent = nota.uf || '-';
    
    // Dados de contato
    detailTelefone.textContent = formatPhone(nota.telefone);
    detailEmail.textContent = nota.email || '-';

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
        
        // Calcula e exibe o total da nota
        const total = calculateTotal(nota.itens);
        totalNota.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    } else {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6">Nenhum item encontrado para esta nota.</td>`;
        itensDetailTableBody.appendChild(row);
        
        // Define total como zero quando não há itens
        totalNota.textContent = 'R$ 0,00';
    }

    // Configura o botão da SEFAZ
    const sefazUrl = buildSefazUrl(nota);
    if (sefazUrl) {
        viewSefazBtn.style.display = 'inline-block';
        viewSefazBtn.disabled = false;
        viewSefazBtn.onclick = () => {
            window.open(sefazUrl, '_blank');
        };
    } else {
        viewSefazBtn.style.display = 'none';
        viewSefazBtn.disabled = true;
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