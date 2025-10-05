// server/routes/notas.js
const express = require('express');
const router = express.Router();
const { NotaFiscal, ItemNota, sequelize } = require('../models'); // Importa sequelize
const { Op } = require('sequelize'); // Importa operadores

// Função para converter formato brasileiro para decimal
function converterParaDecimal(valor) {
  if (!valor || valor === '') return 0;
  // Converte vírgula para ponto e remove espaços
  const valorLimpo = String(valor).replace(/\s/g, '').replace(',', '.');
  const numero = parseFloat(valorLimpo);
  return isNaN(numero) ? 0 : numero;
}

// Rota para salvar uma nova NFC-e
router.post('/salvar', async (req, res) => {
  try {
    const { chave, versao, tpAmb, cIdToken, vSig, emitente, itens } = req.body;

    // Verifica se a nota já existe
    const notaExistente = await NotaFiscal.findOne({ where: { chave } });
    if (notaExistente) {
      return res.status(409).json({ message: 'NFC-e com esta chave já foi salva.' });
    }

    // Inicia uma transação para garantir consistência
    const transaction = await sequelize.transaction();

    try {
      // Cria a nota fiscal
      const novaNota = await NotaFiscal.create({
        chave,
        versao,
        ambiente: tpAmb,
        cIdToken,
        vSig,
        cnpjEmitente: emitente?.cnpj,
        nomeEmitente: emitente?.nome,
        ieEmitente: emitente?.ie
      }, { transaction });

      // Cria os itens associados
      if (itens && Array.isArray(itens)) {
        const itensParaCriar = itens.map(item => ({
          notaFiscalId: novaNota.id,
          codigo: item.codigo,
          descricao: item.descricao,
          quantidade: converterParaDecimal(item.qtde),
          unidade: item.un,
          valorUnitario: converterParaDecimal(item.unitario),
          valorTotal: converterParaDecimal(item.total)
        }));
        await ItemNota.bulkCreate(itensParaCriar, { transaction });
      }

      // Comita a transação
      await transaction.commit();

      res.status(201).json({ message: 'NFC-e salva com sucesso!', id: novaNota.id });
    } catch (err) {
      // Reverte a transação em caso de erro
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error('Erro ao salvar NFC-e:', error);
    res.status(500).json({ message: 'Erro interno ao salvar NFC-e.', error: error.message });
  }
});

// Rota para listar NFC-e salvas (com paginação básica)
router.get('/', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { count, rows } = await NotaFiscal.findAndCountAll({
      attributes: ['id', 'chave', 'nomeEmitente', 'createdAt'], // Seleciona campos relevantes
      limit,
      offset,
      order: [['createdAt', 'DESC']] // Ordena pela mais recente
    });

    res.json({
      notas: rows,
      total: count,
      page,
      pages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('Erro ao listar NFC-e:', error);
    res.status(500).json({ message: 'Erro interno ao listar NFC-e.', error: error.message });
  }
});

// Rota para buscar itens por nome (para a nova tela de busca)
router.get('/itens/buscar', async (req, res) => {
  try {
    const termo = req.query.q; // Obtém o termo de busca da query string ?q=...
    
    if (!termo) {
      return res.status(400).json({ message: 'Termo de busca "q" é obrigatório.' });
    }

    // Busca itens cuja descrição contenha o termo (case-insensitive)
    // e inclui os dados da nota fiscal associada (emitente)
    const itens = await ItemNota.findAll({
      where: {
        descricao: {
          [Op.like]: `%${termo}%` // LIKE '%termo%'
        }
      },
      include: [{
        model: NotaFiscal,
        as: 'notaFiscal',
        attributes: ['id', 'nomeEmitente'] // Inclui apenas o nome do emitente
      }],
      order: [['createdAt', 'DESC']] // Ordena pelos mais recentes
    });

    // Formata os resultados para facilitar o uso no frontend
    const resultados = itens.map(item => ({
      id: item.id,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorTotal,
      notaFiscalId: item.notaFiscalId,
      emitente: {
        nome: item.notaFiscal?.nomeEmitente || 'Desconhecido'
        // CNPJ foi removido do retorno por simplicidade na tela de busca
      }
    }));

    res.json({ itens: resultados, total: resultados.length });
  } catch (error) {
    console.error('Erro ao buscar itens por nome:', error);
    res.status(500).json({ message: 'Erro interno ao buscar itens.', error: error.message });
  }
});

// Rota para listar todos os itens cadastrados (com paginação opcional)
router.get('/itens', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = req.query.limit ? parseInt(req.query.limit) : null; // Se não informado, traz todos
    const offset = limit ? (page - 1) * limit : 0;

    // Configuração da query base
    const queryOptions = {
      include: [{
        model: NotaFiscal,
        as: 'notaFiscal',
        attributes: ['id', 'chave', 'versao', 'ambiente', 'cnpjEmitente', 'nomeEmitente', 'ieEmitente', 'createdAt', 'updatedAt']
      }],
      order: [['createdAt', 'DESC']] // Ordena pelos mais recentes
    };

    // Adiciona paginação apenas se limit foi informado
    if (limit) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
    }

    const { count, rows } = await ItemNota.findAndCountAll(queryOptions);

    // Formata os resultados com dados completos
    const itens = rows.map(item => ({
      id: item.id,
      codigo: item.codigo,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorTotal,
      notaFiscalId: item.notaFiscalId,
      notaFiscal: {
        id: item.notaFiscal?.id,
        chave: item.notaFiscal?.chave,
        versao: item.notaFiscal?.versao,
        ambiente: item.notaFiscal?.ambiente,
        cnpjEmitente: item.notaFiscal?.cnpjEmitente,
        nomeEmitente: item.notaFiscal?.nomeEmitente,
        ieEmitente: item.notaFiscal?.ieEmitente,
        dataLeitura: item.notaFiscal?.createdAt,
        dataAtualizacao: item.notaFiscal?.updatedAt
      },
      dataCriacao: item.createdAt,
      dataAtualizacao: item.updatedAt
    }));

    const response = {
      itens,
      total: count,
      page,
      limit: limit || 'todos'
    };

    // Adiciona informações de paginação apenas se limit foi informado
    if (limit) {
      response.pages = Math.ceil(count / limit);
    }

    res.json(response);
  } catch (error) {
    console.error('Erro ao listar todos os itens:', error);
    res.status(500).json({ message: 'Erro interno ao listar itens.', error: error.message });
  }
});

