// server/routes/scan.js
const express = require('express');
const router = express.Router();
const { NotaFiscal, ItemNota, sequelize } = require('../models');
const { Op } = require('sequelize');
const { buscarDadosCNPJComRetry } = require('../services/cnpjService');

// Função para converter formato brasileiro para decimal
function converterParaDecimal(valor) {
  if (!valor || valor === '') return 0;
  // Converte vírgula para ponto e remove espaços
  const valorLimpo = String(valor).replace(/\s/g, '').replace(',', '.');
  const numero = parseFloat(valorLimpo);
  return isNaN(numero) ? 0 : numero;
}

// --- Funções de Parsing e Fetch (movidas do frontend) ---
function parseQrNfce(urlOrText) {
    let p = null;
    try {
        p = new URL(urlOrText).searchParams.get('p');
    } catch {
        const i = urlOrText.indexOf('p=');
        if (i >= 0) p = urlOrText.slice(i + 2);
    }
    if (!p) return null;

    const [chave, versao, tpAmb, cIdToken, vSig] = p.split('|');
    try {
        const chaveData = decodeChave(chave);
        return {
            chave, versao, tpAmb, cIdToken, vSig,
            emitente: {}, // Será preenchido pelo fetch
            itens: [],    // Será preenchido pelo fetch
            ...chaveData
        };
    } catch (e) {
        console.error("Chave inválida:", e);
        return null; // Chave inválida
    }
}

function decodeChave(chave) {
    if (!/^\d{44}$/.test(chave)) throw new Error('Chave inválida (formato)');
    const parts = {
        cUF: chave.slice(0, 2),
        AAMM: chave.slice(2, 6),
        CNPJ: chave.slice(6, 20),
        mod: chave.slice(20, 22),
        serie: chave.slice(22, 25),
        nNF: chave.slice(25, 34),
        tpEmis: chave.slice(34, 35),
        cNF: chave.slice(35, 43),
        DV: chave.slice(43, 44)
    };
    const dvCalc = dvMod11(chave.slice(0, 43));
    if (String(dvCalc) !== parts.DV) throw new Error('DV não confere');
    return parts;
}

function dvMod11(num43) {
    const pesos = [2, 3, 4, 5, 6, 7, 8, 9];
    let soma = 0;
    for (let i = 0; i < num43.length; i++) {
        const d = Number(num43[num43.length - 1 - i]);
        soma += d * pesos[i % pesos.length];
    }
    let dv = 11 - (soma % 11);
    if (dv >= 10) dv = 0;
    return dv;
}

