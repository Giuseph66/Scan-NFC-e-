// client/scanner.js

// --- Referências aos elementos do DOM ---
const video = document.getElementById('video');
const canvas = document.createElement('canvas'); // Canvas oculto para processamento
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const cameraSelect = document.getElementById('cameraSelect');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');
const resultSection = document.getElementById('resultSection');
const chaveResult = document.getElementById('chaveResult');
const emitenteResult = document.getElementById('emitenteResult');
const ambienteResult = document.getElementById('ambienteResult');
const itensTableBody = document.querySelector('#itensTable tbody');
const rescanBtn = document.getElementById('rescanBtn');
const manualQrInput = document.getElementById('manualQrInput');
const processManualBtn = document.getElementById('processManualBtn');

// --- Variáveis de estado ---
let currentStream = null;
let scanning = false;
let rafId = null;
let detector = null; // Para BarcodeDetector, se disponível
let usingDetector = false;
let lastResult = null; // Armazena o último QR Code lido com sucesso
let currentNfceData = null; // Armazena os dados completos da NFC-e lida e processada

// --- Funções de Utilidade ---
function setStatus(message, type = '') {
    statusEl.textContent = message;
    statusEl.className = 'status-message';
    if (type) {
        statusEl.classList.add(type);
    }
}

function enableElement(element, enable) {
    element.disabled = !enable;
}

// --- Funções de Câmera ---
async function listCameras() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        cameraSelect.innerHTML = '';
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            // Prefere câmeras traseiras em dispositivos móveis
            const label = device.label || `Câmera ${index + 1}`;
            option.textContent = label;
            cameraSelect.appendChild(option);
        });
        if (videoDevices.length === 0) {
            const option = document.createElement('option');
            option.textContent = 'Nenhuma câmera encontrada';
            cameraSelect.appendChild(option);
        }
    } catch (err) {
        console.error("Erro ao listar câmeras:", err);
        setStatus('Erro ao acessar lista de câmeras.', 'error');
    }
}

async function startStream() {
    if (scanning) return;

    try {
        stopStream(); // Para qualquer stream anterior
        setStatus('Solicitando acesso à câmera...');

        const constraints = {
            audio: false,
            video: {
                deviceId: cameraSelect.value ? { exact: cameraSelect.value } : undefined,
                facingMode: 'environment', // Prefere câmera traseira
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        };

        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = currentStream;
        
        // Espera o vídeo carregar para definir o tamanho do canvas
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log(`Resolução do vídeo: ${canvas.width}x${canvas.height}`);
        };

        await video.play();

        // Tenta usar BarcodeDetector
        usingDetector = false;
        if ('BarcodeDetector' in window) {
            try {
                const supported = await BarcodeDetector.getSupportedFormats();
                if (supported.includes('qr_code')) {
                    detector = new BarcodeDetector({ formats: ['qr_code'] });
                    usingDetector = true;
                    console.log("Usando BarcodeDetector nativo.");
                }
            } catch (e) {
                console.warn("BarcodeDetector não disponível ou falhou:", e);
            }
        }

        scanning = true;
        enableElement(stopBtn, true);
        enableElement(startBtn, false);
        setStatus(usingDetector ? 'Lendo QR Code (BarcodeDetector)...' : 'Lendo QR Code (jsQR)...', 'success');
        lastResult = null; // Reseta o último resultado ao iniciar
        loopScan();
    } catch (err) {
        console.error("Erro ao acessar a câmera:", err);
        setStatus('Erro ao acessar a câmera. Verifique permissões.', 'error');
        alert('Não foi possível acessar a câmera.\nVerifique as permissões do navegador.');
    }
}

function stopStream() {
    scanning = false;
    if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
    }
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }
    enableElement(stopBtn, false);
    enableElement(startBtn, true);
    setStatus('Leitura parada.');
}

