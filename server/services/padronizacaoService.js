// server/services/padronizacaoService.js
const fs = require('fs');
const path = require('path');
const { NotaFiscal, ItemNota, sequelize } = require('../models');
const { processProductsBatchWithPrompt, processProductWithPrompt } = require('./geminiServiceNew');

// Padroniza itens de uma nota (batch de 10 + fallback item a item)
async function padronizarItensDaNota(notaId) {
  const results = [];
  let updatedCount = 0;
  try {
    // Lê prompt
    const promptPath = path.join(__dirname, '..', '..', 'prompt.txt');
    let systemPrompt = '';
    try {
      systemPrompt = fs.readFileSync(promptPath, 'utf8');
    } catch (e) {
      systemPrompt = '';
      console.warn('⚠️ padronizacaoService: não foi possível ler prompt.txt:', e.message);
    }

    // Busca nota com itens
    const nota = await NotaFiscal.findByPk(notaId, { include: [{ model: ItemNota, as: 'itens' }] });
    if (!nota || !nota.itens || nota.itens.length === 0) {
      return { success: true, message: 'Sem itens para padronizar', updated: 0, results };
    }

    console.log(`🧠 [auto] Padronizando itens da nota ${notaId} (total=${nota.itens.length})`);

    const BATCH_SIZE = 10;
    for (let start = 0; start < nota.itens.length; start += BATCH_SIZE) {
      const slice = nota.itens.slice(start, start + BATCH_SIZE);

      // Tenta IA em lote
      let batchResult = null;
      try {
        batchResult = await processProductsBatchWithPrompt(systemPrompt, slice.map(it => ({ id: it.id, descricao: it.descricao || '' })));
      } catch (e) {
        console.warn('⚠️ padronizacaoService: falha no batch IA, fallback item a item:', e.message);
      }

      const idToResultado = new Map();
      if (batchResult && batchResult.success && Array.isArray(batchResult.data)) {
        batchResult.data.forEach(el => { idToResultado.set(el.id, el.resultado); });
      }

      for (const item of slice) {
        const descricao = item.descricao || '';
        if (!descricao.trim()) {
          results.push({ itemId: item.id, success: false, error: 'Descrição vazia' });
          continue;
        }

        let data = idToResultado.get(item.id) || null;
        if (!data) {
          const aiResult = await processProductWithPrompt(systemPrompt, descricao);
          if (!aiResult.success || !aiResult.data) {
            results.push({ itemId: item.id, success: false, error: aiResult.error || 'Falha IA' });
            continue;
          }
          data = aiResult.data;
        }

        const updates = {
          tipoEmbalagem: data.tipo_embalagem || null,
          nomePadronizado: data.nome_produto || null,
          marca: data.marca || null,
          quantidadePadronizada: Number.isInteger(data.quantidade) ? data.quantidade : (typeof data.quantidade === 'number' ? Math.round(data.quantidade) : null),
          peso: data.peso || null,
          categoria: data.categoria || null
        };

        const tx = await sequelize.transaction();
        try {
          await item.update(updates, { transaction: tx });
          await tx.commit();
          updatedCount++;
          results.push({ itemId: item.id, success: true, updates });
        } catch (e) {
          await tx.rollback();
          console.error(`❌ padronizacaoService: erro ao atualizar item ${item.id}:`, e);
          results.push({ itemId: item.id, success: false, error: e.message });
        }
      }
    }

    return { success: true, message: `Itens padronizados: ${updatedCount}/${nota.itens.length}`, updated: updatedCount, results };
  } catch (error) {
    console.error('❌ padronizacaoService: erro geral:', error);
    return { success: false, message: 'Erro ao padronizar itens', error: error.message, updated: updatedCount, results };
  }
}

module.exports = { padronizarItensDaNota };


