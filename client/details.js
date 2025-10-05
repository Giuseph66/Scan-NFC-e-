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
const rebuscaSection = document.getElementById('rebuscaSection');
const rebuscaBtn = document.getElementById('rebuscaBtn');
const rebuscaStatus = document.getElementById('rebuscaStatus');
const padronizarItensBtn = document.getElementById('padronizarItensBtn');
const toggleStdBtn = document.getElementById('toggleStdBtn');
const searchItemsInput = document.getElementById('searchItemsInput');
const searchItemsCounter = document.getElementById('searchItemsCounter');

// --- Variáveis globais ---
let allItems = []; // Armazena todos os itens para filtragem
let searchTimeout = null;
let isExpanded = false; // Estado de expansão dos campos padronizados
let currentNota = null; // Armazena a nota atual para referência

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

// Função para verificar se item corresponde à busca
function itemMatchesSearch(item, term) {
    if (!term) return true;
    
    // Campos básicos
    const basicText = `${item.codigo || ''} ${item.descricao || ''} ${item.quantidade || ''} ${item.unidade || ''} ${item.valorUnitario || ''} ${item.valorTotal || ''}`.toLowerCase();
    
    // Campos padronizados pela IA
    const aiText = `${item.tipoEmbalagem || ''} ${item.nomePadronizado || ''} ${item.marca || ''} ${item.quantidadePadronizada || ''} ${item.peso || ''} ${item.categoria || ''}`.toLowerCase();
    
    return basicText.includes(term) || aiText.includes(term);
}

// Função para verificar se o match foi nos campos da IA
function matchedInAIFields(item, term) {
    if (!term) return false;
    
    const aiText = `${item.tipoEmbalagem || ''} ${item.nomePadronizado || ''} ${item.marca || ''} ${item.quantidadePadronizada || ''} ${item.peso || ''} ${item.categoria || ''}`.toLowerCase();
    const basicText = `${item.codigo || ''} ${item.descricao || ''} ${item.quantidade || ''} ${item.unidade || ''} ${item.valorUnitario || ''} ${item.valorTotal || ''}`.toLowerCase();
    
    // Retorna true se encontrou nos campos da IA mas não nos campos básicos
    return aiText.includes(term) && !basicText.includes(term);
}

