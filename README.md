# 📱 NFC-e Scan - Leitor de Notas Fiscais

Um aplicativo web completo para leitura e armazenamento de **NFC-e (Nota Fiscal do Consumidor Eletrônica)** através de **QR Code**, com interface moderna e arquitetura backend/frontend robusta.

## 🚀 Funcionalidades

### 📸 **Leitura de QR Code**
- Escaneamento em tempo real usando câmera do dispositivo
- Suporte a múltiplas câmeras (frontal/traseira)
- Fallback automático entre BarcodeDetector nativo e jsQR
- Interface visual com overlay de escaneamento

### 🔍 **Processamento Inteligente**
- Decodificação automática da chave NFC-e (44 dígitos)
- Validação de chave com algoritmo DV Mod11
- Extração de dados básicos do QR Code
- Busca automática de detalhes completos via proxy
- Parse inteligente de itens da nota fiscal

### 💾 **Armazenamento Local**
- Banco SQLite para persistência offline
- Salvamento automático de notas e itens
- Prevenção de duplicatas (verificação de chave única)
- Transações ACID para garantir consistência

### 📊 **Interface de Gestão**
- **Histórico**: Lista todas as NFC-e lidas com paginação
- **Busca por Produto**: Pesquisa itens por descrição
- **Detalhes**: Visualização completa de cada nota
- **Formatação**: Valores monetários em formato brasileiro

## 🏗️ Arquitetura

### **Backend (Node.js + Express)**
```
server/
├── config/
│   └── db.js              # Configuração do banco SQLite
├── models/
│   ├── index.js           # Configuração dos modelos
│   ├── NotaFiscal.js      # Modelo da nota fiscal
│   └── ItemNota.js        # Modelo dos itens
├── routes/
│   ├── notas.js           # API de notas fiscais
│   └── scan.js            # API de processamento de QR Code
└── index.js               # Servidor principal
```

### **Frontend (HTML5 + CSS3 + JavaScript)**
```
client/
├── styles/
│   ├── index.css          # Estilos da tela principal
│   ├── history.css        # Estilos do histórico
│   ├── details.css        # Estilos dos detalhes
│   └── productSearch.css  # Estilos da busca
├── index.html             # Tela principal (leitor)
├── history.html           # Histórico de notas
├── details.html           # Detalhes de uma nota
├── productSearch.html     # Busca de produtos
├── scanner.js             # Lógica do leitor QR
├── history.js             # Lógica do histórico
├── details.js             # Lógica dos detalhes
└── productSearch.js       # Lógica da busca
```

## 🛠️ Tecnologias Utilizadas

### **Backend**
- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **Sequelize** - ORM para banco de dados
- **SQLite3** - Banco de dados local
- **Fetch API** - Requisições HTTP para buscar detalhes

### **Frontend**
- **HTML5** - Estrutura semântica
- **CSS3** - Estilos modernos e responsivos
- **JavaScript ES6+** - Lógica da aplicação
- **WebRTC** - Acesso à câmera
- **jsQR** - Biblioteca de decodificação QR Code
- **BarcodeDetector** - API nativa do navegador

### **Ferramentas**
- **r.jina.ai** - Proxy para contornar CORS
- **Nodemon** - Desenvolvimento com hot reload

## 📋 Pré-requisitos

- **Node.js** 14+ 
- **NPM** 6+
- **Navegador moderno** com suporte a:
  - WebRTC (getUserMedia)
  - Canvas API
  - Fetch API

## 🚀 Instalação e Execução

### 1. **Clone o repositório**
```bash
git clone https://github.com/Giuseph66/Scan-NFC-e-.git
cd Scan-NFC-e-

```

### 2. **Instale as dependências**
```bash
npm install
```

### 3. **Execute o servidor**
```bash
# Desenvolvimento (com hot reload)
npm run dev

# Produção
npm start
```

