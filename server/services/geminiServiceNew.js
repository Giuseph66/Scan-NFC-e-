// server/services/geminiServiceNew.js
const fetch = require('node-fetch');
const { GeminiKey } = require('../models');

/**
 * Serviço para gerenciar chaves da API Gemini integrado com banco de dados
 * Busca chaves ativas do banco e gerencia rate limits automaticamente
 */

// Configurações
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const MAX_RETRIES_PER_KEY = 3;
const WAIT_TIME_MS = 60000; // 60 segundos para rate limit

// Cache em memória das chaves (para evitar consultas constantes ao banco)
let keysCache = [];
let lastCacheUpdate = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutos

// Cooldown por chave (id -> timestamp até quando não pode ser usada)
const keyCooldownUntil = new Map();

/**
 * Busca chaves ativas do banco de dados
 */
async function getActiveKeysFromDatabase() {
  try {
    // Verifica se o cache ainda é válido
    if (keysCache.length > 0 && lastCacheUpdate && (Date.now() - lastCacheUpdate) < CACHE_DURATION) {
      return keysCache;
    }

    console.log('🔍 Buscando chaves Gemini ativas do banco de dados...');

    const keys = await GeminiKey.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'apiKey', 'usageCount', 'errorCount', 'lastUsedAt', 'lastErrorAt'],
      order: [['usageCount', 'ASC'], ['lastErrorAt', 'ASC']] // Prioriza chaves menos usadas e com menos erros recentes
    });

    if (keys.length === 0) {
      throw new Error('Nenhuma chave Gemini ativa encontrada no banco de dados. Configure chaves na interface de administração.');
    }

    // Atualiza cache
    keysCache = keys;
    lastCacheUpdate = Date.now();

    console.log(`✅ Encontradas ${keys.length} chaves Gemini ativas`);
    return keys;
  } catch (error) {
    console.error('❌ Erro ao buscar chaves do banco:', error);
    throw error;
  }
}

/**
 * Atualiza estatísticas de uma chave no banco de dados
 */
async function updateKeyStatsInDatabase(keyId, success = true) {
  try {
    const key = await GeminiKey.findByPk(keyId);
    if (!key) {
      console.warn(`⚠️ Chave ${keyId} não encontrada no banco para atualização`);
      return;
    }

    const updates = {
      usageCount: key.usageCount + 1,
      lastUsedAt: new Date()
    };

    if (!success) {
      updates.errorCount = key.errorCount + 1;
      updates.lastErrorAt = new Date();
    }

    await key.update(updates);

    // Invalida cache para forçar recarregamento
    keysCache = [];
    lastCacheUpdate = null;

    console.log(`📊 Estatísticas atualizadas para chave ${key.name}: uso=${updates.usageCount}, erros=${updates.errorCount || key.errorCount}`);
  } catch (error) {
    console.error('❌ Erro ao atualizar estatísticas no banco:', error);
  }
}

/**
 * Detecta erros de rate limit
 */
function isRateLimitError(error) {
  const rateLimitIndicators = [
    'quota exceeded',
    'rate limit',
    '429',
    'RESOURCE_EXHAUSTED'
  ];
  return rateLimitIndicators.some(indicator => error.message.toLowerCase().includes(indicator.toLowerCase()));
}

/**
 * Faz chamada para a API Gemini
 */
async function makeGeminiApiCall(systemPrompt, userPrompt, apiKey) {
  const url = `${GEMINI_API_URL}?key=${apiKey}`;
  const body = {
    contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 200 }
  };

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
  return data.candidates[0]?.content?.parts[0]?.text || 'Sem resposta.';
}

/**
 * Processa consulta com rotação automática de chaves
 */
async function processWithKeyRotation(systemPrompt, userPrompt) {
  const keys = await getActiveKeysFromDatabase();
  let attempts = 0;
  const maxAttempts = keys.length * MAX_RETRIES_PER_KEY;

  while (attempts < maxAttempts) {
    // Filtra chaves elegíveis (fora de cooldown)
    const now = Date.now();
    const eligibleKeys = keys.filter(k => {
      const until = keyCooldownUntil.get(k.id) || 0;
      return now >= until;
    });

    if (eligibleKeys.length === 0) {
      // Nenhuma chave disponível agora: aguarda até a próxima ficar disponível, mas sem pausar 60s inteiros
      const nextAvailable = Math.min(...keys.map(k => (keyCooldownUntil.get(k.id) || now)));
      const waitMs = Math.max(0, Math.min(nextAvailable - now, 2000)); // espera curta (<=2s)
      if (waitMs > 0) {
        await new Promise(r => setTimeout(r, waitMs));
      }
      continue;
    }

    const currentKeyIndex = attempts % eligibleKeys.length;
    const currentKey = eligibleKeys[currentKeyIndex];

    console.log(`🤖 Tentando com chave "${currentKey.name}" (tentativa ${attempts + 1}/${maxAttempts})`);

    try {
      const result = await makeGeminiApiCall(systemPrompt, userPrompt, currentKey.apiKey);

      // Sucesso - atualiza estatísticas
      await updateKeyStatsInDatabase(currentKey.id, true);

      console.log(`✅ Sucesso com chave "${currentKey.name}"!`);
      return {
        success: true,
        data: result,
        keyUsed: currentKey.name,
        keyId: currentKey.id
      };

    } catch (error) {
      console.error(`❌ Erro com chave "${currentKey.name}": ${error.message}`);

      // Atualiza estatísticas de erro
      await updateKeyStatsInDatabase(currentKey.id, false);

      if (isRateLimitError(error)) {
        const untilTs = Date.now() + WAIT_TIME_MS;
        keyCooldownUntil.set(currentKey.id, untilTs);
        const untilDate = new Date(untilTs).toISOString();
        console.log(`⛔ Rate limit na chave "${currentKey.name}". Em cooldown até ${untilDate}. Rotacionando imediatamente para outra chave...`);
      }

      attempts++;
    }
  }

  throw new Error('Todas as chaves esgotadas após múltiplas tentativas.');
}

