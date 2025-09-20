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

// Função para verificar e adicionar colunas necessárias
async function verificarEstruturaBanco() {
  try {
    // Verifica se a coluna notaFiscalId existe na tabela itens_nota
    const [resultsItens] = await sequelize.query(`
      PRAGMA table_info(itens_nota);
    `);
    
    const temNotaFiscalId = resultsItens.some(col => col.name === 'notaFiscalId');
    
    if (!temNotaFiscalId) {
      console.log('🔧 Adicionando coluna notaFiscalId à tabela itens_nota...');
      await sequelize.query(`
        ALTER TABLE itens_nota ADD COLUMN notaFiscalId INTEGER;
      `);
      console.log('✅ Coluna notaFiscalId adicionada com sucesso.');
    }

    // Verifica se as novas colunas de CNPJ existem na tabela notas_fiscais
    const [resultsNotas] = await sequelize.query(`
      PRAGMA table_info(notas_fiscais);
    `);
    
    const colunasCNPJ = [
      'nomeFantasia', 'situacaoCadastral', 'dataAbertura', 'capitalSocial',
      'naturezaJuridica', 'endereco', 'cep', 'municipio', 'uf', 'telefone', 'email'
    ];
    
    for (const coluna of colunasCNPJ) {
      const temColuna = resultsNotas.some(col => col.name === coluna);
      
      if (!temColuna) {
        console.log(`🔧 Adicionando coluna ${coluna} à tabela notas_fiscais...`);
        
        let tipoColuna = 'TEXT';
        if (coluna === 'dataAbertura') tipoColuna = 'DATETIME';
        if (coluna === 'capitalSocial') tipoColuna = 'DECIMAL(15,2)';
        if (coluna === 'uf') tipoColuna = 'VARCHAR(2)';
        if (coluna === 'cep') tipoColuna = 'VARCHAR(10)';
        if (coluna === 'telefone') tipoColuna = 'VARCHAR(20)';
        if (coluna === 'email') tipoColuna = 'VARCHAR(255)';
        if (coluna === 'nomeFantasia') tipoColuna = 'VARCHAR(255)';
        if (coluna === 'situacaoCadastral') tipoColuna = 'VARCHAR(50)';
        if (coluna === 'naturezaJuridica') tipoColuna = 'VARCHAR(100)';
        if (coluna === 'municipio') tipoColuna = 'VARCHAR(100)';
        
        await sequelize.query(`
          ALTER TABLE notas_fiscais ADD COLUMN ${coluna} ${tipoColuna};
        `);
        console.log(`✅ Coluna ${coluna} adicionada com sucesso.`);
      }
    }
  } catch (error) {
    console.warn('⚠️ Aviso ao verificar estrutura do banco:', error.message);
  }
}

// Sincroniza os modelos com o banco de dados e inicia o servidor
sequelize.sync({ force: false }) // 'force: false' preserva dados existentes, apenas cria tabelas se não existirem
  .then(async () => {
    console.log('✅ Banco de dados SQLite conectado e modelos sincronizados.');
    
    // Verifica e atualiza estrutura se necessário
    await verificarEstruturaBanco();
    
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