// Rota para obter detalhes de uma NFC-e específica (DEVE VIR POR ÚLTIMO)
// Usa uma rota mais específica para evitar conflitos
router.get('/detalhes/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const nota = await NotaFiscal.findByPk(id, {
      include: [{ model: ItemNota, as: 'itens' }] // Inclui os itens relacionados
    });

    if (!nota) {
      return res.status(404).json({ message: 'NFC-e não encontrada.' });
    }

    res.json(nota);
  } catch (error) {
    console.error('Erro ao obter detalhes da NFC-e:', error);
    res.status(500).json({ message: 'Erro interno ao obter detalhes da NFC-e.', error: error.message });
  }
});

// Rota para rebuscar itens de uma NFC-e específica
router.post('/rebuscar-itens/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Busca a nota fiscal
    const nota = await NotaFiscal.findByPk(id);
    if (!nota) {
      return res.status(404).json({ 
        success: false,
        message: 'NFC-e não encontrada.' 
      });
    }

    // Constrói a URL da SEFAZ
    const sefazUrl = `https://www.sefaz.mt.gov.br/nfce/consultanfce?p=${nota.chave}|${nota.versao}|${nota.ambiente}|${nota.cIdToken}|${nota.vSig}`;
    
    console.log(`🔄 Rebuscando itens para nota ${id}: ${sefazUrl}`);
    
    // Busca os dados da SEFAZ
    const proxiedUrl = `https://r.jina.ai/${sefazUrl}`;
    const response = await fetch(proxiedUrl, { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(`Falha ao obter página da SEFAZ (${response.status})`);
    }
    
    const text = await response.text();
    
    // Importa as funções de parsing do scan.js
    const { parseNfceText } = require('./scan');
    const detalhes = parseNfceText(text);
    
    if (!detalhes.itens || detalhes.itens.length === 0) {
      return res.json({
        success: false,
        message: 'Nenhum item encontrado na rebusca da SEFAZ.'
      });
    }
    
    console.log(`📦 Encontrados ${detalhes.itens.length} itens na rebusca`);
    
    // Inicia transação para sincronizar itens
    const transaction = await sequelize.transaction();
    
    try {
      // Busca itens existentes para esta nota
      const itensExistentes = await ItemNota.findAll({
        where: { notaFiscalId: id },
        transaction
      });
      
      console.log(`📋 Itens existentes no banco: ${itensExistentes.length}`);
      
      let itensNovos = 0;
      let itensAtualizados = 0;
      let itensCorrigidos = 0;
      
      // Processa cada item encontrado na rebusca
      for (const itemNovo of detalhes.itens) {
        // Busca item existente que corresponda (por descrição, quantidade e valor)
        const itemExistente = itensExistentes.find(existente => 
          existente.descricao === itemNovo.descricao &&
          Math.abs(converterParaDecimal(existente.quantidade) - converterParaDecimal(itemNovo.qtde)) < 0.01 &&
          Math.abs(converterParaDecimal(existente.valorTotal) - converterParaDecimal(itemNovo.total)) < 0.01
        );
        
        if (itemExistente) {
          // Item já existe - verifica se precisa corrigir notaFiscalId
          if (!itemExistente.notaFiscalId || itemExistente.notaFiscalId !== parseInt(id)) {
            await itemExistente.update({
              notaFiscalId: parseInt(id)
            }, { transaction });
            itensCorrigidos++;
            console.log(`🔧 Corrigido notaFiscalId para item: ${itemExistente.descricao}`);
          }
        } else {
          // Item não existe - cria novo
          await ItemNota.create({
            notaFiscalId: parseInt(id),
            codigo: itemNovo.codigo,
            descricao: itemNovo.descricao,
            quantidade: converterParaDecimal(itemNovo.qtde),
            unidade: itemNovo.un,
            valorUnitario: converterParaDecimal(itemNovo.unitario),
            valorTotal: converterParaDecimal(itemNovo.total)
          }, { transaction });
          itensNovos++;
          console.log(`➕ Novo item criado: ${itemNovo.descricao}`);
        }
      }
      
      // Busca itens órfãos (com notaFiscalId nulo) que possam pertencer a esta nota
      const itensOrfaos = await ItemNota.findAll({
        where: {
          notaFiscalId: null,
          descricao: {
            [Op.in]: detalhes.itens.map(item => item.descricao)
          }
        },
        transaction
      });
      
      // Tenta associar itens órfãos a esta nota
      for (const itemOrfao of itensOrfaos) {
        const itemCorrespondente = detalhes.itens.find(item => 
          item.descricao === itemOrfao.descricao &&
          Math.abs(converterParaDecimal(itemOrfao.quantidade) - converterParaDecimal(item.qtde)) < 0.01 &&
          Math.abs(converterParaDecimal(itemOrfao.valorTotal) - converterParaDecimal(item.total)) < 0.01
        );
        
        if (itemCorrespondente) {
          await itemOrfao.update({
            notaFiscalId: parseInt(id)
          }, { transaction });
          itensCorrigidos++;
          console.log(`🔗 Item órfão associado à nota: ${itemOrfao.descricao}`);
        }
      }
      
      await transaction.commit();
      
      const mensagem = `Rebusca concluída: ${itensNovos} novos itens, ${itensCorrigidos} itens corrigidos`;
      console.log(`✅ ${mensagem}`);
      
      res.json({
        success: true,
        message: mensagem,
        estatisticas: {
          itensNovos,
          itensCorrigidos,
          itensTotal: detalhes.itens.length
        }
      });
      
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
    
  } catch (error) {
    console.error('Erro na rebusca de itens:', error);
    res.status(500).json({ 
      success: false,
      message: 'Erro interno na rebusca de itens.', 
      error: error.message 
    });
  }
});

