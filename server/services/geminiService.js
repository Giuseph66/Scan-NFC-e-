#!/usr/bin/env node

/**
 * Script Standalone para Gerenciamento e Rotação de Chaves de API do Gemini
 * - Verifica validade das chaves.
 * - Detecta e trata rate limits (tokens/requisições por minuto).
 * - Atualiza "banco" em memória com estatísticas de uso/erros.
 * - Rotaciona para chaves válidas automaticamente.
 * 
 * Uso: node gemini-key-rotator.js [CHAVE1] [CHAVE2] ...
 * Exemplo: node gemini-key-rotator.js "API_KEY_1" "API_KEY_2"
 * 
 * Para simular sem API real: Defina SIMULATE=true no código.
 */

const fs = require('fs'); // Para salvar/ler estatísticas em JSON (opcional, como "banco" simples)

// Configurações
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_RETRIES_PER_KEY = 3; // Máximo de tentativas por chave antes de rotacionar
const WAIT_TIME_MS = 60000; // Tempo de espera para rate limit (60 segundos)
const SIMULATE = false; // Mude para true para simular respostas sem chamar a API real

// "Banco" em memória para chaves (simula um DB simples)
let keys = [
  { id: 'key1', api_key: process.argv[2] || 'YOUR_API_KEY_1', is_active: true, usage_count: 0, error_count: 0, last_used_at: null, last_error_at: null },
  { id: 'key2', api_key: process.argv[3] || 'YOUR_API_KEY_2', is_active: true, usage_count: 0, error_count: 0, last_used_at: null, last_error_at: null },
  // Adicione mais chaves conforme necessário
];

let currentKeyIndex = 0;

// Função para salvar estatísticas em um arquivo JSON (simula persistência)
function saveKeysToFile() {
  fs.writeFileSync('gemini_keys_stats.json', JSON.stringify(keys, null, 2));
}

// Função para carregar estatísticas de um arquivo JSON (opcional, para persistir entre execuções)
function loadKeysFromFile() {
  if (fs.existsSync('gemini_keys_stats.json')) {
    keys = JSON.parse(fs.readFileSync('gemini_keys_stats.json'));
  }
}

// Função para obter a chave atual
function getCurrentKey() {
  const activeKeys = keys.filter(k => k.is_active);
  if (activeKeys.length === 0) {
    throw new Error('Nenhuma chave ativa disponível.');
  }
  return activeKeys[currentKeyIndex % activeKeys.length];
}

// Função para atualizar estatísticas da chave
function updateKeyStats(keyId, success = true) {
  const key = keys.find(k => k.id === keyId);
  if (key) {
    key.last_used_at = new Date().toISOString();
    key.usage_count += 1;
    if (!success) {
      key.error_count += 1;
      key.last_error_at = new Date().toISOString();
    }
    saveKeysToFile(); // Salva no "banco" JSON
  }
}

// Função para detectar erros de rate limit (baseado em códigos ou mensagens comuns da API Gemini)
function isRateLimitError(error) {
  const rateLimitIndicators = [
    'quota exceeded', // Mensagem típica para limites de quota
    'rate limit',     // Geral para rate limits
    '429',            // Código HTTP para Too Many Requests
    'RESOURCE_EXHAUSTED' // Erro específico do Gemini para quotas
  ];
  return rateLimitIndicators.some(indicator => error.message.toLowerCase().includes(indicator.toLowerCase()));
}

// Função para fazer uma chamada simulada ou real à API
async function makeApiCall(systemPrompt, userPrompt, key) {
  const url = `${GEMINI_API_URL}?key=${key.api_key}`;
  const body = {
    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 100 }
  };

  if (SIMULATE) {
    // Simula uma resposta ou erro para teste
    const shouldFail = Math.random() < 0.3; // 30% de chance de erro simulado
    if (shouldFail) {
      throw new Error('Simulado: quota exceeded'); // Simula rate limit
    }
    return { success: true, data: 'Resposta simulada da IA.' };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorData = await response.text();
    throw new Error(`Erro da API (${response.status}): ${errorData}`);
  }

  const data = await response.json();
  return { success: true, data: data.candidates[0]?.content?.parts[0]?.text || 'Sem resposta.' };
}

// Função principal para rotacionar chaves e tentar a chamada
async function processWithKeyRotation(systemPrompt, userPrompt) {
  loadKeysFromFile(); // Carrega estatísticas anteriores
  let attempts = 0;
  const totalKeys = keys.filter(k => k.is_active).length;

  while (attempts < totalKeys * MAX_RETRIES_PER_KEY) {
    const currentKey = getCurrentKey();
    console.log(`Tentando com chave ${currentKey.id} (tentativa ${attempts + 1})`);

    try {
      const result = await makeApiCall(systemPrompt, userPrompt, currentKey);
      updateKeyStats(currentKey.id, true); // Sucesso: atualiza uso
      console.log(`Sucesso! Resposta: ${result.data}`);
      return result; // Retorna a resposta se tudo OK
    } catch (error) {
      console.error(`Erro com chave ${currentKey.id}: ${error.message}`);
      updateKeyStats(currentKey.id, false); // Falha: atualiza erro

      if (isRateLimitError(error)) {
        console.log(`Rate limit detectado para chave ${currentKey.id}. Aguardando ${WAIT_TIME_MS / 1000} segundos antes de rotacionar.`);
        await new Promise(resolve => setTimeout(resolve, WAIT_TIME_MS)); // Espera 60 segundos
        currentKeyIndex = (currentKeyIndex + 1) % keys.length; // Rotaciona para a próxima chave
        attempts++;
      } else {
        // Para outros erros (não rate limit), rotacione imediatamente
        console.log(`Erro não relacionado a rate limit. Rotacionando chave.`);
        currentKeyIndex = (currentKeyIndex + 1) % keys.length;
        attempts++;
      }
    }
  }

  throw new Error('Todas as chaves esgotadas após múltiplas tentativas.');
}

// Exemplo de uso: Chame a função com prompts
(async () => {
  try {
    const systemPrompt = 'Você é um assistente útil.';
    const userPrompt = 'Explique o que é JavaScript em uma frase.';
    const result = await processWithKeyRotation(systemPrompt, userPrompt);
    console.log('Processo concluído com sucesso!');
  } catch (error) {
    console.error(`Erro fatal: ${error.message}`);
    process.exit(1);
  }
})();