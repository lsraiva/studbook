import assert from 'node:assert/strict';
import { translate, translateError } from '../assets/i18n.js';

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`PASS i18n: ${name}`); };

test('navigation and action chrome is Portuguese', () => {
  assert.equal(translate('Yard'), 'Estábulo');
  assert.equal(translate('Racing'), 'Corridas');
  assert.equal(translate('Race cards'), 'Programa');
  assert.equal(translate('Stud market'), 'Mercado de garanhões');
  assert.equal(translate('Tack room'), 'Loja');
  assert.equal(translate('Ledger'), 'Carteira');
  assert.equal(translate('Watch the replay'), 'Ver o replay');
  assert.equal(translate('take it'), 'pegar');
  assert.equal(translate('Consign'), 'Consignar');
});
test('whitespace and line breaks do not block a translation', () => {
  assert.equal(translate('  Yard '), '  Estábulo ');
  assert.equal(translate('A foal arrives when the season turns.\n Cover a mare and wait for it.'), 'O potro nasce na virada da temporada. Cubra uma égua e aguarde.');
});
test('dynamic values keep their numbers and horse names', () => {
  assert.equal(translate('age 5'), 'idade 5');
  assert.equal(translate('3 in training'), '3 em treinamento');
  assert.equal(translate('buy 58₲'), 'comprar 58 ₲');
  const form = translate('Ashgrove · 1.21x the field · unraced · runs push');
  assert.ok(form.startsWith('Ashgrove · '));
  assert.ok(form.includes('sem corridas'));
});
test('unknown text, names and e-mails are untouched', () => {
  assert.equal(translate('Mormoor (L8)'), 'Mormoor (L8)');
  assert.equal(translate('owner@example.test'), 'owner@example.test');
  assert.equal(translate('Texto já em português'), 'Texto já em português');
});
test('server errors are translated by message or known pattern', () => {
  assert.equal(translateError('wrong email or password'), 'E-mail ou senha incorretos.');
  assert.equal(translateError('the meeting closes on the clock — enter your runners and wait'), 'A reunião fecha no relógio: inscreva seus corredores e aguarde.');
  assert.equal(translateError('sign in again'), 'Entre novamente.');
  assert.equal(translateError('no such room'), 'Não encontrado.');
});
test('engine sentences are rebuilt in Portuguese from their parts', () => {
  assert.equal(translate('racehorse with a turn of foot, short of speed · below the field'), 'cavalo de corrida com arranque, falta velocidade · abaixo do campo');
  assert.equal(translate('veteran, no hole in it · near elite'), 'veterano sem ponto fraco · perto da elite');
  assert.equal(translate('colt · age 1'), 'macho · 1 ano');
  assert.equal(translate('filly · 4'), 'fêmea · 4 anos');
  assert.equal(translate('a sprint · next up'), 'um sprint · próxima');
  assert.equal(translate('Put entries on a 90s clock'), 'Inscrições com relógio de 90 s');
  assert.equal(translate('stakes class · 3% · hit — Ravgate (L6)'), 'classe de elite · 3% · acertou — Ravgate (L6)');
  assert.equal(translate('founder × founder · L7'), 'fundador × fundadora · L7');
  assert.equal(translate('9 declared'), '9 declarados');
  assert.equal(translate('1.27x the field'), '1.27× o campo');
  assert.equal(translate('2 runs, 1 won'), '2 corridas, 1 vitória');
});
test('unknown composites are left alone', () => {
  assert.equal(translate('Belmont × Kelvale · L2'), 'Belmont × Kelvale · L2');
  assert.equal(translate('Ashgrove · age 1'), 'Ashgrove · 1 ano');
});
test('a played game reads in Portuguese: race reports, diary, foal, market', () => {
  const cases = {
    'S4 · Morcrest (L7) finished 10 of 10 in the yielding, 4.6 behind — lost it on stamina.': 'T4 · Morcrest (L7) chegou em 10º de 10 na pista macia, 4.6 atrás — perdeu em resistência.',
    'The clock ran out — Meeting 2 of 4 is run. Entries for meeting 3 are open — up to three runners.': 'O relógio acabou — Reunião 2 de 4 disputada. Inscrições abertas para a reunião 3 — até três corredores.',
    'mile meeting: Ravstone (L2) wins a pot of 180 GNS from 10 runners.': 'Reunião de milha: Ravstone (L2) leva o prêmio de 180 GNS entre 10 corredores.',
    'won by half a length clear of the runner-up': 'venceu por meio corpo à frente do segundo',
    '10th · Morcrest (L7) — beaten 4.6, won 0 ₲ · ran steady': '10º · Morcrest (L7) — atrás 4.6, ganhou 0 ₲ · manter',
    'the yard finished ₲ 98 down · 4 runs, 0 won, 0 placed, ₲ 0 in prizes': 'o estábulo fechou com ₲ 98 a menos · 4 corridas, 0 vitórias, 0 colocações, ₲ 0 em prêmios',
    'A filly is born': 'Nasce uma potra',
    'covering · 78% · hit — Morbrook (L8)': 'cobertura · 78% · acertou — Morbrook (L8)',
    "S3 · Ravensmoor's barn was full: 3 coverings went to the market at 20 GNS and 7 were culled.": 'T3 · O depósito de Ravensmoor lotou: 3 coberturas foram ao mercado por 20 GNS e 7 foram descartadas.',
    'Ashgrove · horse lot · price cut each season it sits': 'Ashgrove · lote de cavalo · o preço cai a cada temporada',
    '1 foal due when the season turns.': '1 potro previsto para a virada da temporada.',
  };
  for (const [en, pt] of Object.entries(cases)) assert.equal(translate(en), pt);
});
console.log(`${passed} i18n cases passed.`);
