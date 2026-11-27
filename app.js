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
  function maskMoney(el) {
    const digits = el.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 9);
    el.dataset.cents = digits || '0';
    el.value = digits ? brl(Number(digits)) : '';
  }
  function moneyInput(el, onChange) {
    el.addEventListener('input', () => { maskMoney(el); if (onChange) onChange(); });
  }
  const getCents = el => Number(el.dataset.cents || 0);
  const setCents = (el, c) => { el.dataset.cents = String(c || 0); el.value = c ? brl(c) : ''; };

  /* ---------- navegação ---------- */
  function showTab(name) {
    const atual = $('.tab.active');
    if (atual && atual.id === 'tab-cartao' && name !== 'cartao') resetCalc();   // volta ao Cartão sempre zerado
    if (atual && atual.id === 'tab-ganhos' && name !== 'ganhos') resetGanhos();  // Ganhos volta para o dia de hoje
    if (name === 'agendados') renderAgendados();
    if (name === 'ganhos') renderGanhos();
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

  const aberto = a => a.status !== 'finalizado';
  const diaCurto = iso => parseDate(iso).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace('.', '');

  function cardAberto(a) {
    return `<article class="ag" data-id="${a.id}">
      <div class="ag-top"><span class="ag-hora">${esc(a.hora)}</span><span class="ag-dia">${esc(diaCurto(a.data))}</span></div>
      <div class="ag-nome">${esc(a.nome)}</div>
      <div class="ag-proc">${esc(a.proc)}</div>
      <label class="ag-val">Valor
        <input class="ag-valor-in" type="text" inputmode="numeric" value="${a.valor ? brl(a.valor) : ''}" data-cents="${a.valor || 0}" aria-label="Valor de ${esc(a.nome)}">
      </label>
      <div class="ag-fin">
        <button type="button" class="btn primary" data-act="fin">✔ Finalizado</button>
        <button type="button" class="btn danger" data-act="del">Excluir</button>
      </div>
      <div class="ag-btns">
        <button type="button" data-act="cal">Agenda do celular</button>
        <button type="button" data-act="card">Cobrar no cartão</button>
        <button type="button" data-act="edit">Editar</button>
      </div></article>`;
  }

  function renderAgendados() {
    sortAppts();
    const t = todayISO(), abertos = appts.filter(aberto);
    const atras = abertos.filter(a => a.data < t), prox = abertos.filter(a => a.data >= t);
    let html = '';
    if (atras.length) html += '<div class="dia atraso">Dias anteriores · ainda não finalizados</div>' + atras.map(cardAberto).join('');
    let last = '';
    for (const a of prox) {
      if (a.data !== last) { html += `<div class="dia">${esc(diaLabel(a.data))}</div>`; last = a.data; }
      html += cardAberto(a);
    }
    $('#lista').innerHTML = html || '<p class="vazio">Nenhum agendamento em aberto.<br>Crie um na aba Agenda.</p>';
    const badge = $('#badge-ag'); badge.textContent = abertos.length; badge.hidden = !abertos.length;
  }

  function render() { sortAppts(); renderAgendados(); renderGanhos(); renderLembretes(); }

  function renderLembretes() {
    const t = todayISO(), amanha = addDays(t, 1), ab = appts.filter(aberto);
    const hoje = ab.filter(a => a.data === t), am = ab.filter(a => a.data === amanha);
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

    const conflito = appts.find(a => aberto(a) && a.id !== editingId && a.data === data && a.hora === hora);
    if (conflito && !confirm(`Já existe um agendamento às ${hora} nesse dia (${conflito.nome}). Salvar mesmo assim?`)) return;

    let a;
    if (editingId) {
      a = appts.find(x => x.id === editingId);
      if (a.data !== data || a.hora !== hora) a.avisado = false;
      Object.assign(a, { nome, data, hora, proc, valor });
    } else {
      a = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), nome, data, hora, proc, valor, avisado: false, status: 'agendado' };
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

  /* ---- valor editável no cartão (salva ao sair do campo) ---- */
  document.addEventListener('input', ev => { if (ev.target.classList.contains('ag-valor-in')) maskMoney(ev.target); });
  document.addEventListener('focusin', ev => { if (ev.target.classList.contains('ag-valor-in')) { const el = ev.target; setTimeout(() => el.select(), 0); } });
  document.addEventListener('change', ev => {
    const el = ev.target; if (!el.classList.contains('ag-valor-in')) return;
    const a = appts.find(x => x.id === el.closest('.ag').dataset.id); if (!a) return;
    const c = getCents(el);
    if (!c) { setCents(el, a.valor); return toast('Informe um valor maior que zero.'); }
    if (c !== a.valor) { a.valor = c; save(); toast('Valor atualizado: ' + brl(c)); }
  });

  /* ---- ações nos cartões ---- */
  document.addEventListener('click', ev => {
    const btn = ev.target.closest('.ag [data-act]');
    if (!btn) return;
    const card = btn.closest('.ag'), id = card.dataset.id, a = appts.find(x => x.id === id);
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
      showTab('agenda');
      setTimeout(() => $('#form').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } else if (act === 'fin') {
      const inp = $('.ag-valor-in', card), c = inp ? getCents(inp) : a.valor;
      if (c) a.valor = c;
      a.status = 'finalizado'; a.finalizadoEm = new Date().toISOString();
      save(); render(); toast(`Atendimento finalizado: ${a.nome} · ${brl(a.valor)}`);
    } else if (act === 'reabrir') {
      if (confirm(`Voltar o atendimento de ${a.nome} para os agendados?`)) {
        a.status = 'agendado'; delete a.finalizadoEm; save(); render(); toast('Voltou para os agendados.');
      }
    } else if (act === 'del') {
      if (confirm(`Excluir o agendamento de ${a.nome} (${diaCurto(a.data)} às ${a.hora})?\nSe já estiver na agenda do celular, apague lá também.`)) {
        appts = appts.filter(x => x.id !== id); save(); render(); toast('Agendamento excluído.');
      }
    }
  });

  /* =====================================================================
     GANHOS (atendimentos finalizados por dia, semana ou mês)
     ===================================================================== */
  let periodo = 'dia', refGanhos = todayISO();
  const fmtCurto = iso => { const [y, m, d] = iso.split('-'); return `${d}/${m}`; };

  function faixaGanhos() {
    const d = parseDate(refGanhos);
    if (periodo === 'dia') return { ini: refGanhos, fim: refGanhos, label: d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) };
    if (periodo === 'semana') {
      const ini = addDays(refGanhos, -((d.getDay() + 6) % 7)), fim = addDays(ini, 6);   // segunda a domingo
      return { ini, fim, label: `${fmtCurto(ini)} a ${fmtCurto(fim)}/${fim.slice(0, 4)}` };
    }
    const ini = isoLocal(new Date(d.getFullYear(), d.getMonth(), 1)), fim = isoLocal(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    return { ini, fim, label: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) };
  }

  function renderGanhos() {
    const f = faixaGanhos();
    $('#g-label').textContent = f.label.charAt(0).toUpperCase() + f.label.slice(1);
    $('#g-data').value = refGanhos;
    $$('#seg-periodo button').forEach(b => { const on = b.dataset.v === periodo; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
    const lista = appts.filter(a => a.status === 'finalizado' && a.data >= f.ini && a.data <= f.fim)
      .sort((p, q) => (p.data + p.hora).localeCompare(q.data + q.hora));
    const total = lista.reduce((t, a) => t + (a.valor || 0), 0);
    $('#g-total').textContent = brl(total);
    $('#g-qtd').textContent = lista.length + (lista.length === 1 ? ' atendimento' : ' atendimentos');
    $('#g-media').textContent = lista.length ? 'Média ' + brl(Math.round(total / lista.length)) : '';

    const linha = a => `<article class="ag fim" data-id="${a.id}">
      <div class="ag-top"><span class="ag-hora">${esc(a.hora)}</span><span class="ag-valor">${brl(a.valor || 0)}</span></div>
      <div class="ag-nome">${esc(a.nome)}</div><div class="ag-proc">${esc(a.proc)}</div>
      <div class="ag-btns"><button type="button" data-act="reabrir">Desfazer finalização</button></div></article>`;
    let html = '', ult = '';
    if (periodo === 'dia') html = lista.map(linha).join('');
    else {
      const porDia = {};
      lista.forEach(a => (porDia[a.data] = porDia[a.data] || []).push(a));
      for (const dia of Object.keys(porDia).sort()) {
        const sub = porDia[dia].reduce((t, a) => t + (a.valor || 0), 0);
        html += `<div class="dia dia-sub"><span>${esc(diaLabel(dia))}</span><span>${brl(sub)}</span></div>` + porDia[dia].map(linha).join('');
      }
    }
    $('#g-lista').innerHTML = html || '<p class="vazio">Nenhum atendimento finalizado neste período.</p>';
  }

  function moverGanhos(sentido) {
    const d = parseDate(refGanhos);
    if (periodo === 'dia') refGanhos = addDays(refGanhos, sentido);
    else if (periodo === 'semana') refGanhos = addDays(refGanhos, 7 * sentido);
    else refGanhos = isoLocal(new Date(d.getFullYear(), d.getMonth() + sentido, 1));
    renderGanhos();
  }
  function resetGanhos() { periodo = 'dia'; refGanhos = todayISO(); renderGanhos(); }
  $('#seg-periodo').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; periodo = b.dataset.v; renderGanhos(); });
  $('#g-ant').addEventListener('click', () => moverGanhos(-1));
  $('#g-prox').addEventListener('click', () => moverGanhos(1));
  $('#g-hoje').addEventListener('click', resetGanhos);
  $('#g-data').addEventListener('change', e => { if (e.target.value) { refGanhos = e.target.value; renderGanhos(); } });

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
    appts.filter(a => aberto(a) && a.data === amanha && !a.avisado).forEach(a => {
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
      lista.forEach(a => { if (!ids.has(a.id)) { appts.push({ id: String(a.id), nome: String(a.nome), data: a.data, hora: a.hora, proc: String(a.proc || ''), valor: Number(a.valor) || 0, avisado: !!a.avisado, status: a.status === 'finalizado' ? 'finalizado' : 'agendado', finalizadoEm: a.finalizadoEm || '' }); n++; } });
      save(); render(); toast(`Backup restaurado: ${n} agendamento(s) adicionado(s).`);
    } catch (e) { toast('Arquivo de backup inválido.'); }
  });

  /* =====================================================================
     AGENDAMENTO POR VOZ  (fala em qualquer ordem; o entendimento está em voz.js)
     ===================================================================== */
  (function voz() {
    const micBtn = $('#mic'), limparBtn = $('#limpar'), orgBtn = $('#organizar'), texto = $('#vozTexto'), status = $('#micstatus'), resumo = $('#vozResumo');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let sessao = null;
    const setStatus = t => { status.textContent = t || ''; };

    // junta trechos sem duplicar (alguns celulares devolvem o texto acumulado de novo)
    function juntar(a, n) {
      a = (a || '').trim(); n = (n || '').trim();
      if (!n) return a; if (!a) return n;
      const al = a.toLowerCase(), nl = n.toLowerCase();
      if (nl.indexOf(al) === 0) return n;
      if (al.slice(-nl.length) === nl) return a;
      return a + ' ' + n;
    }

    const DICA = SR ? 'Toque em “Falar agendamento”, diga tudo em qualquer ordem e toque de novo para terminar.'
      : 'Este navegador não tem reconhecimento de voz. Toque no microfone do teclado do celular para ditar no campo abaixo e depois em “Organizar”.';
    if (!SR) micBtn.hidden = true;
    setStatus(DICA);

    function marcar(ativo) {
      micBtn.classList.toggle('gravando', ativo);
      micBtn.textContent = ativo ? '⏹ Parar e organizar' : '🎙️ Falar agendamento';
    }
    function ouvir() {
      if (sessao) { sessao.parar = true; try { sessao.rec.stop(); } catch (e) {} setStatus('Finalizando…'); return; }
      sessao = { acum: '', interim: '', parar: false, reinicios: 0, erro: '' };
      texto.value = ''; resumo.hidden = true; marcar(true);
      setStatus('Ouvindo… fale cliente, procedimento, valor, data e horário. Toque de novo para terminar.');
      iniciar();
    }
    function iniciar() {
      const s = sessao, rec = new SR();
      rec.lang = 'pt-BR'; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      s.rec = rec;
      rec.onresult = e => {
        if (sessao !== s) return;
        let inter = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) s.acum = juntar(s.acum, r[0].transcript); else inter += r[0].transcript;
        }
        s.interim = inter; texto.value = juntar(s.acum, s.interim);
      };
      rec.onerror = e => { if (e.error === 'no-speech' || e.error === 'aborted') return; s.parar = true; s.erro = e.error; };
      rec.onend = () => {
        if (sessao !== s) return;
        if (s.interim) { s.acum = juntar(s.acum, s.interim); s.interim = ''; }
        // o navegador encerra sozinho após silêncio: reinicia até você tocar em parar
        if (!s.parar && s.reinicios < 8) { s.reinicios++; try { iniciar(); return; } catch (e) { /* segue */ } }
        finalizar(s);
      };
      try { rec.start(); } catch (e) { sessao = null; marcar(false); setStatus('Não foi possível iniciar o microfone. Tente novamente.'); }
    }
    function finalizar(s) {
      sessao = null; marcar(false);
      const t = juntar(s.acum, s.interim); texto.value = t;
      if (s.erro === 'not-allowed' || s.erro === 'service-not-allowed') return setStatus('O microfone está bloqueado. Libere a permissão do microfone para este site e tente de novo.');
      if (s.erro === 'network') return setStatus('O serviço de voz do navegador precisa de internet. Tente novamente.');
      if (!t) return setStatus('Nenhuma fala foi capturada. Tente novamente.');
      organizar();
    }

    const dataBR = iso => parseDate(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
    function organizar() {
      const t = texto.value.trim();
      if (!t) return setStatus('Fale ou escreva o agendamento primeiro.');
      const r = window.VozAgenda.interpretar(t);
      // um agendamento novo nunca herda dados do anterior: limpa tudo antes de preencher
      resetForm();
      fNome.value = r.nome; fData.value = r.data; fHora.value = r.hora; fProc.value = r.proc; setCents(fValor, r.valor);

      const linhas = [['Cliente', r.nome], ['Data', r.data && dataBR(r.data)], ['Horário', r.hora], ['Procedimento', r.proc], ['Valor', r.valor && brl(r.valor)]];
      resumo.innerHTML = '<b>Entendi:</b>' + linhas.filter(l => l[1]).map(l => `<p>${l[0]}: ${esc(l[1])}</p>`).join('') +
        r.alertas.map(a => `<p class="alerta">⚠️ ${esc(a)}</p>`).join('');
      resumo.hidden = false;
      setStatus(r.alertas.length ? 'Confira os campos abaixo, complete o que faltou e toque em Salvar.' : 'Tudo certo! Confira os campos abaixo e toque em Salvar agendamento.');
      const falta = [[fNome, r.nome], [fData, r.data], [fHora, r.hora], [fProc, r.proc], [fValor, r.valor]].find(x => !x[1]);
      $('#form').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (falta) setTimeout(() => falta[0].focus({ preventScroll: true }), 400);
    }
    // desistiu do agendamento: para o microfone e apaga tudo (fala, resumo e campos)
    function limpar() {
      if (sessao) { const s = sessao; sessao = null; try { s.rec.abort(); } catch (e) { try { s.rec.stop(); } catch (e2) { /* segue */ } } marcar(false); }
      texto.value = ''; resumo.hidden = true; resumo.innerHTML = '';
      resetForm(); setStatus(DICA); toast('Dados do agendamento limpos.');
    }
    limparBtn.addEventListener('click', limpar);
    micBtn.addEventListener('click', ouvir);
    orgBtn.addEventListener('click', organizar);
  })();

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

  function resetCalc() {
    setCents(cValor, 0); forma = 'credito'; bandeira = 'Mastercard'; cParc.value = '1';
    setSeg($('#seg-forma'), forma); setSeg($('#seg-bandeira'), bandeira);
    $('#det-tabela').open = false; atualizarCampos(); calcular();
  }

  /* ---------- início ---------- */
  fillParcelas(); atualizarCampos();
  render(); checkReminders();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  // permite testes automatizados
  window.__app = { calcBruto, taxas, descontos, buildICS, getAppts: () => appts };
})();
