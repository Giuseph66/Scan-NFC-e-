// server/models/ItemNota.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ItemNota = sequelize.define('ItemNota', {
  // Chave primária auto-incremental
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Código do produto (pode vir no formato "Código: XXXX")
  codigo: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Descrição do produto
  descricao: {
    type: DataTypes.TEXT, // TEXT para descrições potencialmente longas
    allowNull: false
  },
  // Quantidade
  quantidade: {
    type: DataTypes.DECIMAL(10, 4), // Suporta decimais com até 4 casas
    allowNull: false
  },
  // Unidade (ex: UN, KG, LT)
  unidade: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  // Valor unitário
  valorUnitario: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Valor total do item
  valorTotal: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false
  },
  // Campos padronizados pela IA (opcionais)
  tipoEmbalagem: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  nomePadronizado: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  marca: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  quantidadePadronizada: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  peso: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  categoria: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Foreign key para NotaFiscal
  notaFiscalId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'notas_fiscais',
      key: 'id'
    }
  }
  // Pode-se adicionar campos como NCM, CFOP, etc., se necessário
}, {
  tableName: 'itens_nota',
  timestamps: true
});

module.exports = ItemNota;