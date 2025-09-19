// server/routes/scan.js
const express = require('express');
const router = express.Router();
const { NotaFiscal, ItemNota, sequelize } = require('../models');

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
                nfceData.emitente = { ...nfceData.emitente, ...detalhes.emitente };
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

    // Inicia uma transação para garantir consistência
    const transaction = await sequelize.transaction();

    try {
        // Cria a nota fiscal
        const novaNota = await NotaFiscal.create({
            chave,
            versao,
            ambiente: tpAmb,
            cIdToken,
            vSig,
            cnpjEmitente: emitente?.cnpj,
            nomeEmitente: emitente?.nome,
            ieEmitente: emitente?.ie
        }, { transaction });

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
            itensSalvos: itens ? itens.length : 0
        };
    } catch (err) {
        // Reverte a transação em caso de erro
        await transaction.rollback();
        throw err;
    }
}

module.exports = router;
