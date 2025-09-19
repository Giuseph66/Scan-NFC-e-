// server/index.js
const express = require('express');
const path = require('path');
const sequelize = require('./config/db');
// Importa os modelos para garantir que sejam definidos
require('./models');

const app = express();
const PORT = process.env.PORT || 1425

// Middleware para parsing de JSON no body
app.use(express.json());

// Middleware para servir arquivos estáticos da pasta 'client'
// Assumindo que a pasta 'client' está no mesmo nível de 'server'
app.use(express.static(path.join(__dirname, '..', 'client')));

// Rota básica para testar o servidor
app.get('/api/status', (req, res) => {
  res.json({ message: 'Servidor NFC-e Scan está rodando!', uptime: process.uptime() });
});

// Rota para servir o index.html principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'index.html'));
});

// Rotas da API
app.use('/api/notas', require('./routes/notas'));
app.use('/api/scan', require('./routes/scan'));

// Sincroniza os modelos com o banco de dados e inicia o servidor
sequelize.sync({ alter: true }) // 'alter: true' atualiza tabelas se o modelo mudar (útil para desenvolvimento)
  .then(() => {
    console.log('✅ Banco de dados SQLite conectado e modelos sincronizados.');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Servidor Express rodando em http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao banco de dados:', err);
  });

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Recebido SIGINT. Encerrando servidor...');
  try {
    await sequelize.close();
    console.log('✅ Conexão com o banco de dados fechada.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro ao fechar conexão com o banco:', err);
    process.exit(1);
  }
});