function formatarCNPJ(cnpj) {
    if (!cnpj || cnpj.length !== 14) return cnpj;
    // Aplica máscara XX.XXX.XXX/XXXX-XX
    return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function toReadableProxyUrl(urlStr) {
    if (urlStr.startsWith('https://')) return `https://r.jina.ai/${urlStr}`;
    if (urlStr.startsWith('http://')) return `https://r.jina.ai/${urlStr}`;
    return `https://r.jina.ai/${encodeURIComponent(urlStr)}`;
}

function normalizeSpaces(s) {
    return (s || '').replace(/\u00A0/g, ' ').replace(/[\t ]+/g, ' ').trim();
}

function parseNfceText(text) {
    const out = { emitente: {}, itens: [] };
    const tn = (text || '').replace(/\*\*/g, '');
    let m = tn.match(/CNPJ\s*[:-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/i);
    if (!m) m = tn.match(/CNPJ\s*[:-]?\s*(\d{14})/i);
    if (m) out.emitente.cnpj = m[1];

    const lines = tn.split(/\r?\n/).map(normalizeSpaces).filter(Boolean);
    let nomeFound = null;
    if (!nomeFound) {
        const cnpjIdx = lines.findIndex(L => /CNPJ\s*[:-]?\s*(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}|\d{14})/i.test(L));
        if (cnpjIdx > 0) {
            const prev = lines[cnpjIdx - 1];
            if (prev && prev.length > 2 && !/CNPJ|CPF|Endere|IE|IM/i.test(prev)) nomeFound = prev;
        }
    }
    if (!nomeFound) {
        m = tn.match(/Raz[aã]o\s*Social\s*[:-]?\s*(.+)/i) || tn.match(/Emitente\s*[:-]?\s*(.+)/i);
        if (m) nomeFound = normalizeSpaces(m[1]);
    }
    if (nomeFound) out.emitente.nome = nomeFound.slice(0, 120);

    m = tn.match(/(Inscri[cç][aã]o\s*Estadual|I\s*E)\s*[:-]?\s*([\w\.-]+)/i);
    if (m) out.emitente.ie = m[2];

    const itens = [];
    const codigoRe = /\(C[oó]digo\s*:\s*([A-Za-z0-9\.\-]+)\s*\)/gi;
    let mCod;
    while ((mCod = codigoRe.exec(tn)) !== null) {
        const code = mCod[1];
        const idx = mCod.index;
        let startLine = tn.lastIndexOf('\n', idx);
        if (startLine === -1) startLine = 0; else startLine += 1;
        const lineStartToCode = tn.slice(startLine, idx);
        let descricao = normalizeSpaces(lineStartToCode).replace(/\(C[oó]digo\s*:\s*[0-9\.]+\s*\)\s*$/i, '').trim();
        if (!descricao || /.*(Avenida|Rua|Rodovia|Travessa|Alameda|Estrada).*|^(Vl\.|Qtde\.|UN\b|CNPJ|CPF|Chave|Emitente)/i.test(descricao)) {
            const prevLineEnd = startLine > 1 ? tn.lastIndexOf('\n', startLine - 2) : -1;
            const prevLine = tn.slice(prevLineEnd + 1, startLine - 1);
            const cand = normalizeSpaces(prevLine).replace(/\(C[oó]digo\s*:\s*[0-9\.]+\s*\)\s*$/i, '').trim();
            if (cand && !/.*(Avenida|Rua|Rodovia|Travessa|Alameda|Estrada).*|:/.test(cand)) descricao = cand;
        }

        const forward = tn.slice(idx);
        const qMatch = forward.match(/Qtde\.?\s*:\s*([0-9\.,]+)/i);
        const unMatch = forward.match(/UN\s*:\s*([A-Za-z]{1,6})/i);
        const vuMatch = forward.match(/Vl\.\s*Unit\.?\s*:\s*([0-9\.,]+)/i);
        let total = '';
        const totalAnchor = /Vl\.?\s*Total/i.exec(forward);
        if (totalAnchor) {
            const after = forward.slice(totalAnchor.index);
            const mVal = after.match(/\b([0-9][0-9\.,]*)\b/);
            if (mVal) total = mVal[1];
        }

        itens.push({
            descricao: descricao || '',
            codigo: code || '',
            qtde: qMatch ? qMatch[1] : '',
            un: unMatch ? unMatch[1] : '',
            unitario: vuMatch ? vuMatch[1] : '',
            total: total || ''
        });
    }
    out.itens = itens;
    return out;
}

// Rota para processar QR Code e buscar detalhes
router.post('/process', async (req, res) => {
    try {
        const { qrCode } = req.body;

        if (!qrCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'QR Code é obrigatório' 
            });
        }

        console.log("QR Code recebido para processamento:", qrCode);

        // Parse do QR Code
        const nfceData = parseQrNfce(qrCode);
        if (!nfceData) {
            return res.status(400).json({ 
                success: false, 
                message: 'QR Code não é uma NFC-e válida' 
            });
        }

        console.log("Dados básicos da NFC-e extraídos:", nfceData);
        console.log("CNPJ extraído da chave:", nfceData.CNPJ);
        console.log("CNPJ formatado:", formatarCNPJ(nfceData.CNPJ));

        // Busca detalhes completos
        try {
            console.log("Buscando detalhes da NFC-e...");
            const proxied = toReadableProxyUrl(qrCode);
            const response = await fetch(proxied, { method: 'GET' });
            
            if (!response.ok) {
                throw new Error(`Falha ao obter página (${response.status})`);
            }
            
            const text = await response.text();
            const detalhes = parseNfceText(text);
            
            console.log("Detalhes buscados da página:", detalhes);
            
        // Atualiza os dados com os detalhes obtidos
        if (detalhes.emitente) {
            // Usa o CNPJ da chave (mais confiável) em vez do extraído da página
            const cnpjDaChave = formatarCNPJ(nfceData.CNPJ);
            nfceData.emitente = { 
                ...nfceData.emitente, 
                ...detalhes.emitente,
                cnpj: cnpjDaChave // Força uso do CNPJ da chave formatado
            };
        }
            if (Array.isArray(detalhes.itens) && detalhes.itens.length > 0) {
                nfceData.itens = detalhes.itens;
            } else {
                console.warn("Nenhum item encontrado na heurística de parsing da página.");
            }
            
            console.log("NFC-e processada com sucesso:", nfceData);
            
            // Salva automaticamente no banco de dados
            try {
                const resultadoSalvamento = await salvarNfceAutomaticamente(nfceData);
                console.log("NFC-e salva automaticamente:", resultadoSalvamento);
                
                res.json({
                    success: true,
                    data: nfceData,
                    message: 'NFC-e processada e salva com sucesso',
                    salva: resultadoSalvamento
                });
            } catch (salvamentoError) {
                console.error("Erro ao salvar NFC-e automaticamente:", salvamentoError);
                // Mesmo com erro de salvamento, retorna os dados processados
                res.json({
                    success: true,
                    data: nfceData,
                    message: 'NFC-e processada com sucesso (erro ao salvar)',
                    warning: 'Dados processados mas não salvos no banco',
                    error: salvamentoError.message
                });
            }

        } catch (fetchError) {
            console.warn('Não foi possível buscar detalhes completos da NFC-e:', fetchError);
            
            // Retorna dados básicos mesmo se falhar o fetch
            // Garante que o CNPJ da chave seja usado
            nfceData.emitente = {
                ...nfceData.emitente,
                cnpj: formatarCNPJ(nfceData.CNPJ)
            };
            
            // Salva automaticamente no banco de dados (mesmo com dados básicos)
            try {
                const resultadoSalvamento = await salvarNfceAutomaticamente(nfceData);
                console.log("NFC-e salva automaticamente (dados básicos):", resultadoSalvamento);
                
                res.json({
                    success: true,
                    data: nfceData,
                    message: 'NFC-e processada e salva (dados básicos do QR Code)',
                    warning: 'Detalhes adicionais não disponíveis (CORS/UF)',
                    salva: resultadoSalvamento
                });
            } catch (salvamentoError) {
                console.error("Erro ao salvar NFC-e automaticamente (dados básicos):", salvamentoError);
                res.json({
                    success: true,
                    data: nfceData,
                    message: 'NFC-e processada (dados básicos do QR Code)',
                    warning: 'Detalhes adicionais não disponíveis (CORS/UF)',
                    error: 'Dados processados mas não salvos no banco'
                });
            }
        }

    } catch (error) {
        console.error('Erro ao processar QR Code:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao processar QR Code', 
            error: error.message 
        });
    }
});