// --- Loop de Leitura ---
async function loopScan() {
    if (!scanning) return;

    if (usingDetector && detector) {
        try {
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length > 0) {
                const rawValue = barcodes[0].rawValue;
                if (rawValue && rawValue !== lastResult) {
                    lastResult = rawValue;
                    onQRCodeRead(rawValue);
                    return; // Para o loop após encontrar
                }
            }
        } catch (e) {
            console.warn('BarcodeDetector falhou, alternando para jsQR:', e);
            usingDetector = false;
        }
    }

    // Fallback para jsQR
    try {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
            if (code && code.data && code.data !== lastResult) {
                lastResult = code.data;
                onQRCodeRead(code.data);
                return; // Para o loop após encontrar
            }
        }
    } catch (e) {
        console.error("Erro no loop de leitura jsQR:", e);
    }

    rafId = requestAnimationFrame(loopScan);
}

// --- Processamento do QR Code Lido ---
async function onQRCodeRead(rawText) {
    console.log("QR Code lido:", rawText);
    scanning = false; // Pausa a leitura
    stopStream(); // Para a stream

    // Limpa resultados anteriores
    chaveResult.textContent = '-';
    emitenteResult.textContent = '-';
    ambienteResult.textContent = '-';
    itensTableBody.innerHTML = '';

    try {
        setStatus('Processando QR Code...', 'info');
        
        // Envia QR Code para o backend processar
        const response = await fetch('/api/scan/process', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ qrCode: rawText })
        });

        const result = await response.json();

        if (result.success) {
            currentNfceData = result.data;
            displayResult(result.data);
            
            // Verifica se foi salva automaticamente pelo backend
            if (result.salva) {
                if (result.salva.status === 'salva') {
                    setStatus(`${result.message} (ID: ${result.salva.id})`, 'success');
                } else if (result.salva.status === 'duplicada') {
                    setStatus(`${result.salva.message} (ID: ${result.salva.id})`, 'info');
                }
            } else {
                setStatus(result.message, 'success');
            }
        } else {
            setStatus(result.message || 'Erro ao processar QR Code', 'error');
            resultSection.style.display = 'none';
        }
    } catch (e) {
        console.error("Erro ao processar QR Code:", e);
        setStatus(`Erro ao processar QR Code: ${e.message}`, 'error');
        resultSection.style.display = 'none';
    }
}

