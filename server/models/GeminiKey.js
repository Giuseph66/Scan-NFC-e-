// server/models/GeminiKey.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const GeminiKey = sequelize.define('GeminiKey', {
  // Chave primária auto-incremental
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Nome identificador da chave (ex: "Chave Principal", "Backup 1")
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  // A chave de API em si
  apiKey: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  // Status da chave
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  // Estatísticas de uso
  usageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  // Contagem de erros
  errorCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false
  },
  // Última vez que foi usada
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Última vez que deu erro
  lastErrorAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Observações sobre a chave
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'gemini_keys',
  timestamps: true // createdAt e updatedAt
});

module.exports = GeminiKey;