// Função para buscar dados de CNPJ existente no banco
async function buscarDadosCNPJExistente(cnpj) {
    try {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        
        // Busca nota fiscal com este CNPJ que já tenha dados completos
        const notaExistente = await NotaFiscal.findOne({
            where: {
                cnpjEmitente: {
                    [Op.like]: `%${cnpjLimpo}%`
                },
                nomeFantasia: {
                    [Op.ne]: null // Deve ter dados completos
                }
            },
            order: [['updatedAt', 'DESC']] // Pega a mais recente
        });
        
        if (notaExistente) {
            console.log(`✅ CNPJ ${cnpj} encontrado no cache do banco`);
            return {
                nomeEmitente: notaExistente.nomeEmitente,
                nomeFantasia: notaExistente.nomeFantasia,
                situacaoCadastral: notaExistente.situacaoCadastral,
                dataAbertura: notaExistente.dataAbertura,
                capitalSocial: notaExistente.capitalSocial,
                naturezaJuridica: notaExistente.naturezaJuridica,
                endereco: notaExistente.endereco,
                cep: notaExistente.cep,
                municipio: notaExistente.municipio,
                uf: notaExistente.uf,
                telefone: notaExistente.telefone,
                email: notaExistente.email,
                ieEmitente: notaExistente.ieEmitente,
                fromCache: true
            };
        }
        
        return null;
    } catch (error) {
        console.error(`❌ Erro ao buscar CNPJ ${cnpj} no banco:`, error);
        return null;
    }
}

// Função para verificar se CNPJ precisa ser atualizado (dados incompletos)
async function verificarCNPJIncompleto(cnpj) {
    try {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        
        // Busca nota fiscal com este CNPJ que tenha dados incompletos
        const notaIncompleta = await NotaFiscal.findOne({
            where: {
                cnpjEmitente: {
                    [Op.like]: `%${cnpjLimpo}%`
                },
                [Op.or]: [
                    { nomeFantasia: null },
                    { situacaoCadastral: null },
                    { endereco: null }
                ]
            },
            order: [['updatedAt', 'DESC']]
        });
        
        return notaIncompleta !== null;
    } catch (error) {
        console.error(`❌ Erro ao verificar CNPJ incompleto ${cnpj}:`, error);
        return false;
    }
}

