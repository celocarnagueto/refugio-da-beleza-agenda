// Taxas da maquininha (em %), conforme o Simulador de vendas do banco.
//  - intermediacao: cobrada sobre todo o valor da venda (depende da bandeira e da faixa de parcelas)
//  - parcelamento: igual para todas as bandeiras; só existe de 2x a 18x. Crédito 1x e débito não têm.
//  - parcelamentoEstimado: parcelas que NÃO foram lidas direto do banco (calculadas por ajuste). Confirme e corrija aqui se precisar.
//  Para atualizar as taxas, edite este arquivo e aumente a versão CACHE em sw.js.
window.TAXAS = {
 "parcelamento": {
  "2": 2.1,
  "3": 2.77,
  "4": 3.46,
  "5": 4.13,
  "6": 4.79,
  "7": 5.46,
  "8": 6.1,
  "9": 6.75,
  "10": 7.39,
  "11": 8.03,
  "12": 8.65,
  "13": 9.27,
  "14": 9.89,
  "15": 10.5,
  "16": 11.11,
  "17": 11.71,
  "18": 12.3
 },
 "parcelamentoEstimado": [
  4,
  5,
  7,
  8,
  9,
  10,
  11,
  13,
  14,
  15,
  16,
  17
 ],
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
