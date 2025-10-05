// server/models/index.js
// Este arquivo serve para associar os modelos e exportá-los juntos

const NotaFiscal = require('./NotaFiscal');
const ItemNota = require('./ItemNota');
const GeminiKey = require('./GeminiKey');
const sequelize = require('../config/db'); // Importa a instância do Sequelize

// Definindo a associação 1:N entre NotaFiscal e ItemNota
NotaFiscal.hasMany(ItemNota, {
  foreignKey: 'notaFiscalId', // Nome da coluna FK na tabela itens_nota
  as: 'itens' // Alias para incluir os itens ao buscar uma nota
});

ItemNota.belongsTo(NotaFiscal, {
  foreignKey: 'notaFiscalId', // Nome da coluna FK na tabela itens_nota
  as: 'notaFiscal' // Alias para incluir a nota ao buscar um item
});

// Exportando os modelos e a instância do Sequelize
module.exports = {
  NotaFiscal,
  ItemNota,
  GeminiKey,
  sequelize // Exporta a instância para uso em consultas raw, por exemplo
};