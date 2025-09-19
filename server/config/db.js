// server/config/db.js
const { Sequelize } = require('sequelize');
const path = require('path');

// Usando SQLite para simplicidade. O arquivo do banco será criado em 'database.sqlite'.
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, '..', '..', 'database.sqlite'), // Caminho relativo ao diretório raiz do projeto
  logging: false // Desativa logs SQL no console, opcional
});

module.exports = sequelize;