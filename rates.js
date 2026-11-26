// Taxas da maquininha (em %), conforme o Simulador de vendas do banco (todas as parcelas conferidas).
//  - intermediacao: cobrada sobre todo o valor da venda (depende da bandeira e da faixa de parcelas)
//  - parcelamento: igual para todas as bandeiras; só existe de 2x a 18x. Crédito 1x e débito não têm.
//  - parcelamentoEstimado: parcelas ainda não conferidas no banco (marcadas com * no app). Hoje está vazio.
//  Para atualizar as taxas, edite este arquivo e aumente a versão CACHE em sw.js.
window.TAXAS = {
 "parcelamento": {
  "2": 2.1,
  "3": 2.77,
  "4": 3.46,
  "5": 4.12,
  "6": 4.79,
  "7": 5.45,
  "8": 6.1,
  "9": 6.74,
  "10": 7.39,
  "11": 8.02,
  "12": 8.65,
  "13": 9.27,
  "14": 9.89,
  "15": 10.5,
  "16": 11.11,
  "17": 11.71,
  "18": 12.3
 },
 "parcelamentoEstimado": [],
 "bandeiras": {
  "Visa": {
   "debito": 1.45,
   "recebeCredito": "na hora",
   "intermediacao": {
    "1": 3.21,
    "2-6": 3.01,
    "7-18": 3.56
   }
  },
  "Mastercard": {
   "debito": 1.45,
   "recebeCredito": "na hora",
   "intermediacao": {
    "1": 3.11,
    "2-6": 3.01,
    "7-18": 3.56
   }
  },
  "Elo": {
   "debito": 1.51,
   "recebeCredito": "em 30 dias",
   "intermediacao": {
    "1": 3.19,
    "2-6": 3.79,
    "7-18": 3.79
   }
  }
 }
};
