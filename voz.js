/* Entende a fala de um agendamento em qualquer ordem (cliente, procedimento, valor, data, horário).
   Roda no próprio celular, sem servidor e sem chave de IA.
   VozAgenda.interpretar(texto, agora) -> { nome, data:'AAAA-MM-DD', hora:'HH:MM', proc, valor (centavos), alertas:[] } */
(function (root) {
  'use strict';

  /* ---------- utilidades ---------- */
  const pad = n => String(n).padStart(2, '0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  // minúsculas e sem acento, mantendo o MESMO tamanho do texto original (os índices continuam valendo)
  function norm(s) {
    let o = '';
    for (let i = 0; i < s.length; i++) {
      const n = s[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      o += n.length === 1 ? n : ' ';
    }
    return o;
  }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 9;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }

  /* ---------- números por extenso ---------- */
  const UN = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10, onze: 11,
    doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezesseis: 16, dezasseis: 16, dezessete: 17, dezoito: 18, dezenove: 19,
    vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90, cem: 100, cento: 100,
    duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500,
    seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };
  const byLen = arr => arr.slice().sort((a, b) => b.length - a.length);
  const NW = byLen(Object.keys(UN).concat(['mil'])).join('|');
  const NUMSEQ = `(?:${NW})(?:\\s+(?:e\\s+)?(?:${NW}))*`;
  const NUMD = '\\d+(?:[.,]\\d+)*';

  function parseNum(seq) {
    const toks = seq.split(/\s+/).filter(w => w && w !== 'e');
    if (!toks.length) return null;
    let total = 0, cur = 0;
    for (const t of toks) {
      if (t === 'mil') { total += (cur || 1) * 1000; cur = 0; continue; }
      const v = UN[t];
      if (v == null) return null;
      if (v >= 100) { if (cur) return null; cur = v; }
      else if (v >= 10) { if (cur % 100) return null; cur += v; }
      else { if (cur % 10 || (cur % 100 >= 10 && cur % 100 < 20)) return null; cur += v; }
    }
    return total + cur;
  }
  // se a sequência por extenso não fecha (ex.: "dez e trinta e cinco"), tira palavras do começo até fechar
  function numTrim(txt) {
    const re = /\S+/g; let m; const pos = [];
    while ((m = re.exec(txt))) pos.push([m[0], m.index]);
    for (let i = 0; i < pos.length; i++) {
      const v = parseNum(pos.slice(i).map(p => p[0]).join(' '));
      if (v != null) return { v, off: pos[i][1] };
    }
    return null;
  }
  function parseBRL(str) {
    let s = str.trim();
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    const x = parseFloat(s);
    return isNaN(x) ? null : Math.round(x * 100);
  }

  /* ---------- tabelas ---------- */
  const MESES = { janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12 };
  const DIAS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
  const MESW = Object.keys(MESES).join('|');
  const HOURW = byLen(['vinte e uma', 'vinte e duas', 'vinte e tres', 'vinte', 'dezenove', 'dezoito', 'dezessete', 'dezesseis', 'quinze', 'catorze', 'quatorze',
    'treze', 'doze', 'onze', 'dez', 'nove', 'oito', 'sete', 'seis', 'cinco', 'quatro', 'tres', 'duas', 'dois', 'uma', 'um']).join('|');
  const MINW = byLen(['meia', 'quinze', 'vinte e cinco', 'vinte', 'trinta e cinco', 'trinta', 'quarenta e cinco', 'quarenta', 'cinquenta e cinco', 'cinquenta', 'dez', 'cinco']).join('|');
  const minWord = w => w === 'meia' ? 30 : parseNum(w);
  const DAYTOK = `\\d{1,2}|primeiro|${NUMSEQ}`;
  const dayTok = w => w === 'primeiro' ? 1 : /^\d+$/.test(w) ? parseInt(w, 10) : numTrim(w) && numTrim(w).v;

  // procedimentos: palavra ouvida -> nome que vai para o campo
  const PROCS = [
    ['progressiva', 'Progressiva'], ['alisamento', 'Alisamento'], ['selagem', 'Selagem'], ['botox', 'Botox capilar'], ['cauterizacao', 'Cauterização'],
    ['hidratacao', 'Hidratação'], ['hidratar', 'Hidratação'], ['coloracao', 'Coloração'], ['tintura', 'Coloração'], ['mecha', 'Mechas / Luzes'],
    ['mechas', 'Mechas / Luzes'], ['luzes', 'Mechas / Luzes'], ['cacheado', 'Cuidados com cacheados'], ['cacheados', 'Cuidados com cacheados'],
    ['manicure', 'Manicure'], ['mani', 'Manicure'], ['pedicure', 'Pedicure'], ['pedi', 'Pedicure'], ['depilacao', 'Depilação'],
    ['sobrancelha', 'Sobrancelha'], ['sobrancelhas', 'Sobrancelha'], ['escova', 'Escova'], ['corte', 'Corte'], ['penteado', 'Penteado'],
    ['maquiagem', 'Maquiagem'], ['unha', 'Unhas'], ['unhas', 'Unhas'], ['cilios', 'Cílios'], ['relaxamento', 'Relaxamento'],
    ['reconstrucao', 'Reconstrução'], ['massagem', 'Massagem'], ['barba', 'Barba'], ['nutricao', 'Nutrição']
  ];
  const PROC_FRASES = [[/\blimpeza de pele\b/, 'Limpeza de pele'], [/\b(?:pe e mao|mao e pe)\b/, 'Manicure e pedicure']];

  const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos']);
  const CUES = new Set(['cliente', 'nome', 'chama', 'chamada', 'chamado', 'para', 'pra', 'marcar', 'marca', 'marque', 'agendar', 'agende', 'agendamento',
    'anotar', 'anote', 'dona', 'seu', 'sr', 'sra', 'senhora']);
  const STOP = new Set(('marcar marca marque marcado marcada agendar agenda agende agendado agendada agendamento anotar anota anote novo nova cliente clientes ' +
    'nome chamada chamado chama se quero preciso precisa vou vai vem vira ficou fica fazer faz fazendo fez pra pro para pelo pela por com sem no na nos nas ao aos ' +
    'as os o a um uma uns umas e ou que ela ele dela dele seu sua esse essa isso de do da dos das em dia hoje amanha depois proxima proximo semana mes ' +
    'valor preco custa custo cobrar cobra cobrado cobrando reais real r rs horas hora hs h horario manha tarde noite madrugada ponto procedimento servico servicos ' +
    'tambem ai entao bom ola oi tudo bem ta ok vamos vamo tenho tem cabelo capilar feminino masculino favor ser sera sao esta estao ja so mais ' +
    'conto contos pila pilas centavos centavo meio meia barra dona senhora sr sra feira cuidados cuidado tratamento sessao mil ' + Object.keys(UN).join(' ') + ' ' + Object.keys(MESES).join(' ') + ' ' + Object.keys(DIAS).join(' ')).split(/\s+/));

  /* ---------- principal ---------- */
  function interpretar(texto, agora) {
    const hoje = agora ? new Date(agora) : new Date();
    const hoje0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    let O = String(texto || '').replace(/\s+/g, ' ').trim();   // original (para o nome)
    let T = norm(O);                                           // normalizado (para procurar)
    const cut = (a, b) => { const sp = ' '.repeat(b - a); T = T.slice(0, a) + sp + T.slice(b); O = O.slice(0, a) + sp + O.slice(b); };
    const r = { nome: '', data: '', hora: '', proc: '', valor: 0, alertas: [] };
    let palpiteNome = false, palpiteProc = false, palpiteValor = false;

    /* ===== VALOR ===== */
    (function valor() {
      let m;
      const tenta = (re, fn) => { re.lastIndex = 0; m = re.exec(T); return m ? fn(m) : false; };
      // R$ 350
      if (tenta(new RegExp(`\\br\\s*\\$\\s*(${NUMD})`, 'g'), m => { const c = parseBRL(m[1]); if (c) { r.valor = c; cut(m.index, m.index + m[0].length); return true; } })) return;
      // 350 reais (e 50 centavos)
      if (tenta(new RegExp(`\\b(${NUMD})\\s*(?:reais|real|contos?|pilas?)\\b(?:\\s+e\\s+(\\d{1,2}|${NUMSEQ})\\s+centavos?)?`, 'g'), m => {
        let c = parseBRL(m[1]); if (!c) return false;
        if (m[2]) { const cv = /^\d+$/.test(m[2]) ? +m[2] : (numTrim(m[2]) || {}).v; if (cv != null && cv < 100) c += cv; }
        r.valor = c; cut(m.index, m.index + m[0].length); return true;
      })) return;
      // trezentos e cinquenta reais (e cinquenta centavos)
      if (tenta(new RegExp(`\\b(${NUMSEQ})\\s+(?:reais|real|contos?|pilas?)\\b(?:\\s+e\\s+(\\d{1,2}|${NUMSEQ})\\s+centavos?)?`, 'g'), m => {
        const t = numTrim(m[1]); if (!t) return false;
        let c = t.v * 100;
        if (m[2]) { const cv = /^\d+$/.test(m[2]) ? +m[2] : (numTrim(m[2]) || {}).v; if (cv != null && cv < 100) c += cv; }
        r.valor = c; cut(m.index + t.off, m.index + m[0].length); return true;
      })) return;
      // "valor 350" / "cobrar trezentos e cinquenta"
      tenta(new RegExp(`\\b(?:valor|preco|custa|custo|cobrar|cobra|cobrando)\\s+(?:de\\s+|e\\s+|sera\\s+|fica\\s+)?(?:r\\s*\\$\\s*)?(${NUMD}|${NUMSEQ})`, 'g'), m => {
        const c = /^\d/.test(m[1]) ? parseBRL(m[1]) : (() => { const t = numTrim(m[1]); return t ? t.v * 100 : null; })();
        if (c) { r.valor = c; cut(m.index, m.index + m[0].length); return true; }
      });
    })();

    /* ===== HORÁRIO ===== */
    (function horario() {
      let h = null, mi = 0, per = null, a = -1, b = -1, ex;
      const exec = (re) => { re.lastIndex = 0; return re.exec(T); };
      const periodo = (fim) => {   // "da tarde", "de manhã" logo depois do horário
        const p = /^\s*(?:da|de|do|a)?\s*(manha|tarde|noite|madrugada)\b/.exec(T.slice(fim));
        if (p) { per = p[1]; return fim + p[0].length; } return fim;
      };
      if ((ex = exec(/\bmeio\s*dia\b(?:\s+e\s+(meia|quinze))?/g))) { h = 12; mi = ex[1] ? minWord(ex[1]) : 0; per = 'tarde'; a = ex.index; b = ex.index + ex[0].length; }
      else if ((ex = exec(/\bmeia\s*noite\b/g))) { h = 0; a = ex.index; b = ex.index + ex[0].length; per = 'fixo'; }
      else if ((ex = exec(/\b(\d{1,2})\s*(?::|h(?![a-z])|hs\b|horas?\b)\s*(\d{2})?(?!\d)/g)) && +ex[1] <= 24) { h = +ex[1]; mi = ex[2] ? +ex[2] : 0; a = ex.index; b = ex.index + ex[0].length; }
      else if ((ex = exec(new RegExp(`\\b(?:as|pras|para as|por volta das)\\s+(${HOURW})\\b(?:\\s+horas?\\b)?(?:\\s+e\\s+(${MINW})\\b)?`, 'g')))) {
        h = parseNum(ex[1]); mi = ex[2] ? minWord(ex[2]) : 0; a = ex.index; b = ex.index + ex[0].length;
      }
      else if ((ex = exec(new RegExp('\\b(?:as|pras|para as|por volta das)\\s+(\\d{1,2})\\b(?:\\s+e\\s+(meia|\\d{2}|' + MINW + '))?', 'g'))) && +ex[1] <= 24) {
        h = +ex[1]; mi = ex[2] ? (/^\d/.test(ex[2]) ? +ex[2] : minWord(ex[2])) : 0; a = ex.index; b = ex.index + ex[0].length;
      }
      else if ((ex = exec(new RegExp(`\\b(${HOURW})\\s+horas?\\b(?:\\s+e\\s+(${MINW})\\b)?`, 'g')))) {
        h = parseNum(ex[1]); mi = ex[2] ? minWord(ex[2]) : 0; a = ex.index; b = ex.index + ex[0].length;
      }
      else if ((ex = exec(new RegExp(`\\b(${HOURW})(?:\\s+e\\s+(${MINW}))?(?=\\s+(?:da|de)\\s+(?:manha|tarde|noite)\\b)`, 'g')))) {
        h = parseNum(ex[1]); mi = ex[2] ? minWord(ex[2]) : 0; a = ex.index; b = ex.index + ex[0].length;
      }
      else if ((ex = exec(/\b(\d{1,2})(?=\s+(?:da|de)\s+(?:manha|tarde|noite)\b)/g))) { h = +ex[1]; a = ex.index; b = ex.index + ex[0].length; }
      if (h == null || a < 0) return;
      b = periodo(b);
      if (!per) { const g = /\b(?:da|de|na|a)\s+(manha|tarde|noite)\b/.exec(T); if (g) per = g[1]; }   // "amanhã de manhã às 9"
      if (per === 'tarde' || per === 'noite') { if (h < 12) h += 12; }
      else if (!per && h >= 1 && h <= 7) h += 12;                // sem dizer o período: 1h–7h = tarde/noite
      if (h > 23 || mi > 59) { h = null; return; }
      r.hora = `${pad(h)}:${pad(mi)}`;
      cut(a, b);
      // tira também "de manhã/da tarde" solto que ficou
      T.replace(/\b(?:da|de|na|a)\s+(?:manha|tarde|noite)\b/, (s, i) => { cut(i, i + s.length); return s; });
    })();

    /* ===== DATA ===== */
    (function data() {
      let ex, dt = null, a = -1, b = -1;
      const exec = re => { re.lastIndex = 0; return re.exec(T); };
      const mk = (y, m, d) => { const x = new Date(y, m - 1, d); return x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d ? x : null; };
      const comMes = (m, d, anoDito) => {
        if (anoDito) { return mk(anoDito, m, d); }
        let x = mk(hoje0.getFullYear(), m, d);
        if (x && x < hoje0) x = mk(hoje0.getFullYear() + 1, m, d);
        return x;
      };
      if ((ex = exec(/\b(\d{1,2})\s*\/\s*(\d{1,2})(?:\s*\/\s*(\d{2,4}))?(?!\d)/g))) {
        let y = ex[3] ? +ex[3] : 0; if (y && y < 100) y += 2000;
        dt = comMes(+ex[2], +ex[1], y); a = ex.index; b = ex.index + ex[0].length;
      }
      if (!dt && (ex = exec(new RegExp(`\\b(?:dia\\s+)?(${DAYTOK})\\s+de\\s+(${MESW})(?:\\s+de\\s+(\\d{4}))?`, 'g')))) {
        const d = dayTok(ex[1]); if (d) { dt = comMes(MESES[ex[2]], d, ex[3] ? +ex[3] : 0); a = ex.index; b = ex.index + ex[0].length; }
      }
      if (!dt && (ex = exec(new RegExp(`\\bdia\\s+(${DAYTOK})\\b`, 'g')))) {
        const d = dayTok(ex[1]);
        if (d >= 1 && d <= 31) {
          for (let k = 0; k < 13 && !dt; k++) {
            const x = mk(hoje0.getFullYear(), hoje0.getMonth() + 1 + k, d);
            const alvo = new Date(hoje0.getFullYear(), hoje0.getMonth() + k, 1);
            if (x && x.getMonth() === alvo.getMonth() && x >= hoje0) dt = x;
          }
          a = ex.index; b = ex.index + ex[0].length;
        }
      }
      if (!dt && (ex = exec(/\bdepois de amanha\b/g))) { dt = new Date(hoje0.getFullYear(), hoje0.getMonth(), hoje0.getDate() + 2); a = ex.index; b = ex.index + ex[0].length; }
      if (!dt && (ex = exec(/\bamanha\b/g))) { dt = new Date(hoje0.getFullYear(), hoje0.getMonth(), hoje0.getDate() + 1); a = ex.index; b = ex.index + ex[0].length; }
      if (!dt && (ex = exec(/\bhoje\b/g))) { dt = hoje0; a = ex.index; b = ex.index + ex[0].length; }
      if (!dt && (ex = exec(new RegExp(`\\b(${Object.keys(DIAS).join('|')})(?:[\\s-]*feira)?\\b(?:\\s+(?:que vem|da proxima semana))?`, 'g')))) {
        let diff = (DIAS[ex[1]] - hoje0.getDay() + 7) % 7; if (diff === 0) diff = 7;
        dt = new Date(hoje0.getFullYear(), hoje0.getMonth(), hoje0.getDate() + diff); a = ex.index; b = ex.index + ex[0].length;
      }
      if (dt) { r.data = iso(dt); cut(a, b); }
    })();

    /* ===== valor solto (ex.: "Maria 350 progressiva amanhã 10h") ===== */
    if (!r.valor) {
      const m = /\b(\d{2,6}(?:[.,]\d{2})?)\b/.exec(T);
      if (m) { const c = parseBRL(m[1]); if (c && c >= 1000) { r.valor = c; palpiteValor = true; cut(m.index, m.index + m[0].length); } }
    }

    /* ===== PROCEDIMENTO ===== */
    (function procedimento() {
      const achados = [];   // [posição, nome]
      for (const [re, nome] of PROC_FRASES) { const m = re.exec(T); if (m) { achados.push([m.index, nome]); cut(m.index, m.index + m[0].length); } }
      const re = /[a-z]+/g; let m;
      const marcas = [];
      while ((m = re.exec(T))) {
        const w = m[0]; let nome = null;
        for (const [k, n] of PROCS) {
          if (w === k) { nome = n; break; }
          if (w.length >= 7 && k.length >= 7 && lev(w, k) <= (k.length >= 10 ? 2 : 1)) { nome = n; break; }
        }
        if (nome) { achados.push([m.index, nome]); marcas.push([m.index, m.index + w.length]); }
      }
      marcas.forEach(([x, y]) => cut(x, y));
      achados.sort((p, q) => p[0] - q[0]);
      const nomes = [...new Set(achados.map(x => x[1]))];
      if (nomes.includes('Manicure') && nomes.includes('Pedicure')) {
        nomes.splice(nomes.indexOf('Pedicure'), 1); nomes[nomes.indexOf('Manicure')] = 'Manicure e pedicure';
      }
      const lista = nomes;
      r.proc = (lista[0] || '') + lista.slice(1).map((n, i, arr) => (i === arr.length - 1 ? ' e ' : ', ') + n.toLowerCase()).join('');
    })();

    /* ===== NOME (o que sobrou) ===== */
    (function nome() {
      const toks = []; const re = /[A-Za-zÀ-ÿ]+(?:['’][A-Za-zÀ-ÿ]+)?/g; let m;
      while ((m = re.exec(O))) toks.push({ o: m[0], n: norm(m[0]), i: m.index });
      const runs = []; let cur = null;
      toks.forEach((t, k) => {
        const parte = PARTICULAS.has(t.n) && cur && toks[k + 1] && !STOP.has(toks[k + 1].n) && toks[k + 1].i - (t.i + t.o.length) <= 2;
        if (!STOP.has(t.n) || parte) {
          if (!cur) { cur = { t: [], cue: k > 0 && (CUES.has(toks[k - 1].n) || (k > 1 && (toks[k - 1].n === 'a' || toks[k - 1].n === 'o') && CUES.has(toks[k - 2].n))) }; runs.push(cur); }
          cur.t.push(t);
        } else cur = null;
      });
      const limpa = run => {
        let t = run.t.slice(); while (t.length && PARTICULAS.has(t[t.length - 1].n)) t.pop();
        return t;
      };
      const validos = runs.map(x => ({ cue: x.cue, t: limpa(x) })).filter(x => x.t.length);
      if (!validos.length) return;
      const esc = validos.find(x => x.cue) || validos[0];   // sem pista: o primeiro trecho é o nome
      let t = esc.t;
      if (t.length > 4) { t = t.slice(0, 4); r.alertas.push('Confira o nome da cliente.'); }
      const bonito = t.map((x, k) => {
        const w = x.o; const baixo = PARTICULAS.has(x.n) && k > 0;
        return baixo ? w.toLowerCase() : (w === w.toLowerCase() || w === w.toUpperCase() ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w);
      }).join(' ');
      r.nome = bonito; palpiteNome = !esc.cue && validos.length > 1;
      if (!r.proc) {
        const outro = validos.filter(x => x !== esc).sort((p, q) => q.t.length - p.t.length)[0];
        if (outro) {
          let tt = outro.t.slice(0, 4).map(x => x.o.toLowerCase()).join(' ');
          r.proc = tt.charAt(0).toUpperCase() + tt.slice(1); palpiteProc = true;
        }
      }
    })();

    /* ===== avisos ===== */
    if (!r.nome) r.alertas.push('Não entendi o nome da cliente.');
    else if (palpiteNome) r.alertas.push('Confira o nome da cliente.');
    if (!r.data) r.alertas.push('Não entendi a data.');
    if (!r.hora) r.alertas.push('Não entendi o horário.');
    if (!r.proc) r.alertas.push('Não entendi o procedimento.');
    else if (palpiteProc) r.alertas.push('Confira o procedimento.');
    if (!r.valor) r.alertas.push('Não entendi o valor.');
    else if (palpiteValor) r.alertas.push('Confira o valor.');
    return r;
  }

  root.VozAgenda = { interpretar, parseNum };
  if (typeof module !== 'undefined') module.exports = root.VozAgenda;
})(typeof window !== 'undefined' ? window : globalThis);
