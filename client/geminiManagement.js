// client/geminiManagement.js

// --- Referências aos elementos do DOM ---
const statsContainer = document.getElementById('statsContainer');
const newKeyForm = document.getElementById('newKeyForm');
const editKeyForm = document.getElementById('editKeyForm');
const keysContainer = document.getElementById('keysContainer');
const refreshKeysBtn = document.getElementById('refreshKeysBtn');
const testKeyBtn = document.getElementById('testKeyBtn');
const editModal = document.getElementById('editModal');
const editModalClose = document.querySelector('.modal-close');
const editModalCancel = document.querySelector('.modal-cancel');

// --- Estado da aplicação ---
let currentKeys = [];
let editingKeyId = null;

// --- Função para gerar nome automático para chave ---
function generateKeyName() {
    const existingNumbers = currentKeys.map(key => {
        const match = key.name.match(/Chave (\d+)/);
        return match ? parseInt(match[1]) : 0;
    });

    let nextNumber = 1;
    while (existingNumbers.includes(nextNumber)) {
        nextNumber++;
    }

    return `Chave ${nextNumber}`;
}

// --- Funções de Utilidade ---
function formatDate(dateString) {
    if (!dateString) return 'Nunca';
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('pt-BR', options);
}

function showMessage(message, type = 'info') {
    if (typeof showSuccess === 'function' && type === 'success') {
        showSuccess('Sucesso', message);
    } else if (typeof showError === 'function' && type === 'error') {
        showError('Erro', message);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// --- Funções de API ---
async function loadStats() {
    try {
        const response = await fetch('/api/gemini/stats/summary');
        if (!response.ok) throw new Error(`Erro ${response.status}`);

        const data = await response.json();
        if (data.success) {
            updateStatsDisplay(data.stats);
        }
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
    }
}

function updateStatsDisplay(stats) {
    // Verifica se elementos existem antes de acessar
    const totalKeys = document.getElementById('totalKeys');
    const activeKeys = document.getElementById('activeKeys');
    const totalUsage = document.getElementById('totalUsage');
    const totalErrors = document.getElementById('totalErrors');

    if (totalKeys) totalKeys.textContent = stats.totalKeys;
    if (activeKeys) activeKeys.textContent = stats.activeKeys;
    if (totalUsage) totalUsage.textContent = stats.totalUsage;
    if (totalErrors) totalErrors.textContent = stats.totalErrors;
}

async function loadKeys() {
    try {
        const response = await fetch('/api/gemini');
        if (!response.ok) throw new Error(`Erro ${response.status}`);

        const data = await response.json();
        if (data.success) {
            currentKeys = data.keys;
            renderKeys();
        }
    } catch (error) {
        console.error('Erro ao carregar chaves:', error);
        showMessage('Erro ao carregar chaves. Verifique se o servidor está funcionando.', 'error');
    }
}

function renderKeys() {
    // Verifica se elemento existe antes de acessar
    const keysContainer = document.getElementById('keysContainer');
    if (!keysContainer) {
        console.error('Elemento keysContainer não encontrado');
        return;
    }

    keysContainer.innerHTML = '';

    if (currentKeys.length === 0) {
        keysContainer.innerHTML = '<p>Nenhuma chave configurada. Adicione sua primeira chave acima.</p>';
        return;
    }

    currentKeys.forEach(key => {
        const keyCard = document.createElement('div');
        keyCard.className = 'key-card';
        keyCard.innerHTML = `
            <div class="key-header">
                <div class="key-title">${key.name}</div>
                <div class="key-status ${key.isActive ? 'active' : 'inactive'}">
                    ${key.isActive ? 'Ativa' : 'Inativa'}
                </div>
            </div>

            <div class="key-stats">
                <div class="stat-item">
                    <div class="stat-number">${key.usageCount}</div>
                    <div class="stat-label">Usos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${key.errorCount}</div>
                    <div class="stat-label">Erros</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${formatDate(key.lastUsedAt)}</div>
                    <div class="stat-label">Último Uso</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${formatDate(key.lastErrorAt)}</div>
                    <div class="stat-label">Último Erro</div>
                </div>
            </div>

            ${key.notes ? `<div class="key-notes">${key.notes}</div>` : ''}

            <div class="key-actions">
                <button class="btn-primary btn-small" onclick="editKey(${key.id})">Editar</button>
                <button class="btn-secondary btn-small" onclick="testKeyFunc(${key.id})">Testar</button>
                <button class="btn-danger btn-small" onclick="deleteKeyFunc(${key.id})">Excluir</button>
            </div>
        `;
        keysContainer.appendChild(keyCard);
    });
}

async function createKey(keyData) {
    try {
        // Gera nome automaticamente se não foi fornecido
        if (!keyData.name) {
            keyData.name = generateKeyName();
        }

        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(keyData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage('Chave criada com sucesso!', 'success');
            await loadKeys(); // Recarrega a lista
            await loadStats(); // Recarrega estatísticas

            // Verifica se formulário existe antes de resetar
            if (newKeyForm) {
                newKeyForm.reset();
            }

            // Limpa o campo de nome também
            const keyNameDisplay = document.getElementById('keyNameDisplay');
            if (keyNameDisplay) {
                keyNameDisplay.value = '';
            }
        } else {
            showMessage(data.message || 'Erro ao criar chave', 'error');
        }
    } catch (error) {
        console.error('Erro ao criar chave:', error);
        showMessage('Erro interno ao criar chave', 'error');
    }
}

async function updateKey(keyId, keyData) {
    try {
        const response = await fetch(`/api/gemini/${keyId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(keyData)
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage('Chave atualizada com sucesso!', 'success');
            await loadKeys();
            await loadStats();
            closeEditModal();
        } else {
            showMessage(data.message || 'Erro ao atualizar chave', 'error');
        }
    } catch (error) {
        console.error('Erro ao atualizar chave:', error);
        showMessage('Erro interno ao atualizar chave', 'error');
    }
}

async function deleteKey(keyId) {
    if (!confirm('Tem certeza que deseja excluir esta chave? Esta ação não pode ser desfeita.')) {
        return;
    }

    try {
        const response = await fetch(`/api/gemini/${keyId}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage('Chave excluída com sucesso!', 'success');
            await loadKeys();
            await loadStats();
        } else {
            showMessage(data.message || 'Erro ao excluir chave', 'error');
        }
    } catch (error) {
        console.error('Erro ao excluir chave:', error);
        showMessage('Erro interno ao excluir chave', 'error');
    }
}

async function testKey(keyId) {
    try {
        const response = await fetch(`/api/gemini/${keyId}/test`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok && data.success) {
            showMessage(data.message, 'success');
            await loadKeys(); // Recarrega para atualizar estatísticas
        } else {
            showMessage(data.message || 'Erro ao testar chave', 'error');
        }
    } catch (error) {
        console.error('Erro ao testar chave:', error);
        showMessage('Erro interno ao testar chave', 'error');
    } finally {
console.log('testKey');
    }
}

// --- Funções de Renderização ---
function renderKeys() {
    keysContainer.innerHTML = '';

    if (currentKeys.length === 0) {
        keysContainer.innerHTML = '<p>Nenhuma chave configurada. Adicione sua primeira chave acima.</p>';
        return;
    }

    currentKeys.forEach(key => {
        const keyCard = document.createElement('div');
        keyCard.className = 'key-card';
        keyCard.innerHTML = `
            <div class="key-header">
                <div class="key-title">${key.name}</div>
                <div class="key-status ${key.isActive ? 'active' : 'inactive'}">
                    ${key.isActive ? 'Ativa' : 'Inativa'}
                </div>
            </div>

            <div class="key-stats">
                <div class="stat-item">
                    <div class="stat-number">${key.usageCount}</div>
                    <div class="stat-label">Usos</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${key.errorCount}</div>
                    <div class="stat-label">Erros</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${formatDate(key.lastUsedAt)}</div>
                    <div class="stat-label">Último Uso</div>
                </div>
                <div class="stat-item">
                    <div class="stat-number">${formatDate(key.lastErrorAt)}</div>
                    <div class="stat-label">Último Erro</div>
                </div>
            </div>

            ${key.notes ? `<div class="key-notes">${key.notes}</div>` : ''}

            <div class="key-actions">
                <button class="btn-primary btn-small" onclick="editKey(${key.id})">Editar</button>
                <button class="btn-secondary btn-small" onclick="testKeyFunc(${key.id})">Testar</button>
                <button class="btn-danger btn-small" onclick="deleteKeyFunc(${key.id})">Excluir</button>
            </div>
        `;
        keysContainer.appendChild(keyCard);
    });
}

// --- Funções de Modal ---
function openEditModal(key) {
    // Verifica se elementos existem antes de acessar
    const editKeyId = document.getElementById('editKeyId');
    const editKeyName = document.getElementById('editKeyName');
    const editApiKey = document.getElementById('editApiKey');
    const editKeyActive = document.getElementById('editKeyActive');
    const editKeyNotes = document.getElementById('editKeyNotes');

    // Elementos de informação
    const editKeyInfoId = document.getElementById('editKeyInfoId');
    const editKeyInfoCreated = document.getElementById('editKeyInfoCreated');
    const editKeyInfoUpdated = document.getElementById('editKeyInfoUpdated');
    const currentApiKeyPartial = document.getElementById('currentApiKeyPartial');

    // Elementos de estatísticas
    const editUsageCount = document.getElementById('editUsageCount');
    const editErrorCount = document.getElementById('editErrorCount');
    const editLastUsed = document.getElementById('editLastUsed');

    if (!editKeyId || !editKeyName || !editApiKey || !editKeyActive || !editKeyNotes || !editModal ||
        !editKeyInfoId || !editKeyInfoCreated || !editKeyInfoUpdated || !currentApiKeyPartial ||
        !editUsageCount || !editErrorCount || !editLastUsed) {
        console.error('Elementos do modal de edição não encontrados');
        return;
    }

    editingKeyId = key.id;

    // Preenche informações básicas
    editKeyId.value = key.id;
    editKeyName.value = key.name;
    editApiKey.value = ''; // Não mostra a chave por segurança
    editKeyActive.value = key.isActive.toString();
    editKeyNotes.value = key.notes || '';

    // Mostra informações da chave atual
    editKeyInfoId.textContent = `#${key.id}`;
    editKeyInfoCreated.textContent = formatDate(key.createdAt);
    editKeyInfoUpdated.textContent = formatDate(key.updatedAt);

    // Mostra parcialmente a chave de API (últimos 4 caracteres)
    if (key.apiKey && key.apiKey.length > 4) {
        const lastFour = key.apiKey.slice(-4);
        currentApiKeyPartial.textContent = `••••${lastFour}`;
    } else {
        currentApiKeyPartial.textContent = '••••••••';
    }

    // Mostra estatísticas
    editUsageCount.textContent = key.usageCount || 0;
    editErrorCount.textContent = key.errorCount || 0;
    editLastUsed.textContent = formatDate(key.lastUsedAt);

    editModal.style.display = 'flex';
}

function closeEditModal() {
    if (!editModal || !editKeyForm) {
        console.error('Elementos do modal não encontrados');
        return;
    }

    editModal.style.display = 'none';
    editingKeyId = null;
    editKeyForm.reset();
}

// --- Event Listeners ---
if (newKeyForm) {
    newKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const apiKeyInput = document.getElementById('apiKey');
        const keyNotesInput = document.getElementById('keyNotes');

        if (!apiKeyInput || !keyNotesInput) {
            console.error('Elementos do formulário não encontrados');
            return;
        }

        const apiKey = apiKeyInput.value;
        const notes = keyNotesInput.value;

        if (!apiKey.trim()) {
            showMessage('Por favor, insira a chave de API.', 'error');
            return;
        }

        const keyData = {
            name: generateKeyName(), // Sempre gera nome automático
            apiKey: apiKey,
            notes: notes
        };

        await createKey(keyData);
    });
}

