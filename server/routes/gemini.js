// server/routes/gemini.js
const express = require('express');
const router = express.Router();
const { GeminiKey, sequelize } = require('../models');
const { Op } = require('sequelize');

// Lista todas as chaves
router.get('/', async (req, res) => {
  try {
    const keys = await GeminiKey.findAll({
      attributes: [
        'id', 'name', 'isActive', 'usageCount', 'errorCount',
        'lastUsedAt', 'lastErrorAt', 'createdAt', 'updatedAt'
      ], // Não retorna a chave em si por segurança
      order: [['createdAt', 'DESC']]
    });

    res.json({
      success: true,
      keys: keys,
      total: keys.length
    });
  } catch (error) {
    console.error('Erro ao listar chaves Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao listar chaves.',
      error: error.message
    });
  }
});

// Obtém detalhes de uma chave específica (sem retornar a chave)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const key = await GeminiKey.findByPk(id, {
      attributes: [
        'id', 'name', 'isActive', 'usageCount', 'errorCount',
        'lastUsedAt', 'lastErrorAt', 'notes', 'createdAt', 'updatedAt'
      ]
    });

    if (!key) {
      return res.status(404).json({
        success: false,
        message: 'Chave não encontrada.'
      });
    }

    res.json({
      success: true,
      key: key
    });
  } catch (error) {
    console.error('Erro ao obter chave Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao obter chave.',
      error: error.message
    });
  }
});

// Cria uma nova chave
router.post('/', async (req, res) => {
  try {
    const { name, apiKey, notes } = req.body;

    if (!name || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Nome e chave de API são obrigatórios.'
      });
    }

    // Verifica se já existe uma chave com essa API key
    const existingKey = await GeminiKey.findOne({ where: { apiKey } });
    if (existingKey) {
      return res.status(409).json({
        success: false,
        message: 'Já existe uma chave cadastrada com essa API key.'
      });
    }

    const newKey = await GeminiKey.create({
      name,
      apiKey,
      notes,
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Chave criada com sucesso!',
      keyId: newKey.id
    });
  } catch (error) {
    console.error('Erro ao criar chave Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao criar chave.',
      error: error.message
    });
  }
});

// Atualiza uma chave existente
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, apiKey, isActive, notes } = req.body;

    const key = await GeminiKey.findByPk(id);
    if (!key) {
      return res.status(404).json({
        success: false,
        message: 'Chave não encontrada.'
      });
    }

    // Se está tentando alterar a API key, verifica se já existe outra com essa chave
    if (apiKey && apiKey !== key.apiKey) {
      const existingKey = await GeminiKey.findOne({
        where: {
          apiKey,
          id: { [Op.ne]: id }
        }
      });
      if (existingKey) {
        return res.status(409).json({
          success: false,
          message: 'Já existe outra chave cadastrada com essa API key.'
        });
      }
    }

    await key.update({
      name: name !== undefined ? name : key.name,
      apiKey: apiKey !== undefined ? apiKey : key.apiKey,
      isActive: isActive !== undefined ? isActive : key.isActive,
      notes: notes !== undefined ? notes : key.notes
    });

    res.json({
      success: true,
      message: 'Chave atualizada com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao atualizar chave Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao atualizar chave.',
      error: error.message
    });
  }
});

// Remove uma chave
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const key = await GeminiKey.findByPk(id);
    if (!key) {
      return res.status(404).json({
        success: false,
        message: 'Chave não encontrada.'
      });
    }

    await key.destroy();

    res.json({
      success: true,
      message: 'Chave removida com sucesso!'
    });
  } catch (error) {
    console.error('Erro ao remover chave Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao remover chave.',
      error: error.message
    });
  }
});

// Testa uma chave específica
router.post('/:id/test', async (req, res) => {
  try {
    const { id } = req.params;

    const key = await GeminiKey.findByPk(id);
    if (!key) {
      return res.status(404).json({
        success: false,
        message: 'Chave não encontrada.'
      });
    }

    if (!key.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Chave está desativada.'
      });
    }

    // Testa a chave fazendo uma chamada simples para a API Gemini
    const testPrompt = 'Responda apenas com "OK" se conseguir me entender.';

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key.apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: testPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 10 }
      })
    });

    if (response.ok) {
      // Atualiza estatísticas de uso
      await key.update({
        usageCount: key.usageCount + 1,
        lastUsedAt: new Date()
      });

      res.json({
        success: true,
        message: 'Chave testada com sucesso! Está funcionando corretamente.',
        statusCode: response.status
      });
    } else {
      const errorData = await response.text();

      // Atualiza estatísticas de erro
      await key.update({
        errorCount: key.errorCount + 1,
        lastErrorAt: new Date()
      });

      res.status(response.status).json({
        success: false,
        message: `Erro ao testar chave: ${response.status} - ${errorData}`,
        statusCode: response.status,
        error: errorData
      });
    }
  } catch (error) {
    console.error('Erro ao testar chave Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao testar chave.',
      error: error.message
    });
  }
});

// Obtém estatísticas gerais das chaves
router.get('/stats/summary', async (req, res) => {
  try {
    const totalKeys = await GeminiKey.count();
    const activeKeys = await GeminiKey.count({ where: { isActive: true } });
    const totalUsage = await GeminiKey.sum('usageCount');
    const totalErrors = await GeminiKey.sum('errorCount');

    res.json({
      success: true,
      stats: {
        totalKeys,
        activeKeys,
        inactiveKeys: totalKeys - activeKeys,
        totalUsage,
        totalErrors
      }
    });
  } catch (error) {
    console.error('Erro ao obter estatísticas das chaves Gemini:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno ao obter estatísticas.',
      error: error.message
    });
  }
});

module.exports = router;