/**
 * Função principal para processar produtos com IA
 */
async function processProductWithAI(productDescription) {
  try {
    const systemPrompt = `Você é um extrator de informações. Sua tarefa é analisar apenas a string de descrição de um produto (sem contexto adicional) e retornar um JSON padronizado. Não invente nada: se um campo não estiver claramente presente na descrição, retorne null.

Formato de saída (obrigatório):
{
  "tipo_embalagem": string|null,
  "nome_produto": string|null,
  "marca": string|null,
  "quantidade": number|null,
  "peso": string|null,
  "categoria": string|null
}

Regras gerais:
- Use apenas a própria descrição como fonte. Não use conhecimento externo.
- Não deduza marca, tipo de embalagem, quantidade, peso ou categoria se não estiverem explícitos de forma inequívoca.
- A saída deve ser somente o JSON, sem comentários, explicações ou texto extra.

Normalização:
- nome_produto e marca em Title Case (ex.: "Creme de Leite", "Coca-Cola").
- Remova códigos e ruídos do nome_produto (ex.: "- 1X1", "- KG", códigos numéricos internos, "F4", "MC", etc.).
- quantidade: extraia quando houver padrão claro (ex.: 1X1, 2UN, 3 UND). Guarde como número inteiro (1, 2, 3). Se não houver, null.
- peso (conteúdo líquido): string normalizada no formato valor+unidade sem espaço (ex.: 200g, 800g, 1.5L, 500ml).
  - Converta vírgula decimal para ponto (1,5LT → 1.5L).
  - Unidades válidas: g, kg, ml, L.
  - Se não houver indicação clara, null.

Tipo de embalagem (preencher apenas com evidência clara):
- PT, PCT → Pacote
- CX → Caixa
- SCH, SACH → Sachê
- TP, TPK, TETRA → Tetra Pak
- TAB → Tablete
- PET → Garrafa PET
- LT → Lata apenas quando aparecer como token de embalagem (ex.: "... LT - 1X1 220ML").
  - Se LT/LT. aparecer colado a número como unidade de volume (ex.: 1,5LT), não é embalagem; normalize para 1.5L em peso e deixe tipo_embalagem como null.

Abreviações de produto (expanda somente quando inequívocas):
- CLT, CR LEITE, CR LT → Creme de Leite
- LEITE COND, COND → Leite Condensado
- LEITE PO → Leite em Pó
- CHOC → Chocolate
- REFRI, REFRIG → Refrigerante
- AGUA MIN → Água Mineral
- QUEIJO MUS, QJ MUS, MUSS → Queijo Mussarela
- P PAO FRANCES → Pão Francês

Categoria (preencher com base em palavras-chave explícitas; se ambíguo, null):
- Hortifruti → ALFACE, TOMATE, CENOURA, CEBOLA, MAÇÃ, MACA, LIMAO, ALMEIRAO
- Carnes → FRANGO, BISTECA, COXAO, COSTELA, CARNE, SUINA, BOVINO
- Laticínios → LEITE, CREME DE LEITE, QUEIJO, MUSSARELA
- Bebidas → REFRI, REFRIGERANTE, AGUA, ENERGETICO, SUCO, CERVEJA
- Padaria → PAO, PÃO, BOLO
- Doces e Chocolates → CHOC, BOMBOM, TRIDENT, GOMA, PASTILHA
- Mercearia → MAIONESE, KETCHUP, MOSTARDA, TEMPERO, FILME PVC, PALITO DENTE

Marca: Preencha apenas se o nome da marca estiver explícito (ex.: Seara, Piracanjuba, Italac, Nestlé, Coca-Cola, Hellmann's, Trident, Puríssima, Leev).`;

    const userPrompt = `Analise esta descrição de produto e retorne apenas o JSON conforme as regras: "${productDescription}"`;

    const result = await processWithKeyRotation(systemPrompt, userPrompt);

    // Tenta fazer parse do JSON retornado pela IA
    try {
      const parsedData = JSON.parse(result.data);
      return {
        success: true,
        data: parsedData,
        keyUsed: result.keyUsed,
        keyId: result.keyId
      };
    } catch (parseError) {
      console.error('❌ Erro ao fazer parse do JSON retornado pela IA:', parseError);
      return {
        success: false,
        error: 'Resposta da IA não é um JSON válido',
        rawResponse: result.data
      };
    }

  } catch (error) {
    console.error('❌ Erro geral no processamento com IA:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  processProductWithAI,
  getActiveKeysFromDatabase,
  updateKeyStatsInDatabase,
  /**
   * Processa usando um prompt customizado (lido de arquivo) e uma descrição de produto.
   * Retorna { success, data|error, keyUsed, keyId } com data já parseada.
   */
  async processProductWithPrompt(systemPrompt, productDescription) {
    try {
      const userPrompt = `Analise esta descrição de produto e retorne apenas o JSON conforme as regras: "${productDescription}"`;
      const result = await processWithKeyRotation(systemPrompt, userPrompt);
      const raw = result.data || '';
      // Log resumido da resposta para depuração
      console.log(`[IA] Resposta (parcial, ${raw.length} chars):`, raw.slice(0, 200).replace(/\n/g, ' '));

      // Tenta parse direto, depois heurísticas para extrair JSON de respostas com ruído
      const tryParse = (text) => {
        try { return { ok: true, json: JSON.parse(text) }; } catch { return { ok: false }; }
      };

      // 1) Tentativa direta
      let parsedTry = tryParse(raw);
      // 2) Remove cercas de código
      if (!parsedTry.ok) {
        const noFences = raw.replace(/```json[\s\S]*?```/gi, (m) => m.replace(/```json|```/gi, ''))
                            .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, ''))
                            .trim();
        parsedTry = tryParse(noFences);
      }
      // 3) Extrai primeiro bloco que começa com { e termina com }
      if (!parsedTry.ok) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) parsedTry = tryParse(match[0]);
      }
      if (!parsedTry.ok) {
        return { success: false, error: 'JSON inválido retornado pela IA', rawResponse: raw };
      }

      return { success: true, data: parsedTry.json, keyUsed: result.keyUsed, keyId: result.keyId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  /**
   * Processa uma lista de descrições em lote.
   * items: Array<{ id: number, descricao: string }>
   * Retorna { success, data: Array<{ id, resultado }>|error }
   */
  async processProductsBatchWithPrompt(systemPrompt, items) {
    try {
      if (!Array.isArray(items) || items.length === 0) {
        return { success: false, error: 'Lista de itens vazia' };
      }

      const numbered = items.map((it, idx) => ({ index: idx + 1, id: it.id, descricao: it.descricao }));
      const listText = numbered.map(it => `- id: ${it.id} | descricao: ${it.descricao}`).join('\n');

      const batchUserPrompt = `Você receberá uma lista de itens com id e descricao. Para CADA item, aplique exatamente as regras do prompt base (acima) e retorne SOMENTE um JSON no formato de array, na mesma ordem, onde cada elemento é um objeto com:\n{\n  "id": <id_do_item>,\n  "resultado": { /* JSON conforme especificação (tipo_embalagem, nome_produto, marca, quantidade, peso, categoria) */ }\n}\n\nREGRAS CRÍTICAS:\n- Não inclua nenhum texto fora do JSON.\n- A ordem do array DEVE corresponder à ordem de entrada.\n- Repita exatamente o id recebido para cada item.\n- Se um campo não existir, use null.\n\nLista de itens:\n${listText}`;

      const result = await processWithKeyRotation(systemPrompt, batchUserPrompt);
      const raw = result.data || '';
      console.log(`[IA-BATCH] Resposta (parcial, ${raw.length} chars):`, raw.slice(0, 200).replace(/\n/g, ' '));

      const tryParse = (text) => { try { return { ok: true, json: JSON.parse(text) }; } catch { return { ok: false }; } };
      let parsedTry = tryParse(raw);
      if (!parsedTry.ok) {
        const noFences = raw.replace(/```json[\s\S]*?```/gi, m => m.replace(/```json|```/gi, ''))
                            .replace(/```[\s\S]*?```/g, m => m.replace(/```/g, ''))
                            .trim();
        parsedTry = tryParse(noFences);
      }
      if (!parsedTry.ok) {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) parsedTry = tryParse(match[0]);
      }
      if (!parsedTry.ok || !Array.isArray(parsedTry.json)) {
        return { success: false, error: 'JSON de lote inválido retornado pela IA', rawResponse: raw };
      }

      const arr = parsedTry.json;
      // Validação leve: garantir que cada elemento tenha id e resultado
      const normalized = arr.map(el => ({ id: el.id, resultado: el.resultado }));
      return { success: true, data: normalized };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
};