if (editKeyForm) {
    editKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (!editingKeyId) {
            console.error('ID de edição não definido');
            return;
        }

        const editKeyName = document.getElementById('editKeyName');
        const editApiKey = document.getElementById('editApiKey');
        const editKeyActive = document.getElementById('editKeyActive');
        const editKeyNotes = document.getElementById('editKeyNotes');

        if (!editKeyName || !editApiKey || !editKeyActive || !editKeyNotes) {
            console.error('Elementos do formulário de edição não encontrados');
            return;
        }

        // Validação básica
        if (!editKeyName.value.trim()) {
            showMessage('Nome da chave é obrigatório.', 'error');
            editKeyName.focus();
            return;
        }

        // Prepara dados - API key só se fornecida
        const keyData = {
            name: editKeyName.value.trim(),
            isActive: editKeyActive.value === 'true',
            notes: editKeyNotes.value.trim()
        };

        // Só inclui API key se foi fornecida
        if (editApiKey.value.trim()) {
            keyData.apiKey = editApiKey.value.trim();
        }

        await updateKey(editingKeyId, keyData);
    });
}

if (refreshKeysBtn) {
    refreshKeysBtn.addEventListener('click', async () => {
        if (refreshKeysBtn.disabled) return; // Previne múltiplos cliques

        refreshKeysBtn.disabled = true;
        refreshKeysBtn.textContent = 'Carregando...';

        try {
            await loadKeys();
            await loadStats();
        } catch (error) {
            console.error('Erro ao atualizar dados:', error);
        }

        refreshKeysBtn.disabled = false;
        refreshKeysBtn.textContent = '🔄 Atualizar';
    });
}

