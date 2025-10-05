// server/services/cnpjService.js
const fetch = require('node-fetch');

/**
 * Serviço para consultar dados de CNPJ usando OpenCNPJ
 * Documentação: https://opencnpj.org/
 * Endpoint: GET https://api.opencnpj.org/{CNPJ}
 */

// Função para limpar CNPJ (remover máscara)
function limparCNPJ(cnpj) {
  if (!cnpj) return null;
  return cnpj.replace(/\D/g, ''); // Remove tudo que não é dígito
}

// Função para validar CNPJ
function validarCNPJ(cnpj) {
  const cnpjLimpo = limparCNPJ(cnpj);
  if (!cnpjLimpo || cnpjLimpo.length !== 14) return false;
  
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{13}$/.test(cnpjLimpo)) return false;
  
  // Validação do dígito verificador
  let soma = 0;
  let peso = 2;
  
  // Primeiro dígito verificador
  for (let i = 11; i >= 0; i--) {
    soma += parseInt(cnpjLimpo.charAt(i)) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  
  let resto = soma % 11;
  let dv1 = resto < 2 ? 0 : 11 - resto;
  
  if (parseInt(cnpjLimpo.charAt(12)) !== dv1) return false;
  
  // Segundo dígito verificador
  soma = 0;
  peso = 2;
  
  for (let i = 12; i >= 0; i--) {
    soma += parseInt(cnpjLimpo.charAt(i)) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  
  resto = soma % 11;
  let dv2 = resto < 2 ? 0 : 11 - resto;
  
  return parseInt(cnpjLimpo.charAt(13)) === dv2;
}

// Função para formatar data brasileira para ISO
function formatarData(data) {
  if (!data) return null;
  
  // Se já está no formato ISO, retorna
  if (data.includes('-')) return data;
  
  // Se está no formato DD/MM/YYYY, converte
  if (data.includes('/')) {
    const [dia, mes, ano] = data.split('/');
    return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  
  return null;
}

// Função para formatar valor monetário
function formatarValor(valor) {
  if (!valor) return null;
  
  // Remove formatação e converte para decimal
  const valorLimpo = String(valor).replace(/[^\d,.-]/g, '').replace(',', '.');
  const numero = parseFloat(valorLimpo);
  
  return isNaN(numero) ? null : numero;
}

/**
 * Busca dados completos do CNPJ na Receita Federal
 * @param {string} cnpj - CNPJ com ou sem máscara
 * @returns {Object|null} Dados da empresa ou null se não encontrado
 */
async function buscarDadosCNPJ(cnpj) {
  try {
    const cnpjLimpo = limparCNPJ(cnpj);
    
    if (!validarCNPJ(cnpjLimpo)) {
      console.warn(`CNPJ inválido: ${cnpj}`);
      return null;
    }
    
    console.log(`🔍 Buscando dados do CNPJ: ${cnpjLimpo}`);
    
    // Usa a API pública do OpenCNPJ (aceita com/sem pontuação)
    const url = `https://api.opencnpj.org/${cnpjLimpo}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'NFC-e-Scan/1.0'
      },
      timeout: 10000 // 10 segundos de timeout
    });
    
    // Tratamento específico conforme documentação do OpenCNPJ
    if (response.status === 404) {
      console.warn(`CNPJ não encontrado no OpenCNPJ: ${cnpjLimpo}`);
      return null;
    }
    if (response.status === 429) {
      console.warn(`Rate limit do OpenCNPJ excedido (429). Tentará novamente via retry/backoff.`);
      return null; // permite retry com backoff na camada superior
    }
    if (!response.ok) {
      throw new Error(`Erro na API OpenCNPJ: ${response.status} ${response.statusText}`);
    }
    
    const dados = await response.json();
    
    // Extrai telefone (primeiro número, caso exista)
    let telefoneFormatado = null;
    if (Array.isArray(dados.telefones) && dados.telefones.length > 0) {
      const tel = dados.telefones[0];
      if (tel && (tel.ddd || tel.numero)) {
        const ddd = tel.ddd ? `(${tel.ddd}) ` : '';
        telefoneFormatado = `${ddd}${tel.numero || ''}`.trim();
      }
    }

    // Mapeia os dados da API para o formato do nosso banco
    const dadosEmpresa = {
      cnpj: dados.cnpj ? limparCNPJ(dados.cnpj) : cnpjLimpo,
      nomeEmitente: dados.razao_social || null,
      nomeFantasia: dados.nome_fantasia || null,
      situacaoCadastral: dados.situicao_cadastral || dados.situacao_cadastral || null,
      dataAbertura: formatarData(dados.data_inicio_atividade),
      capitalSocial: formatarValor(dados.capital_social),
      naturezaJuridica: dados.natureza_juridica || null,
      endereco: dados.logradouro ? 
        `${dados.logradouro}, ${dados.numero || 'S/N'}${dados.complemento ? ', ' + dados.complemento : ''}` : null,
      cep: dados.cep || null,
      municipio: dados.municipio || null,
      uf: dados.uf || null,
      telefone: telefoneFormatado,
      email: dados.email || null,
      ieEmitente: null // OpenCNPJ não fornece IE
    };
    
    console.log(`✅ Dados do CNPJ encontrados: ${dadosEmpresa.nomeEmitente}`);
    
    return dadosEmpresa;
    
  } catch (error) {
    console.error(`❌ Erro ao buscar dados do CNPJ ${cnpj}:`, error.message);
    return null;
  }
}

/**
 * Busca dados do CNPJ com retry automático
 * @param {string} cnpj - CNPJ para buscar
 * @param {number} maxTentativas - Número máximo de tentativas (padrão: 3)
 * @returns {Object|null} Dados da empresa ou null
 */
async function buscarDadosCNPJComRetry(cnpj, maxTentativas = 3) {
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      console.log(`🔄 Tentativa ${tentativa}/${maxTentativas} para CNPJ: ${cnpj}`);
      
      const dados = await buscarDadosCNPJ(cnpj);
      
      if (dados) {
        return dados;
      }
      
      // Aguarda antes da próxima tentativa (backoff exponencial)
      if (tentativa < maxTentativas) {
        const delay = Math.pow(2, tentativa) * 1000; // 2s, 4s, 8s...
        console.log(`⏳ Aguardando ${delay}ms antes da próxima tentativa...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
    } catch (error) {
      console.error(`❌ Tentativa ${tentativa} falhou:`, error.message);
      
      if (tentativa === maxTentativas) {
        console.error(`💥 Todas as tentativas falharam para CNPJ: ${cnpj}`);
        return null;
      }
    }
  }
  
  return null;
}

module.exports = {
  buscarDadosCNPJ,
  buscarDadosCNPJComRetry,
  limparCNPJ,
  validarCNPJ
};