// Função para atualizar dados de CNPJ existente
async function atualizarDadosCNPJ(cnpj, novosDados) {
    try {
        const cnpjLimpo = cnpj.replace(/\D/g, '');
        
        // Atualiza todas as notas com este CNPJ
        const [updatedCount] = await NotaFiscal.update({
            nomeEmitente: novosDados.nomeEmitente,
            nomeFantasia: novosDados.nomeFantasia,
            situacaoCadastral: novosDados.situacaoCadastral,
            dataAbertura: novosDados.dataAbertura,
            capitalSocial: novosDados.capitalSocial,
            naturezaJuridica: novosDados.naturezaJuridica,
            endereco: novosDados.endereco,
            cep: novosDados.cep,
            municipio: novosDados.municipio,
            uf: novosDados.uf,
            telefone: novosDados.telefone,
            email: novosDados.email,
            ieEmitente: novosDados.ieEmitente
        }, {
            where: {
                cnpjEmitente: {
                    [Op.like]: `%${cnpjLimpo}%`
                }
            }
        });
        
        console.log(`🔄 Atualizadas ${updatedCount} notas com dados do CNPJ ${cnpj}`);
        return updatedCount;
    } catch (error) {
        console.error(`❌ Erro ao atualizar CNPJ ${cnpj}:`, error);
        return 0;
    }
}

// Função para salvar NFC-e automaticamente
async function salvarNfceAutomaticamente(nfceData) {
    const { chave, versao, tpAmb, cIdToken, vSig, emitente, itens } = nfceData;

    // Verifica se a nota já existe
    const notaExistente = await NotaFiscal.findOne({ where: { chave } });
    if (notaExistente) {
        return { 
            status: 'duplicada', 
            message: 'NFC-e com esta chave já foi salva anteriormente',
            id: notaExistente.id 
        };
    }

    // Busca dados completos do CNPJ se disponível
    let dadosCompletosCNPJ = null;
    if (emitente?.cnpj) {
        console.log(`🔍 Verificando CNPJ: ${emitente.cnpj}`);
        
        // 1. Primeiro, verifica se já existe no banco (cache)
        dadosCompletosCNPJ = await buscarDadosCNPJExistente(emitente.cnpj);
        
        if (dadosCompletosCNPJ) {
            console.log(`✅ Dados do CNPJ encontrados no cache: ${dadosCompletosCNPJ.nomeEmitente}`);
        } else {
            // 2. Se não existe no cache, consulta a API da Receita Federal
            console.log(`🌐 CNPJ não encontrado no cache, consultando Receita Federal...`);
            dadosCompletosCNPJ = await buscarDadosCNPJComRetry(emitente.cnpj);
            
            if (dadosCompletosCNPJ) {
                console.log(`✅ Dados completos encontrados na Receita: ${dadosCompletosCNPJ.nomeEmitente}`);
                
                // 3. Atualiza todas as notas existentes com este CNPJ
                await atualizarDadosCNPJ(emitente.cnpj, dadosCompletosCNPJ);
            } else {
                console.warn(`⚠️ Não foi possível obter dados completos do CNPJ: ${emitente.cnpj}`);
            }
        }
        
        // 4. Verifica se há CNPJs incompletos que precisam ser atualizados
        const temCNPJIncompleto = await verificarCNPJIncompleto(emitente.cnpj);
        if (temCNPJIncompleto && dadosCompletosCNPJ) {
            console.log(`🔄 Atualizando CNPJ incompleto: ${emitente.cnpj}`);
            await atualizarDadosCNPJ(emitente.cnpj, dadosCompletosCNPJ);
        }
    }

    // Inicia uma transação para garantir consistência
    const transaction = await sequelize.transaction();

    try {
        // Prepara dados da nota fiscal (combina dados básicos + dados completos do CNPJ)
        const dadosNota = {
            chave,
            versao,
            ambiente: tpAmb,
            cIdToken,
            vSig,
            cnpjEmitente: emitente?.cnpj,
            nomeEmitente: emitente?.nome,
            ieEmitente: emitente?.ie
        };

        // Adiciona dados completos do CNPJ se disponíveis
        if (dadosCompletosCNPJ) {
            dadosNota.nomeEmitente = dadosCompletosCNPJ.nomeEmitente || dadosNota.nomeEmitente;
            dadosNota.nomeFantasia = dadosCompletosCNPJ.nomeFantasia;
            dadosNota.situacaoCadastral = dadosCompletosCNPJ.situacaoCadastral;
            dadosNota.dataAbertura = dadosCompletosCNPJ.dataAbertura;
            dadosNota.capitalSocial = dadosCompletosCNPJ.capitalSocial;
            dadosNota.naturezaJuridica = dadosCompletosCNPJ.naturezaJuridica;
            dadosNota.endereco = dadosCompletosCNPJ.endereco;
            dadosNota.cep = dadosCompletosCNPJ.cep;
            dadosNota.municipio = dadosCompletosCNPJ.municipio;
            dadosNota.uf = dadosCompletosCNPJ.uf;
            dadosNota.telefone = dadosCompletosCNPJ.telefone;
            dadosNota.email = dadosCompletosCNPJ.email;
            dadosNota.ieEmitente = dadosCompletosCNPJ.ieEmitente || dadosNota.ieEmitente;
        }

        // Cria a nota fiscal
        const novaNota = await NotaFiscal.create(dadosNota, { transaction });

        // Cria os itens associados
        if (itens && Array.isArray(itens)) {
            const itensParaCriar = itens.map(item => ({
                notaFiscalId: novaNota.id,
                codigo: item.codigo,
                descricao: item.descricao,
                quantidade: converterParaDecimal(item.qtde),
                unidade: item.un,
                valorUnitario: converterParaDecimal(item.unitario),
                valorTotal: converterParaDecimal(item.total)
            }));
            await ItemNota.bulkCreate(itensParaCriar, { transaction });
        }

        // Comita a transação
        await transaction.commit();

        return { 
            status: 'salva', 
            message: 'NFC-e salva com sucesso!', 
            id: novaNota.id,
            itensSalvos: itens ? itens.length : 0,
            dadosCNPJEncontrados: dadosCompletosCNPJ ? true : false,
            nomeFantasia: dadosCompletosCNPJ?.nomeFantasia || null,
            dadosDoCache: dadosCompletosCNPJ?.fromCache || false,
            cnpjProcessado: emitente?.cnpj || null
        };
    } catch (err) {
        // Reverte a transação em caso de erro
        await transaction.rollback();
        throw err;
    }
}

