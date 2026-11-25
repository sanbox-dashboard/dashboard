// Gera status_pedidos.json: situação atual dos pedidos de D-33 a D-3, lida da
// planilha "Pedidos Fluxo de Caixa" (aba tinyerp_pedidos_detalhes).
// A planilha do Kondado continua sendo a fonte principal do dashboard; ela só
// atualiza a situação dos pedidos dos últimos 3 dias, e este arquivo corrige a
// situação dos 30 dias anteriores. Usado SOMENTE para situação.
//   coluna B = situação (código) · C = número do pedido · D = data · K = número do pedido no e-commerce
const fs = require('fs');
const KEY = 'AIzaSyCpFaibN_ct8r2ywjIlKByvZkxok5ytqXI';
const SHEET = '178VTXiUXmzqKjt3PHEwr0iJmC4Y1C79TeeJ1v7JZnFA';
const ABA = 'tinyerp_pedidos_detalhes';
const DIAS_RECENTES = 3, DIAS_JANELA = 30;
const CODIGOS = {'0':'Em aberto','1':'Faturado','2':'Cancelado','3':'Aprovado','4':'Preparando envio',
  '5':'Enviado','6':'Entregue','7':'Pronto para envio','8':'Dados incompletos','9':'Nao entregue'};

const iso = d => d.toISOString().slice(0, 10);
function hojeSP() { return new Date(Date.now() - 3 * 3600 * 1000); }      // São Paulo = UTC-3
function menos(n) { const d = hojeSP(); d.setUTCDate(d.getUTCDate() - n); return iso(d); }
function dataIso(s) {                                                       // M/D/YYYY -> YYYY-MM-DD
  const p = String(s || '').trim().split('/');
  return p.length === 3 ? p[2] + '-' + p[0].padStart(2, '0') + '-' + p[1].padStart(2, '0') : '';
}

(async () => {
  const q = ['A:D', 'K:K'].map(r => 'ranges=' + encodeURIComponent(ABA + '!' + r)).join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET}/values:batchGet?${q}&key=${KEY}`;
  let d = null;
  for (let t = 1; t <= 3 && !d; t++) {
    try { const r = await fetch(url); const j = await r.json(); if (j.error) throw new Error(j.error.message); d = j; }
    catch (e) { console.log('tentativa', t, 'falhou:', e.message); if (t === 3) throw e; await new Promise(r => setTimeout(r, 5000)); }
  }
  const A = d.valueRanges[0].values || [], K = d.valueRanges[1].values || [];
  const h = A[0] || [];
  if (h[1] !== 'situacao' || h[2] !== 'numeropedido' || h[3] !== 'data' || ((K[0] || [])[0]) !== 'numeroordemcompra')
    throw new Error('Cabeçalho da planilha mudou: ' + JSON.stringify([h.slice(0, 4), K[0]]));

  const ini = menos(DIAS_RECENTES + DIAS_JANELA), fim = menos(DIAS_RECENTES);
  const n = {}, e = {}, eDup = new Set(), cont = {};
  for (let i = 1; i < A.length; i++) {
    const r = A[i] || [], sit = String(r[1] || '').trim(), num = String(r[2] || '').trim();
    const dt = dataIso(r[3]), ec = String((K[i] || [])[0] || '').trim();
    if (!CODIGOS[sit] || !dt || dt < ini || dt > fim) continue;
    if (num) n[num] = sit;
    if (ec) { if (e[ec] !== undefined && e[ec] !== sit) eDup.add(ec); e[ec] = sit; }
    cont[CODIGOS[sit]] = (cont[CODIGOS[sit]] || 0) + 1;
  }
  eDup.forEach(k => delete e[k]);          // mesmo nº de e-commerce com situações diferentes: não usa
  const total = Object.keys(n).length;
  if (total < 100) throw new Error('Só ' + total + ' pedidos na janela — arquivo NÃO atualizado');
  const out = { gerado_em: new Date().toISOString(), janela: { inicio: ini, fim: fim }, codigos: CODIGOS,
    total: total, por_situacao: cont, n: n, e: e };
  fs.writeFileSync('status_pedidos.json', JSON.stringify(out));
  console.log('status_pedidos.json OK |', ini, 'a', fim, '|', total, 'pedidos |', JSON.stringify(cont));
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
