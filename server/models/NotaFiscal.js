// server/models/NotaFiscal.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const NotaFiscal = sequelize.define('NotaFiscal', {
  // Chave primária auto-incremental
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Chave da NFC-e (44 dígitos)
  chave: {
    type: DataTypes.STRING(44),
    allowNull: false,
    unique: true // Assume-se que a chave seja única
  },
  // Versão do QR Code
  versao: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  // Ambiente (1-Produção, 2-Homologação)
  ambiente: {
    type: DataTypes.STRING(1),
    allowNull: true
  },
  // cIdToken (se presente)
  cIdToken: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // vSig (se presente)
  vSig: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // CNPJ do emitente (20 dígitos para incluir máscara)
  cnpjEmitente: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // Nome/Razão Social do emitente
  nomeEmitente: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  // Inscrição Estadual do emitente
  ieEmitente: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  // Data de emissão (extraída da chave ou de outro campo)
  // dataEmissao: {
  //   type: DataTypes.DATE,
  //   allowNull: true
  // },
  // Valor total da nota (pode ser calculado a partir dos itens)
  // valorTotal: {
  //   type: DataTypes.DECIMAL(10, 2),
  //   allowNull: true
  // }
}, {
  // Outras opções do modelo
  tableName: 'notas_fiscais', // Nome da tabela no banco
  timestamps: true // Adiciona automaticamente createdAt e updatedAt
});

module.exports = NotaFiscal;