// Rota para gerenciar cache de CNPJs
router.get('/cnpj/cache/:cnpj', async (req, res) => {
    try {
        const { cnpj } = req.params;
        
        if (!cnpj) {
            return res.status(400).json({ 
                success: false, 
                message: 'CNPJ é obrigatório' 
            });
        }
        
        // Busca dados do CNPJ no cache
        const dadosCache = await buscarDadosCNPJExistente(cnpj);
        
        if (dadosCache) {
            res.json({
                success: true,
                data: dadosCache,
                message: 'CNPJ encontrado no cache',
                fromCache: true
            });
        } else {
            res.json({
                success: false,
                message: 'CNPJ não encontrado no cache',
                fromCache: false
            });
        }
        
    } catch (error) {
        console.error('Erro ao buscar CNPJ no cache:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao buscar CNPJ no cache', 
            error: error.message 
        });
    }
});

// Rota para atualizar CNPJ no cache
router.post('/cnpj/update', async (req, res) => {
    try {
        const { cnpj, dados } = req.body;
        
        if (!cnpj || !dados) {
            return res.status(400).json({ 
                success: false, 
                message: 'CNPJ e dados são obrigatórios' 
            });
        }
        
        // Atualiza dados do CNPJ
        const updatedCount = await atualizarDadosCNPJ(cnpj, dados);
        
        res.json({
            success: true,
            message: `CNPJ atualizado com sucesso`,
            updatedCount: updatedCount
        });
        
    } catch (error) {
        console.error('Erro ao atualizar CNPJ:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao atualizar CNPJ', 
            error: error.message 
        });
    }
});

// Rota para estatísticas do cache de CNPJs
router.get('/cnpj/stats', async (req, res) => {
    try {
        const totalNotas = await NotaFiscal.count();
        const notasComDadosCompletos = await NotaFiscal.count({
            where: {
                nomeFantasia: {
                    [Op.ne]: null
                }
            }
        });
        const notasIncompletas = totalNotas - notasComDadosCompletos;
        
        res.json({
            success: true,
            data: {
                totalNotas,
                notasComDadosCompletos,
                notasIncompletas,
                percentualCompletas: totalNotas > 0 ? (notasComDadosCompletos / totalNotas * 100).toFixed(2) : 0
            },
            message: 'Estatísticas do cache de CNPJs'
        });
        
    } catch (error) {
        console.error('Erro ao obter estatísticas:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno ao obter estatísticas', 
            error: error.message 
        });
    }
});

module.exports = router;