// --- Funções Globais (para onclick dos botões) ---
window.editKey = function(keyId) {
    const key = currentKeys.find(k => k.id === keyId);
    if (key) {
        openEditModal(key);
    } else {
        console.error(`Chave com ID ${keyId} não encontrada`);
    }
};

window.testKeyFunc = function(keyId) {
    if (keyId && typeof testKey === 'function') {
        testKey(keyId);
    } else {
        console.error('Função testKey não disponível ou keyId inválido');
    }
};

window.deleteKeyFunc = function(keyId) {
    if (keyId && typeof deleteKey === 'function') {
        deleteKey(keyId);
    } else {
        console.error('Função deleteKey não disponível ou keyId inválido');
    }
};

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Carrega dados iniciais
        await loadKeys();
        await loadStats();

        // Atualiza nome da chave automaticamente quando API key for inserida
        const apiKeyInput = document.getElementById('apiKey');
        const keyNameDisplay = document.getElementById('keyNameDisplay');

        if (apiKeyInput && keyNameDisplay) {
            apiKeyInput.addEventListener('input', () => {
                if (apiKeyInput.value.trim()) {
                    keyNameDisplay.value = generateKeyName();
                } else {
                    keyNameDisplay.value = '';
                }
            });
        }

        // Configura modais apenas se elementos existirem
        if (editModalClose && editModalCancel && editModal) {
            editModalClose.addEventListener('click', closeEditModal);
            editModalCancel.addEventListener('click', closeEditModal);

            // Fecha modal ao clicar fora
            window.addEventListener('click', (e) => {
                if (e.target === editModal) {
                    closeEditModal();
                }
            });
        }

    } catch (error) {
        console.error('Erro durante inicialização:', error);
    }
});
