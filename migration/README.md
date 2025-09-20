# Sistema de Migração NFC-e

Sistema Python para migrar dados do banco antigo (`database_old.sqlite`) para o novo sistema usando o endpoint de scan.

## 🚀 Instalação Rápida

```bash
# 1. Instala dependências e verifica configuração
python install.py

# 2. Testa conexões
python migrate_sqlite.py --test

# 3. Executa migração (modo de teste)
python migrate_sqlite.py --dry-run --limit 5

# 4. Executa migração real
python migrate_sqlite.py
```

## 📋 Pré-requisitos

- Python 3.7+
- Banco antigo: `database_old.sqlite` (no diretório raiz do projeto)
- Sistema novo rodando em `http://localhost:1425`

## 🔧 Configuração

### Estrutura do Banco Antigo

O sistema espera as seguintes tabelas no `database_old.sqlite`:

**Tabela `notas_fiscais`:**
- `id` (INTEGER PRIMARY KEY)
- `chave` (TEXT) - Chave da NFC-e
- `versao` (TEXT) - Versão do QR Code
- `ambiente` (TEXT) - Ambiente (1=Produção, 2=Homologação)
- `cIdToken` (TEXT) - cIdToken
- `vSig` (TEXT) - vSig
- `cnpjEmitente` (TEXT) - CNPJ do emitente
- `nomeEmitente` (TEXT) - Nome do emitente
- `ieEmitente` (TEXT) - Inscrição Estadual
- `createdAt` (DATETIME) - Data de criação
- `updatedAt` (DATETIME) - Data de atualização

**Tabela `itens_nota`:**
- `id` (INTEGER PRIMARY KEY)
- `notaFiscalId` (INTEGER) - FK para notas_fiscais
- `codigo` (TEXT) - Código do produto
- `descricao` (TEXT) - Descrição do produto
- `quantidade` (REAL) - Quantidade
- `unidade` (TEXT) - Unidade
- `valorUnitario` (REAL) - Valor unitário
- `valorTotal` (REAL) - Valor total
- `createdAt` (DATETIME)
- `updatedAt` (DATETIME)

## 📖 Uso

### Scripts Disponíveis

#### 1. `migrate_sqlite.py` - Script Principal
```bash
# Testa conexões
python migrate_sqlite.py --test

# Modo de teste (não processa realmente)
python migrate_sqlite.py --dry-run

# Migra apenas 10 notas
python migrate_sqlite.py --limit 10

# Migra todas as notas
python migrate_sqlite.py
```

#### 2. `migrate.py` - Script Completo
```bash
# Testa conexões
python migrate.py --test-connection

# Modo dry run
python migrate.py --dry-run --limit 5

# Migração normal
python migrate.py --limit 100 --offset 0
```

### Parâmetros

- `--limit N`: Limita o número de notas a processar
- `--offset N`: Pula as primeiras N notas
- `--dry-run`: Modo de teste (não processa realmente)
- `--test`: Apenas testa conexões
- `--config FILE`: Arquivo de configuração personalizado

## 🔄 Como Funciona

1. **Conecta no banco antigo** (`database_old.sqlite`)
2. **Busca notas válidas** (com todos os campos obrigatórios)
3. **Constrói URL do QR Code** usando a fórmula:
   ```
   https://www.sefaz.mt.gov.br/nfce/consultanfce?p={chave}|{versao}|{ambiente}|{cIdToken}|{vSig}
   ```
4. **Envia para API** do sistema novo (`/api/scan/process`)
5. **Processa resposta** e atualiza estatísticas

## 📊 Relatórios

O sistema gera relatórios em tempo real mostrando:
- ✅ Notas processadas com sucesso
- ❌ Notas que falharam
- ⚠️ Notas duplicadas
- 📊 Taxa de sucesso
- 📝 Lista de erros

## 🛠️ Solução de Problemas

### Erro: "Banco antigo não encontrado"
- Verifique se `database_old.sqlite` existe no diretório raiz do projeto
- Verifique se o arquivo não está corrompido

### Erro: "API retornou status 500"
- Verifique se o servidor do sistema novo está rodando
- Verifique se a porta 1425 está livre
- Verifique os logs do servidor

### Erro: "Timeout na requisição"
- A API pode estar sobrecarregada
- Tente reduzir o `BATCH_SIZE` na configuração
- Verifique a conexão de internet

### Notas duplicadas
- Normal! O sistema detecta automaticamente notas já existentes
- Não há problema, a migração continua normalmente

## 📁 Estrutura de Arquivos

```
migration/
├── migrate_sqlite.py      # Script principal simplificado
├── migrate.py             # Script completo com mais opções
├── install.py             # Instalador de dependências
├── requirements.txt       # Dependências Python
├── config.py              # Configurações gerais
├── sqlite_config.py       # Configurações específicas SQLite
├── database_connector.py  # Conector para banco antigo
├── api_client.py          # Cliente para API
├── logger.py              # Sistema de logs
└── README.md              # Este arquivo
```

## 🔒 Segurança

- ✅ **Validação de dados**: Verifica campos obrigatórios antes de processar
- ✅ **Retry automático**: Tenta novamente em caso de falha temporária
- ✅ **Rate limiting**: Pausa entre requisições para não sobrecarregar API
- ✅ **Logs detalhados**: Registra todas as operações para auditoria
- ✅ **Modo dry-run**: Permite testar sem processar realmente

## 📈 Performance

- **Processamento em lotes**: Processa múltiplas notas por vez
- **Barra de progresso**: Mostra progresso em tempo real
- **Retry inteligente**: Backoff exponencial em caso de falhas
- **Logs coloridos**: Interface amigável no terminal

## 🤝 Suporte

Em caso de problemas:
1. Execute `python migrate_sqlite.py --test` para verificar configuração
2. Verifique os logs em `migration.log`
3. Execute com `--dry-run` para testar sem processar
4. Verifique se o servidor do sistema novo está funcionando