### 4. **Acesse a aplicação**
Abra seu navegador em: `http://localhost:1425

## 📖 Como Usar

### **1. Escanear NFC-e**
1. Acesse a página principal
2. Clique em "Iniciar Leitura"
3. Aponte a câmera para o QR Code da NFC-e
4. Aguarde o processamento automático
5. A nota será salva automaticamente

### **2. Ver Histórico**
1. Clique em "Ver Histórico de Notas"
2. Navegue pelas páginas
3. Clique em "Ver Detalhes" para mais informações

### **3. Buscar Produtos**
1. Clique em "Buscar por Produto"
2. Digite o nome do produto
3. Veja os resultados em tempo real
4. Clique em "Ver Nota" para detalhes

## 🔧 API Endpoints

### **Processamento de QR Code**
```http
POST /api/scan/process
Content-Type: application/json

{
  "qrCode": "http://www.sefaz.mt.gov.br/nfce/consultanfce?p=..."
}
```

### **Notas Fiscais**
```http
GET    /api/notas/           # Listar notas
GET    /api/notas/:id        # Detalhes de uma nota
POST   /api/notas/salvar     # Salvar nova nota
```

### **Busca de Produtos**
```http
GET /api/notas/itens/buscar?q=termo
```

### **Listar Todos os Itens**
```http
GET /api/notas/itens                    # Todos os itens
GET /api/notas/itens?limit=50          # Com paginação
GET /api/notas/itens?page=2&limit=20   # Página específica
```

## 🗄️ Estrutura do Banco de Dados

### **Tabela: notas_fiscais**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INTEGER | Chave primária |
| chave | STRING(44) | Chave da NFC-e |
| versao | STRING(10) | Versão do QR Code |
| ambiente | STRING(1) | 1=Produção, 2=Homologação |
| cnpjEmitente | STRING(20) | CNPJ do emitente |
| nomeEmitente | STRING(255) | Nome/Razão Social |
| ieEmitente | STRING(20) | Inscrição Estadual |
| createdAt | DATETIME | Data de criação |
| updatedAt | DATETIME | Data de atualização |

### **Tabela: itens_nota**
| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | INTEGER | Chave primária |
| notaFiscalId | INTEGER | FK para notas_fiscais |
| codigo | STRING(50) | Código do produto |
| descricao | TEXT | Descrição do produto |
| quantidade | DECIMAL(10,4) | Quantidade |
| unidade | STRING(10) | Unidade (UN, KG, etc.) |
| valorUnitario | DECIMAL(10,2) | Valor unitário |
| valorTotal | DECIMAL(10,2) | Valor total |
| createdAt | DATETIME | Data de criação |
| updatedAt | DATETIME | Data de atualização |

## 🔒 Segurança

- **Validação de chave NFC-e** com algoritmo DV Mod11
- **Prevenção de duplicatas** por chave única
- **Transações ACID** para consistência
- **Sanitização de dados** de entrada
- **Tratamento robusto** de erros

## 🐛 Solução de Problemas

### **Câmera não funciona**
- Verifique as permissões do navegador
- Use HTTPS em produção
- Teste em navegador diferente

### **QR Code não é reconhecido**
- Verifique a qualidade da imagem
- Teste com QR Code de NFC-e válido
- Verifique a iluminação

### **Erro de CORS**
- O proxy r.jina.ai é usado automaticamente
- Verifique a conexão com a internet

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo `LICENSE` para mais detalhes.

## 👨‍💻 Autor

**Giuseph** - Desenvolvedor Full Stack
- Foco em segurança e tipagem forte
- Arquitetura simples e modular
- Offline-first com sincronização robusta

## 📞 Suporte

Se você encontrar algum problema ou tiver dúvidas:

1. Verifique a seção de [Solução de Problemas](#-solução-de-problemas)
2. Abra uma [Issue](https://github.com/seu-usuario/NFC-e_scan/issues)
3. Entre em contato via email

---

**⭐ Se este projeto foi útil para você, considere dar uma estrela!**