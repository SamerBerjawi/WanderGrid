const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { resolveIcaoCallsign, IATA_TO_ICAO } = require('../carrierMapping.js');

describe('P-01 ADSBdb & Carrier ICAO Resolution', () => {
  test('maps known IATA flight numbers to 3-letter ICAO callsigns', () => {
    assert.equal(resolveIcaoCallsign('UA123'), 'UAL123');
    assert.equal(resolveIcaoCallsign('AA100'), 'AAL100');
    assert.equal(resolveIcaoCallsign('DL456'), 'DAL456');
    assert.equal(resolveIcaoCallsign('BA789'), 'BAW789');
    assert.equal(resolveIcaoCallsign('AF123'), 'AFR123');
    assert.equal(resolveIcaoCallsign('LH400'), 'DLH400');
  });

  test('preserves existing valid ICAO callsigns', () => {
    assert.equal(resolveIcaoCallsign('UAL123'), 'UAL123');
    assert.equal(resolveIcaoCallsign('BAW999'), 'BAW999');
    assert.equal(resolveIcaoCallsign('DLH456'), 'DLH456');
  });

  test('returns null for unknown carriers and never fabricates codes', () => {
    assert.equal(resolveIcaoCallsign('ZZ999'), null);
    assert.equal(resolveIcaoCallsign(''), null);
    assert.equal(resolveIcaoCallsign(null), null);
    assert.equal(resolveIcaoCallsign('123'), null);
  });

  test('handles spaces and lowercase inputs gracefully', () => {
    assert.equal(resolveIcaoCallsign('ua 123'), 'UAL123');
    assert.equal(resolveIcaoCallsign(' dl-456 '), 'DAL456');
  });
});
