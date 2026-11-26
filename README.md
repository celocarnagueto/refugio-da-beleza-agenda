# Refúgio da Beleza – Agenda

App (PWA) do Salão Marta Santos – Refúgio da Beleza.

- **Agenda**: cadastro de agendamentos (cliente, data, horário, procedimento, valor), gera evento para a agenda do celular (.ics) com aviso 1 dia antes e 1 hora antes.
- **Cartão**: informa o valor desejado e calcula quanto passar na maquininha (Pix, débito e crédito 1x–18x; Visa, Mastercard e Elo).

Taxas em `rates.js` (origem: `Base_Taxas_Calculo_Maquininha.xlsx`, aba "Calculo Combinado"). Para atualizar, edite esse arquivo e aumente a versão `CACHE` em `sw.js`.

Sem build: arquivos estáticos. Rodar local: `python3 -m http.server` e abrir http://localhost:8000.