// Função para renderizar itens na tabela
function renderItems(items, searchTerm = '') {
    itensDetailTableBody.innerHTML = '';
    
    if (!items || items.length === 0) {
        const colspan = isExpanded ? 11 : 6;
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="${colspan}">Nenhum item encontrado.</td>`;
        itensDetailTableBody.appendChild(row);
        return;
    }
    
    const term = searchTerm.toLowerCase().trim();
    let matchedItems = [];
    let unmatchedItems = [];
    let hasAIMatch = false;
    
    // Separa itens que correspondem e que não correspondem à busca
    items.forEach(item => {
        if (itemMatchesSearch(item, term)) {
            matchedItems.push(item);
            // Verifica se algum match foi nos campos da IA
            if (matchedInAIFields(item, term)) {
                hasAIMatch = true;
            }
        } else {
            unmatchedItems.push(item);
        }
    });
    
    // Se encontrou match nos campos da IA e a tabela não está expandida, expande automaticamente
    if (hasAIMatch && !isExpanded && currentNota) {
        expandTable();
    }
    
    // Renderiza itens que correspondem primeiro
    matchedItems.forEach(item => {
        const row = document.createElement('tr');
        if (term) {
            row.classList.add('search-match');
        }
        row.innerHTML = `
            <td>${item.codigo || '-'}</td>
            <td>${item.descricao || '-'}</td>
            <td>${item.quantidade || '-'}</td>
            <td>${item.unidade || '-'}</td>
            <td>${formatCurrency(item.valorUnitario)}</td>
            <td>${formatCurrency(item.valorTotal)}</td>
        `;
        
        // Adiciona colunas padronizadas se expandido
        if (isExpanded) {
            const aiCells = [
                item.tipoEmbalagem || '-',
                item.nomePadronizado || '-',
                item.marca || '-',
                item.peso || '-',
                item.categoria || '-'
            ];
            aiCells.forEach(val => {
                const td = document.createElement('td');
                td.textContent = val;
                row.appendChild(td);
            });
        }
        
        itensDetailTableBody.appendChild(row);
    });
    
    // Renderiza itens que não correspondem depois
    unmatchedItems.forEach(item => {
        const row = document.createElement('tr');
        row.classList.add('search-no-match');
        row.innerHTML = `
            <td>${item.codigo || '-'}</td>
            <td>${item.descricao || '-'}</td>
            <td>${item.quantidade || '-'}</td>
            <td>${item.unidade || '-'}</td>
            <td>${formatCurrency(item.valorUnitario)}</td>
            <td>${formatCurrency(item.valorTotal)}</td>
        `;
        
        // Adiciona colunas padronizadas se expandido
        if (isExpanded) {
            const aiCells = [
                item.tipoEmbalagem || '-',
                item.nomePadronizado || '-',
                item.marca || '-',
                item.peso || '-',
                item.categoria || '-'
            ];
            aiCells.forEach(val => {
                const td = document.createElement('td');
                td.textContent = val;
                row.appendChild(td);
            });
        }
        
        itensDetailTableBody.appendChild(row);
    });
    
    // Atualiza contador
    if (term) {
        searchItemsCounter.textContent = `${matchedItems.length} de ${items.length} itens`;
    } else {
        searchItemsCounter.textContent = '';
    }
}

// Função para expandir a tabela (adiciona colunas da IA)
function expandTable() {
    const thead = document.querySelector('#itensDetailTable thead tr');
    if (!thead || isExpanded) return;
    
    // Adiciona cabeçalhos dos campos padronizados
    ['Tipo Emb.(IA)', 'Nome (IA)', 'Marca (IA)', 'Peso (IA)', 'Categoria (IA)'].forEach(text => {
        const th = document.createElement('th');
        th.textContent = text;
        thead.appendChild(th);
    });
    
    isExpanded = true;
    if (toggleStdBtn) {
        toggleStdBtn.textContent = 'Ocultar itens padronizados';
        toggleStdBtn.dataset.expanded = 'true';
    }
    if (padronizarItensBtn) {
        padronizarItensBtn.style.display = 'none';
    }
}

// Função para colapsar a tabela (remove colunas da IA)
function collapseTable() {
    const thead = document.querySelector('#itensDetailTable thead tr');
    if (!thead || !isExpanded) return;
    
    // Remove as 5 últimas colunas do thead
    for (let i = 0; i < 5; i++) {
        thead.lastElementChild && thead.removeChild(thead.lastElementChild);
    }
    
    isExpanded = false;
    if (toggleStdBtn) {
        toggleStdBtn.textContent = 'Mostrar itens padronizados';
        toggleStdBtn.dataset.expanded = 'false';
    }
    
    // Mantém visibilidade do botão de padronizar conforme existência de itens padronizados
    const hasAnyStd = Array.isArray(allItems) && allItems.some(it => it.tipoEmbalagem || it.nomePadronizado || it.marca || it.quantidadePadronizada || it.peso || it.categoria);
    if (padronizarItensBtn) {
        padronizarItensBtn.style.display = hasAnyStd ? 'none' : 'inline-block';
    }
}

// Função para filtrar itens com debounce
function filterItems() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const searchTerm = searchItemsInput.value;
        renderItems(allItems, searchTerm);
    }, 300); // 300ms de delay
}

function getNotaIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('id');
}

function getSearchParamsFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return {
        search: urlParams.get('search') || '',
        item: urlParams.get('item') || ''
    };
}

// --- Funções de Rebusca ---
async function rebuscarItens(notaId) {
    try {
        showRebuscaStatus('Buscando itens da nota na SEFAZ...', 'loading');
        rebuscaBtn.disabled = true;

        const response = await fetch(`/api/notas/rebuscar-itens/${notaId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || `Erro ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (result.success) {
            showRebuscaStatus(`✅ ${result.message}`, 'success');
            showSuccess('Rebusca Concluída', result.message);
            
            // Recarrega os detalhes da nota para mostrar os novos itens
            setTimeout(() => {
                fetchNotaDetails(notaId);
            }, 1500);
        } else {
            throw new Error(result.message || 'Erro desconhecido na rebusca');
        }

    } catch (error) {
        console.error('Erro na rebusca:', error);
        showRebuscaStatus(`❌ Erro: ${error.message}`, 'error');
        showError('Erro na Rebusca', `Não foi possível rebuscar os itens: ${error.message}`);
    } finally {
        rebuscaBtn.disabled = false;
    }
}

function showRebuscaStatus(message, type) {
    rebuscaStatus.textContent = message;
    rebuscaStatus.className = `rebusca-status ${type}`;
    rebuscaStatus.style.display = 'block';
}

function hideRebuscaStatus() {
    rebuscaStatus.style.display = 'none';
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

    // Armazena a nota atual globalmente
    currentNota = nota;
    
    // Limpa e popula a tabela de itens
    itensDetailTableBody.innerHTML = '';
    if (nota.itens && nota.itens.length > 0) {
        // Armazena os itens globalmente para busca
        allItems = nota.itens;
        
        // Renderiza os itens (respeitando o estado de expansão atual)
        renderItems(nota.itens, searchItemsInput ? searchItemsInput.value : '');
        
        // Calcula e exibe o total da nota
        const total = calculateTotal(nota.itens);
        totalNota.textContent = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        // Esconde a seção de rebusca quando há itens
        rebuscaSection.style.display = 'none';
    } else {
        allItems = [];
        currentNota = null;
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6">Nenhum item encontrado para esta nota.</td>`;
        itensDetailTableBody.appendChild(row);
        
        // Define total como zero quando não há itens
        totalNota.textContent = 'R$ 0,00';
        
        // Mostra a seção de rebusca quando não há itens
        rebuscaSection.style.display = 'block';
        hideRebuscaStatus();
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

    // Controla exibição do botão Mostrar/Ocultar padronizados
    const hasAnyStd = Array.isArray(nota.itens) && nota.itens.some(it => it.tipoEmbalagem || it.nomePadronizado || it.marca || it.quantidadePadronizada || it.peso || it.categoria);
    if (toggleStdBtn) {
        toggleStdBtn.style.display = hasAnyStd ? 'inline-block' : 'none';
        toggleStdBtn.textContent = 'Mostrar itens padronizados';
        toggleStdBtn.dataset.expanded = 'false';
        toggleStdBtn.onclick = () => togglePadronizados(nota);
    }
    // Oculta o botão de padronizar quando já houver itens padronizados
    if (padronizarItensBtn) {
        padronizarItensBtn.style.display = hasAnyStd ? 'none' : 'inline-block';
    }
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    const notaId = getNotaIdFromUrl();
    if (notaId) {
        fetchNotaDetails(notaId).then(() => {
            // Após carregar os detalhes, verifica se há parâmetros de busca na URL
            const searchParams = getSearchParamsFromUrl();
            if (searchParams.search && searchItemsInput) {
                // Preenche o campo de busca com o termo
                searchItemsInput.value = searchParams.search;
                
                // Dispara a busca automaticamente
                filterItems();
                
                // Scroll suave até a seção de itens
                setTimeout(() => {
                    const itensSection = document.querySelector('#itensDetailTable');
                    if (itensSection) {
                        itensSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                }, 500);
            }
        });
        
        // Event listener para o botão de rebusca
        rebuscaBtn.addEventListener('click', () => {
            rebuscarItens(notaId);
        });
        
        // Event listener para busca de itens
        if (searchItemsInput) {
            searchItemsInput.addEventListener('input', filterItems);
        }

        // Event listener para padronização via IA
        if (padronizarItensBtn) {
            padronizarItensBtn.addEventListener('click', async () => {
                try {
                    padronizarItensBtn.disabled = true;
                    padronizarItensBtn.textContent = 'Processando...';
                    if (typeof showInfo === 'function') {
                        showInfo('Padronização', 'Enviando itens para padronização com IA...');
                    }

                    const response = await fetch(`/api/notas/padronizar-itens/${notaId}`, { method: 'POST' });
                    const result = await response.json();
                    console.log('Padronização - resposta do servidor:', result);

                    if (!response.ok || !result.success) {
                        throw new Error(result.message || `Erro ${response.status}`);
                    }

                    if (typeof showSuccess === 'function') {
                        const detalhes = (result.results || []).slice(0, 5).map(r => `#${r.itemId}: ${r.success ? 'ok' : 'erro'}`).join(', ');
                        const prefixo = result.partial ? 'Parcial - ' : '';
                        showSuccess('Itens Padronizados', `${prefixo}${result.message}${detalhes ? `\n${detalhes}...` : ''}`);
                    }
                    // Recarrega os detalhes para refletir atualizações
                    await fetchNotaDetails(notaId);
                } catch (e) {
                    console.error('Erro ao padronizar itens:', e);
                    if (typeof showError === 'function') {
                        showError('Erro', e.message || 'Falha ao padronizar itens');
                    }
                } finally {
                    padronizarItensBtn.disabled = false;
                    padronizarItensBtn.textContent = '🤖 Padronizar Itens (IA)';
                }
            });
        }
    } else {
        loadingMessage.style.display = 'none';
        errorMessage.textContent = 'ID da NFC-e não fornecido na URL.';
        errorMessage.style.display = 'block';
    }
});

// --- Expansão/colapso da tabela com campos padronizados ---
function togglePadronizados(nota) {
    if (isExpanded) {
        collapseTable();
    } else {
        expandTable();
    }
    
    // Re-renderiza os itens com o novo estado de expansão
    const searchTerm = searchItemsInput ? searchItemsInput.value : '';
    renderItems(allItems, searchTerm);
}