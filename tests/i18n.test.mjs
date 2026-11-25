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
console.log(`${passed} i18n cases passed.`);