function displayResult(data) {
    chaveResult.textContent = data.chave || '-';
    emitenteResult.textContent = data.emitente?.nome || data.emitente?.cnpj || '-';
    ambienteResult.textContent = data.tpAmb === '1' ? 'Produção' : (data.tpAmb === '2' ? 'Homologação' : data.tpAmb || '-');
    
    // Limpa a tabela de itens
    itensTableBody.innerHTML = '';
    
    // Se tiver itens, popula a tabela
    if (data.itens && data.itens.length > 0) {
        data.itens.forEach(item => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${item.descricao || '-'}</td>
                <td>${item.qtde || '-'}</td>
                <td>${item.un || '-'}</td>
                <td>${item.unitario || '-'}</td>
                <td>${item.total || '-'}</td>
            `;
            itensTableBody.appendChild(row);
        });
    } else {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="5">Nenhum item encontrado no QR Code.</td>`;
        itensTableBody.appendChild(row);
    }

    resultSection.style.display = 'block';
    setStatus('QR Code lido com sucesso!', 'success');
}

// --- Funções de Integração com Backend ---
async function processManualQr() {
    const qrCode = manualQrInput.value.trim();
    
    if (!qrCode) {
        setStatus('Por favor, insira um link de QR Code válido.', 'error');
        return;
    }
    
    // Validação básica de URL
    if (!qrCode.includes('http') || !qrCode.includes('nfce')) {
        setStatus('Por favor, insira um link válido de NFC-e.', 'error');
        return;
    }
    
    try {
        // Desabilita o botão durante o processamento
        processManualBtn.disabled = true;
        processManualBtn.classList.add('processing');
        processManualBtn.textContent = 'Processando...';
        setStatus('Processando link manual...', 'info');
        
        // Adiciona um pequeno delay para mostrar a animação
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // Usa a mesma função de processamento do QR Code escaneado
        await onQRCodeRead(qrCode);
        
        // Limpa o campo após sucesso
        manualQrInput.value = '';
        
        // Adiciona feedback visual de sucesso
        processManualBtn.textContent = '✓ Processado!';
        setTimeout(() => {
            processManualBtn.textContent = 'Processar Link';
        }, 2000);
        
    } catch (error) {
        console.error("Erro ao processar link manual:", error);
        setStatus(`Erro ao processar link: ${error.message}`, 'error');
        
        // Feedback visual de erro
        processManualBtn.textContent = '✗ Erro';
        setTimeout(() => {
            processManualBtn.textContent = 'Processar Link';
        }, 2000);
    } finally {
        // Reabilita o botão
        processManualBtn.disabled = false;
        processManualBtn.classList.remove('processing');
    }
}

async function saveNfce() {
    // Usa os dados completos armazenados
    const nfceDataToSave = currentNfceData;

    if (!nfceDataToSave || !nfceDataToSave.chave) {
        console.warn("Tentativa de salvar NFC-e sem dados válidos.");
        // Não mostra alerta, pois é automático
        return;
    }

    // Log para depuração
    console.log("Dados enviados para salvar:", JSON.stringify(nfceDataToSave, null, 2));

    // Verificação adicional para itens
    if (!nfceDataToSave.itens || !Array.isArray(nfceDataToSave.itens) || nfceDataToSave.itens.length === 0) {
        console.warn("Nenhum item encontrado nos dados da NFC-e para salvar.");
        // setStatus('Nenhum item para salvar.', 'info'); // Opcional
    }

    try {
        // setStatus('Salvando NFC-e...'); // Opcional: mostrar status
        
        const response = await fetch('/api/notas/salvar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(nfceDataToSave) // Envia os dados completos
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`NFC-e salva com sucesso! ID: ${data.id}`);
            setStatus(`NFC-e salva automaticamente! ID: ${data.id}`, 'success');
            // Opcional: alert(`NFC-e salva com sucesso! ID: ${data.id}`);
        } else {
            if (response.status === 409) {
                console.log('Esta NFC-e já foi salva anteriormente.');
                setStatus('NFC-e já existia no banco.', 'info');
                // Opcional: alert('Esta NFC-e já foi salva anteriormente.');
            } else {
                throw new Error(data.message || 'Erro desconhecido ao salvar.');
            }
        }
    } catch (error) {
        console.error("Erro ao salvar NFC-e:", error);
        setStatus(`Erro ao salvar automaticamente: ${error.message}`, 'error');
        // Opcional: alert(`Falha ao salvar NFC-e: ${error.message}`);
    }
}

// --- Event Listeners ---
startBtn.addEventListener('click', startStream);
stopBtn.addEventListener('click', stopStream);
rescanBtn.addEventListener('click', () => {
    resultSection.style.display = 'none';
    startStream(); // Reinicia a leitura
});
cameraSelect.addEventListener('change', startStream);

// Event listeners para entrada manual
processManualBtn.addEventListener('click', processManualQr);
manualQrInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        processManualQr();
    }
});

// --- Inicialização ---
(async function init() {
    if (!('mediaDevices' in navigator) || !('getUserMedia' in navigator.mediaDevices)) {
        setStatus('Navegador não suporta acesso à câmera.', 'error');
        alert('Seu navegador não suporta o acesso à câmera.');
        return;
    }

    await listCameras();
    setStatus('Pronto. Selecione uma câmera e clique em "Iniciar Leitura".');

    // Solicita permissão para câmera assim que a página carrega
    // Isso pode ajudar a evitar bloqueios em alguns navegadores
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop()); // Libera imediatamente
        console.log("Permissão de câmera concedida temporariamente.");
    } catch (err) {
        console.log("Permissão de câmera ainda não concedida ou negada.");
        // A permissão será solicitada novamente ao clicar em 'Iniciar Leitura'
    }
})();