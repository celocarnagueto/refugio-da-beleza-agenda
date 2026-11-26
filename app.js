(function () {
  'use strict';

  /* ---------- utilidades ---------- */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const pad = n => String(n).padStart(2, '0');
  const brl = cents => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayISO = () => isoLocal(new Date());
  const addDays = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return isoLocal(new Date(y, m - 1, d + n)); };
  const parseDate = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
  const store = {
    get(k, def) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  let toastTimer;
  function toast(msg, ms = 4200) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  /* ---------- máscara de dinheiro (digita só números, vira R$ 0,00) ---------- */
  function moneyInput(el, onChange) {
    el.addEventListener('input', () => {
      const digits = el.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
      el.dataset.cents = digits || '0';
      el.value = digits ? brl(Number(digits)) : '';
      if (onChange) onChange();
    });
  }
  const getCents = el => Number(el.dataset.cents || 0);
  const setCents = (el, c) => { el.dataset.cents = String(c || 0); el.value = c ? brl(c) : ''; };

  /* ---------- navegação ---------- */
  function showTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
    $$('.bottom button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    window.scrollTo(0, 0);
  }
  $$('.bottom button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  /* =====================================================================
     AGENDA
     ===================================================================== */
  const KEY = 'refugio.agendamentos.v1';
  let appts = store.get(KEY, []);
  let editingId = null;
  const save = () => store.set(KEY, appts);
  const sortAppts = () => appts.sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));

  const fNome = $('#f-nome'), fData = $('#f-data'), fHora = $('#f-hora'), fProc = $('#f-proc'), fValor = $('#f-valor');
  moneyInput(fValor);
  fData.value = todayISO();

  function diaLabel(iso) {
    const t = todayISO();
    const d = parseDate(iso);
    const txt = d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    if (iso === t) return 'Hoje · ' + txt;
    if (iso === addDays(t, 1)) return 'Amanhã · ' + txt;
    return txt;
  }

  function cardHTML(a, past) {
    return `<article class="ag${past ? ' past' : ''}" data-id="${a.id}">
      <div class="ag-top"><span class="ag-hora">${esc(a.hora)}</span><span class="ag-valor">${a.valor ? brl(a.valor) : ''}</span></div>
      <div class="ag-nome">${esc(a.nome)}</div>
      <div class="ag-proc">${esc(a.proc)}</div>
      <div class="ag-btns">
        <button data-act="cal">Agenda do celular</button>
        <button data-act="card">Cobrar no cartão</button>
        <button data-act="edit">Editar</button>
        <button data-act="del" class="del">Excluir</button>
      </div></article>`;
  }

  function render() {
    sortAppts();
    const t = todayISO();
    const prox = appts.filter(a => a.data >= t);
    const ant = appts.filter(a => a.data < t).reverse();

    let html = '', last = '';
    for (const a of prox) {
      if (a.data !== last) { html += `<div class="dia">${esc(diaLabel(a.data))}</div>`; last = a.data; }
      html += cardHTML(a, false);
    }
    $('#lista').innerHTML = html || '<p class="vazio">Nenhum agendamento por enquanto.<br>Preencha o formulário acima para marcar o primeiro.</p>';

    const btnAnt = $('#btn-anteriores'), listaAnt = $('#lista-ant');
    btnAnt.hidden = !ant.length;
    listaAnt.innerHTML = ant.map(a => `<div class="dia">${esc(diaLabel(a.data))}</div>` + cardHTML(a, true)).join('');
    if (!ant.length) listaAnt.hidden = true;

    renderLembretes();
  }

  function renderLembretes() {
    const t = todayISO(), amanha = addDays(t, 1);
    const hoje = appts.filter(a => a.data === t), am = appts.filter(a => a.data === amanha);
    const box = $('#lembretes');
    const linha = (lbl, arr) => arr.length
      ? `<p><b>${lbl}:</b> ${arr.map(a => `${esc(a.hora)} ${esc(a.nome)} (${esc(a.proc)})`).join(' · ')}</p>` : '';
    box.innerHTML = linha('Hoje', hoje) + linha('Amanhã', am);
    box.hidden = !(hoje.length || am.length);
  }

  /* ---- salvar / editar ---- */
  function resetForm() {
    editingId = null;
    $('#form').reset();
    setCents(fValor, 0);
    fData.value = todayISO();
    $('#form-title').textContent = 'Novo agendamento';
    $('#btn-salvar').textContent = 'Salvar agendamento';
    $('#btn-cancelar').hidden = true;
    showErro('');
  }
  function showErro(msg) { const e = $('#form-erro'); e.textContent = msg; e.hidden = !msg; }

  $('#form').addEventListener('submit', async ev => {
    ev.preventDefault();
    const nome = fNome.value.trim(), data = fData.value, hora = fHora.value, proc = fProc.value.trim(), valor = getCents(fValor);
    if (!nome) return showErro('Informe o nome da cliente.'), fNome.focus();
    if (!data) return showErro('Escolha a data.'), fData.focus();
    if (!hora) return showErro('Escolha o horário.'), fHora.focus();
    if (!proc) return showErro('Informe o procedimento.'), fProc.focus();
    if (!valor) return showErro('Informe o valor a cobrar.'), fValor.focus();
    showErro('');

    const conflito = appts.find(a => a.id !== editingId && a.data === data && a.hora === hora);
    if (conflito && !confirm(`Já existe um agendamento às ${hora} nesse dia (${conflito.nome}). Salvar mesmo assim?`)) return;

    let a;
    if (editingId) {
      a = appts.find(x => x.id === editingId);
      if (a.data !== data || a.hora !== hora) a.avisado = false;
      Object.assign(a, { nome, data, hora, proc, valor });
    } else {
      a = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome, data, hora, proc, valor, avisado: false };
      appts.push(a);
    }
    if (!save()) toast('Não foi possível gravar neste aparelho. Verifique o armazenamento do navegador.');
    const foiEdicao = !!editingId;
    resetForm();
    render();

    // pede permissão de notificação (precisa vir de um toque) e já baixa o evento da agenda
    askNotifications();
    downloadICS(a);
    toast(foiEdicao
      ? 'Atualizado! Abra o arquivo baixado para atualizar na agenda do celular.'
      : 'Salvo! Abra o arquivo baixado para colocar na agenda do celular (com aviso 1 dia antes).', 6500);
    checkReminders();
  });

  $('#btn-cancelar').addEventListener('click', resetForm);

  /* ---- ações nos cartões ---- */
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('.ag-btns button');
    if (!btn) return;
    const id = btn.closest('.ag').dataset.id, a = appts.find(x => x.id === id);
    if (!a) return;
    const act = btn.dataset.act;
    if (act === 'cal') { downloadICS(a); toast('Abra o arquivo baixado para adicionar à agenda do celular.'); }
    else if (act === 'card') { setCents($('#c-valor'), a.valor); calcular(); showTab('cartao'); }
    else if (act === 'edit') {
      editingId = a.id;
      fNome.value = a.nome; fData.value = a.data; fHora.value = a.hora; fProc.value = a.proc; setCents(fValor, a.valor);
      $('#form-title').textContent = 'Editar agendamento';
      $('#btn-salvar').textContent = 'Atualizar agendamento';
      $('#btn-cancelar').hidden = false;
      $('#form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (act === 'del') {
      if (confirm(`Excluir o agendamento de ${a.nome} (${a.hora})?\nSe já estiver na agenda do celular, apague lá também.`)) {
        appts = appts.filter(x => x.id !== id); save(); render(); toast('Agendamento excluído.');
      }
    }
  });

  $('#btn-anteriores').addEventListener('click', () => {
    const l = $('#lista-ant'); l.hidden = !l.hidden;
    $('#btn-anteriores').textContent = l.hidden ? 'Ver agendamentos anteriores' : 'Ocultar agendamentos anteriores';
  });

  /* ---- arquivo de calendário (.ics) com alarme 1 dia antes ---- */
  const icsEsc = s => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
  function fold(line) {
    const out = []; while (line.length > 72) { out.push(line.slice(0, 72)); line = ' ' + line.slice(72); } out.push(line); return out.join('\r\n');
  }
  function buildICS(a) {
    const [y, m, d] = a.data.split('-').map(Number), [h, mi] = a.hora.split(':').map(Number);
    const fmt = dt => `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(dt.getHours())}${pad(dt.getMinutes())}00`;
    const ini = new Date(y, m - 1, d, h, mi), fim = new Date(y, m - 1, d, h + 1, mi);
    const now = new Date(), stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const desc = `Cliente: ${a.nome}\nProcedimento: ${a.proc}\nValor inicial: ${brl(a.valor)}`;
    const L = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Refugio da Beleza//Agenda//PT-BR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${a.id}@refugiodabeleza.app`, `DTSTAMP:${stamp}`,
      `DTSTART:${fmt(ini)}`, `DTEND:${fmt(fim)}`,   // horário local do aparelho
      `SUMMARY:${icsEsc(a.nome + ' – ' + a.proc)}`, `DESCRIPTION:${icsEsc(desc)}`, 'LOCATION:Refúgio da Beleza',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('Amanhã: ' + a.nome + ' às ' + a.hora + ' – ' + a.proc)}`, 'TRIGGER:-P1D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc('Em 1 hora: ' + a.nome + ' – ' + a.proc)}`, 'TRIGGER:-PT1H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ];
    return L.map(fold).join('\r\n') + '\r\n';
  }
  function downloadICS(a) {
    const slug = a.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'cliente';
    const blob = new Blob([buildICS(a)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = url; el.download = `agendamento-${slug}-${a.data}.ics`;
    document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ---- lembrete de 1 dia antes (notificação do app) ---- */
  async function askNotifications() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    try { await Notification.requestPermission(); } catch (e) { /* ignora */ }
  }
  async function notify(title, body, tag) {
    try {
      const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
      if (reg) return reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/favicon.png' });
      new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
    } catch (e) { /* ignora */ }
  }
  function checkReminders() {
    renderLembretes();
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const amanha = addDays(todayISO(), 1);
    let mudou = false;
    appts.filter(a => a.data === amanha && !a.avisado).forEach(a => {
      notify('Amanhã tem cliente 💛', `${a.hora} – ${a.nome} (${a.proc})`, 'ag-' + a.id);
      a.avisado = true; mudou = true;
    });
    if (mudou) save();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); checkReminders(); } });
  setInterval(checkReminders, 30 * 60 * 1000);

  /* ---- backup ---- */
  $('#btn-exportar').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ versao: 1, agendamentos: appts }, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), el = document.createElement('a');
    el.href = url; el.download = `backup-agenda-${todayISO()}.json`; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  $('#btn-importar').addEventListener('click', () => $('#file-importar').click());
  $('#file-importar').addEventListener('change', async ev => {
    const f = ev.target.files[0]; ev.target.value = ''; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      const lista = (j.agendamentos || []).filter(a => a && a.id && a.nome && /^\d{4}-\d{2}-\d{2}$/.test(a.data) && /^\d{2}:\d{2}$/.test(a.hora));
      if (!lista.length) throw new Error('vazio');
      const ids = new Set(appts.map(a => a.id)); let n = 0;
      lista.forEach(a => { if (!ids.has(a.id)) { appts.push({ id: String(a.id), nome: String(a.nome), data: a.data, hora: a.hora, proc: String(a.proc || ''), valor: Number(a.valor) || 0, avisado: !!a.avisado }); n++; } });
      save(); render(); toast(`Backup restaurado: ${n} agendamento(s) adicionado(s).`);
    } catch (e) { toast('Arquivo de backup inválido.'); }
  });

  /* =====================================================================
     CÁLCULO DE CARTÃO
     ===================================================================== */
  const cValor = $('#c-valor'), cParc = $('#c-parcelas');
  let forma = 'credito', bandeira = 'Mastercard';
  moneyInput(cValor, calcular);

  // Taxas em "pontos-base" inteiros (1,45% => 145). Desconto do banco = intermediação + parcelamento,
  // cada um arredondado ao centavo sobre o valor da venda (igual ao Simulador de vendas do banco).
  const faixa = n => n === 1 ? '1' : n <= 6 ? '2-6' : '7-18';
  function taxas(f, b, n) {
    const T = window.TAXAS, B = T.bandeiras[b];
    if (f === 'debito') return { inter: Math.round(B.debito * 100), parc: 0, estimada: false };
    const inter = Math.round(B.intermediacao[faixa(n)] * 100);
    const parc = n === 1 ? 0 : Math.round(T.parcelamento[n] * 100);
    return { inter, parc, estimada: n > 1 && T.parcelamentoEstimado.includes(n) };
  }
  const descontos = (g, t) => ({ inter: Math.round(g * t.inter / 10000), parc: Math.round(g * t.parc / 10000) });
  // menor valor a cobrar tal que, descontadas as taxas, sobre ao menos o desejado
  function calcBruto(liq, t) {
    let g = Math.max(liq, Math.floor(liq * 10000 / (10000 - t.inter - t.parc)) - 2);
    for (;; g++) { const d = descontos(g, t); if (g - d.inter - d.parc >= liq) return { bruto: g, ...d, liquido: g - d.inter - d.parc }; }
  }

  function fillParcelas() {
    const prev = Number(cParc.value) || 1;
    cParc.innerHTML = '';
    for (let n = 1; n <= 18; n++) cParc.add(new Option(n === 1 ? 'À vista (1x)' : `${n}x`, n));
    cParc.value = Math.min(prev, 18);
  }
  function setSeg(root, val) {
    $$('button', root).forEach(b => { const on = b.dataset.v === val; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  }
  function atualizarCampos() { $('#box-parcelas').hidden = forma !== 'credito'; }

  $('#seg-forma').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    forma = b.dataset.v; setSeg($('#seg-forma'), forma); atualizarCampos(); calcular();
  });
  $('#seg-bandeira').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    bandeira = b.dataset.v; setSeg($('#seg-bandeira'), bandeira); calcular();
  });
  cParc.addEventListener('change', calcular);

  const pct = bp => (bp / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';

  function calcular() {
    const liq = getCents(cValor);
    const res = $('#resultado'), det = $('#det-tabela');
    if (!liq) { res.hidden = true; det.hidden = true; return; }
    const n = forma === 'credito' ? Number(cParc.value) : 1;
    const t = taxas(forma, bandeira, n);
    const r = calcBruto(liq, t);

    $('#r-cobrar').textContent = brl(r.bruto);
    $('#r-parcelas').textContent = forma === 'debito' ? `no débito · ${bandeira}`
      : n === 1 ? `no crédito à vista · ${bandeira}` : `no crédito em ${n}x de ≈ ${brl(Math.ceil(r.bruto / n))} · ${bandeira}`;
    $('#r-inter').textContent = `${pct(t.inter)} · − ${brl(r.inter)}`;
    $('#r-parc-row').hidden = !t.parc;
    $('#r-parc').textContent = `${pct(t.parc)} · − ${brl(r.parc)}`;
    $('#r-taxa').textContent = pct(t.inter + t.parc);
    $('#r-liquido').textContent = brl(r.liquido);
    $('#r-recebe').textContent = forma === 'debito' ? 'na hora' : window.TAXAS.bandeiras[bandeira].recebeCredito;
    $('#r-aviso').hidden = !t.estimada;
    res.hidden = false;

    // tabela com todas as parcelas
    if (forma === 'credito') {
      let h = `<table><thead><tr><th>Parcelas</th><th>Taxa</th><th>Passar</th><th>Parcela</th></tr></thead><tbody>`;
      for (let i = 1; i <= 18; i++) {
        const ti = taxas('credito', bandeira, i), c = calcBruto(liq, ti);
        h += `<tr data-n="${i}"${i === n ? ' class="sel"' : ''}><td>${i === 1 ? 'À vista' : i + 'x'}</td><td>${pct(ti.inter + ti.parc)}${ti.estimada ? '*' : ''}</td><td>${brl(c.bruto)}</td><td>${i === 1 ? '—' : '≈ ' + brl(Math.ceil(c.bruto / i))}</td></tr>`;
      }
      $('#tabela').innerHTML = h + '</tbody></table><p class="hint">* taxa de parcelamento estimada (ainda não conferida no simulador do banco).</p>';
      $('#tab-bandeira').textContent = '· ' + bandeira;
      det.hidden = false;
    } else det.hidden = true;
  }
  $('#tabela').addEventListener('click', e => {
    const tr = e.target.closest('tr[data-n]'); if (!tr) return;
    cParc.value = tr.dataset.n; calcular(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  /* ---------- início ---------- */
  fillParcelas(); atualizarCampos();
  render(); checkReminders();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // permite testes automatizados
  window.__app = { calcBruto, taxas, descontos, buildICS, getAppts: () => appts };
})();
