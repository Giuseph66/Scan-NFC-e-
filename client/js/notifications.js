// client/js/notifications.js
// Sistema de Notificações/Modal

class NotificationSystem {
    constructor() {
        this.container = null;
        this.notifications = new Map();
        this.defaultOptions = {
            duration: 5000, // 5 segundos
            closable: true,
            showProgress: true,
            position: 'top-right',
            animation: 'slide'
        };
        
        this.init();
    }
    
    init() {
        // Cria container se não existir
        if (!document.getElementById('notification-container')) {
            this.createContainer();
        }
        this.container = document.getElementById('notification-container');
    }
    
    createContainer() {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    /**
     * Mostra uma notificação
     * @param {string} type - Tipo da notificação (success, error, warning, info, primary)
     * @param {string} title - Título da notificação
     * @param {string} message - Mensagem da notificação
     * @param {Object} options - Opções adicionais
     */
    show(type, title, message, options = {}) {
        const config = { ...this.defaultOptions, ...options };
        const id = this.generateId();
        
        const notification = this.createNotification(id, type, title, message, config);
        this.container.appendChild(notification);
        this.notifications.set(id, notification);
        
        // Anima entrada
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);
        
        // Auto-remove se tiver duração
        if (config.duration > 0) {
            this.autoRemove(id, config.duration);
        }
        
        return id;
    }
    
    createNotification(id, type, title, message, config) {
        const notification = document.createElement('div');
        notification.id = `notification-${id}`;
        notification.className = `notification ${type}`;
        
        // Ícone baseado no tipo
        const icon = this.getIcon(type);
        
        // Conteúdo da notificação
        notification.innerHTML = `
            <div class="notification-icon">${icon}</div>
            <div class="notification-content">
                <div class="notification-title">${title}</div>
                <div class="notification-message">${message}</div>
                ${config.actions ? this.createActions(config.actions) : ''}
            </div>
            ${config.closable ? '<button class="notification-close" onclick="notifications.close(\'' + id + '\')">&times;</button>' : ''}
            ${config.showProgress && config.duration > 0 ? this.createProgressBar(config.duration) : ''}
        `;
        
        // Adiciona event listeners para os botões de ação
        if (config.actions) {
            config.actions.forEach((action, index) => {
                const buttonId = `notification-action-${Date.now()}-${index}`;
                const button = notification.querySelector(`#${buttonId}`);
                if (button && action.onclick) {
                    button.addEventListener('click', () => {
                        // Executa o código onclick
                        if (typeof action.onclick === 'string') {
                            eval(action.onclick);
                        } else if (typeof action.onclick === 'function') {
                            action.onclick();
                        }
                    });
                }
            });
        }
        
        return notification;
    }
    
    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ',
            primary: '●'
        };
        return icons[type] || icons.info;
    }
    
    createActions(actions) {
        let actionsHtml = '<div class="notification-action">';
        actions.forEach((action, index) => {
            const className = action.primary ? 'notification-btn notification-btn-primary' : 'notification-btn notification-btn-secondary';
            const buttonId = `notification-action-${Date.now()}-${index}`;
            actionsHtml += `<button id="${buttonId}" class="${className}">${action.text}</button>`;
        });
        actionsHtml += '</div>';
        return actionsHtml;
    }
    
    createProgressBar(duration) {
        return `
            <div class="notification-progress">
                <div class="notification-progress-bar" style="animation-duration: ${duration}ms;"></div>
            </div>
        `;
    }
    
    /**
     * Fecha uma notificação específica
     */
    close(id) {
        const notification = this.notifications.get(id);
        if (notification) {
            notification.classList.add('hide');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                this.notifications.delete(id);
            }, 300);
        }
    }
    
    /**
     * Fecha todas as notificações
     */
    closeAll() {
        this.notifications.forEach((notification, id) => {
            this.close(id);
        });
    }
    
    /**
     * Remove automaticamente após duração
     */
    autoRemove(id, duration) {
        setTimeout(() => {
            this.close(id);
        }, duration);
    }
    
    /**
     * Gera ID único para notificação
     */
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    // Métodos de conveniência para cada tipo
    success(title, message, options = {}) {
        return this.show('success', title, message, options);
    }
    
    error(title, message, options = {}) {
        return this.show('error', title, message, { duration: 0, ...options }); // Erros não fecham automaticamente
    }
    
    warning(title, message, options = {}) {
        return this.show('warning', title, message, options);
    }
    
    info(title, message, options = {}) {
        return this.show('info', title, message, options);
    }
    
    primary(title, message, options = {}) {
        return this.show('primary', title, message, options);
    }
}

// Instância global
const notifications = new NotificationSystem();

// Funções globais para facilitar uso
window.showNotification = (type, title, message, options) => {
    return notifications.show(type, title, message, options);
};

window.showSuccess = (title, message, options) => {
    return notifications.success(title, message, options);
};

window.showError = (title, message, options) => {
    return notifications.error(title, message, options);
};

window.showWarning = (title, message, options) => {
    return notifications.warning(title, message, options);
};

window.showInfo = (title, message, options) => {
    return notifications.info(title, message, options);
};

window.closeNotification = (id) => {
    notifications.close(id);
};

window.closeAllNotifications = () => {
    notifications.closeAll();
};

// Exporta para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NotificationSystem;
}