// Rota para obter detalhes de uma NFC-e específica por chave (para verificação no frontend)
router.get('/detalhes/chave/:chave', async (req, res) => {
  try {
    const { chave } = req.params;

    // Valida se a chave tem o formato correto (44 dígitos)
    if (!/^\d{44}$/.test(chave)) {
      return res.status(400).json({ message: 'Chave da NFC-e inválida.' });
    }

    const nota = await NotaFiscal.findOne({
      where: { chave },
      include: [{ model: ItemNota, as: 'itens' }] // Inclui os itens relacionados
    });

    if (!nota) {
      return res.status(404).json({ message: 'NFC-e não encontrada.' });
    }

    res.json(nota);
  } catch (error) {
    console.error('Erro ao obter detalhes da NFC-e por chave:', error);
    res.status(500).json({ message: 'Erro interno ao obter detalhes da NFC-e.', error: error.message });
  }
});

// Rota para obter detalhes de uma NFC-e específica por ID numérico (mantém compatibilidade)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Verifica se é um ID numérico para evitar conflitos com rotas específicas
    if (!/^\d+$/.test(id)) {
      return res.status(404).json({ message: 'Rota não encontrada.' });
    }

    const nota = await NotaFiscal.findByPk(id, {
      include: [{ model: ItemNota, as: 'itens' }] // Inclui os itens relacionados
    });

    if (!nota) {
      return res.status(404).json({ message: 'NFC-e não encontrada.' });
    }

    res.json(nota);
  } catch (error) {
    console.error('Erro ao obter detalhes da NFC-e:', error);
    res.status(500).json({ message: 'Erro interno ao obter detalhes da NFC-e.', error: error.message });
  }
});

module.exports = router;