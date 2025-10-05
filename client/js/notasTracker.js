// client/js/notasTracker.js
// Sistema de Rastreamento de Notas com localStorage

class NotasTracker {
    constructor() {
        this.storageKey = 'nfc_scan_notas_count';
        this.lastUpdateKey = 'nfc_scan_last_update';
        this.init();
    }
    
    init() {
        // Verifica diferença na contagem ao carregar a página
        this.checkForNewNotas();
    }
    
    /**
     * Busca a contagem atual de notas do servidor
     */
    async getCurrentNotasCount() {
        try {
            const response = await fetch('/api/notas');
            if (response.ok) {
                const data = await response.json();
                return data.total || 0;
            }
            return 0;
        } catch (error) {
            console.error('Erro ao buscar contagem de notas:', error);
            return 0;
        }
    }
    
    /**
     * Obtém a contagem salva no localStorage
     */
    getStoredNotasCount() {
        const stored = localStorage.getItem(this.storageKey);
        return stored ? parseInt(stored) : 0;
    }
    
    /**
     * Salva a contagem no localStorage
     */
    saveNotasCount(count) {
        localStorage.setItem(this.storageKey, count.toString());
        localStorage.setItem(this.lastUpdateKey, new Date().toISOString());
    }
    
    /**
     * Verifica se há novas notas e mostra notificação
     */
    async checkForNewNotas() {
        const currentCount = await this.getCurrentNotasCount();
        const storedCount = this.getStoredNotasCount();
        
        if (currentCount > storedCount) {
            const newNotas = currentCount - storedCount;
            this.showNewNotasNotification(newNotas, currentCount);
        }
        
        // Atualiza a contagem salva
        this.saveNotasCount(currentCount);
    }
    
    /**
     * Mostra notificação de novas notas
     */
    showNewNotasNotification(newNotas, totalNotas) {
        const message = newNotas === 1 
            ? `Foi escaneada 1 nova nota fiscal!` 
            : `Foram escaneadas ${newNotas} novas notas fiscais!`;
            
        const detailMessage = `Total atual: ${totalNotas} notas`;
        
        // Usa o sistema de notificações se disponível
        if (typeof showSuccess === 'function') {
            showSuccess('📱 Novas Notas Fiscais!', `${message}\n${detailMessage}`, {
                duration: 8000,
                actions: [
                    {
                        text: 'Ver Histórico',
                        primary: true,
                        onclick: 'window.location.href="history.html"'
                    },
                    {
                        text: 'Fechar',
                        primary: false,
                        onclick: 'closeAllNotifications()'
                    }
                ]
            });
        } else {
            // Fallback para alert se o sistema de notificações não estiver disponível
            alert(`📱 Novas Notas Fiscais!\n\n${message}\n${detailMessage}`);
        }
    }
    
    /**
     * Atualiza a contagem quando uma nova nota é salva
     */
    async updateOnNewNota() {
        const currentCount = await this.getCurrentNotasCount();
        this.saveNotasCount(currentCount);
        
        // Mostra notificação de sucesso com contagem atualizada
        if (typeof showSuccess === 'function') {
            showSuccess('Nova Nota Salva!', `Total de notas: ${currentCount}`, {
                duration: 5000
            });
        }
    }
    
    /**
     * Força verificação de novas notas (útil para botões de refresh)
     */
    async forceCheck() {
        await this.checkForNewNotas();
    }
    
    /**
     * Obtém estatísticas do localStorage
     */
    getStats() {
        const count = this.getStoredNotasCount();
        const lastUpdate = localStorage.getItem(this.lastUpdateKey);
        
        return {
            totalNotas: count,
            lastUpdate: lastUpdate ? new Date(lastUpdate) : null,
            lastUpdateFormatted: lastUpdate ? new Date(lastUpdate).toLocaleString('pt-BR') : 'Nunca'
        };
    }
    
    /**
     * Limpa dados do localStorage
     */
    clearData() {
        localStorage.removeItem(this.storageKey);
        localStorage.removeItem(this.lastUpdateKey);
    }
    
    /**
     * Obtém informações de tempo desde a última atualização
     */
    getTimeSinceLastUpdate() {
        const lastUpdate = localStorage.getItem(this.lastUpdateKey);
        if (!lastUpdate) return null;
        
        const now = new Date();
        const last = new Date(lastUpdate);
        const diffMs = now - last;
        
        const minutes = Math.floor(diffMs / 60000);
        const hours = Math.floor(diffMs / 3600000);
        const days = Math.floor(diffMs / 86400000);
        
        if (days > 0) return `${days} dia${days > 1 ? 's' : ''}`;
        if (hours > 0) return `${hours} hora${hours > 1 ? 's' : ''}`;
        if (minutes > 0) return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
        return 'agora mesmo';
    }
}

// Instância global
const notasTracker = new NotasTracker();

// Funções globais para facilitar uso
window.updateNotasCount = () => notasTracker.updateOnNewNota();
window.checkNewNotas = () => notasTracker.forceCheck();
window.getNotasStats = () => notasTracker.getStats();
window.clearNotasData = () => notasTracker.clearData();

// Auto-verificação quando a página carrega
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que o sistema de notificações esteja carregado
    setTimeout(() => {
        notasTracker.checkForNewNotas();
    }, 500);

    // Atalho oculto: 3 cliques rápidos no footer → geminiManagement.html
    try {
        const footer = document.querySelector('footer');
        if (footer) {
            let clickCount = 0;
            let lastClickTime = 0;
            const thresholdMs = 700; // intervalo máximo entre cliques

            footer.addEventListener('click', () => {
                const now = Date.now();
                if (now - lastClickTime > thresholdMs) {
                    clickCount = 0;
                }
                clickCount += 1;
                lastClickTime = now;

                if (clickCount >= 3) {
                    clickCount = 0;
                    window.location.href = 'geminiManagement.html';
                }
            });
        }
    } catch (e) {
        // Silencioso: não impacta páginas sem footer
        console.debug('Atalho de triple-click indisponível:', e);
    }
});

// Exporta para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotasTracker;
}
