/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* IP caching unit tests.                                                     C.Veness 2017-2018  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai from 'chai'; // BDD/TDD assertion library
const expect = chai.expect;

import ip from '../../lib/ip.js';

const test = it; // just an alias

describe('IP caching', function() {
    this.timeout(4e3); // 4 sec

    describe('country', function() {

        test('prep cache', async function() {
            // if unit tests are run after integration tests, the app-report 'whatnext' tests will
            // leave '::ffff:127.0.0.1' in the cache, so make the same call here in order that this
            // unit test will return the same results whether or not integration tests have already
            // been run
            await ip.getCountry('::ffff:127.0.0.1');
        });

        test('IP country cache starts with just (ipv6) localhost', function() {
            expect(global.ipsCountry.size).to.equal(1);
        });
        test('get IP country (from ipinfo.io)', async function() {
            const t0 = process.hrtime();
            const ipsCountry = await ip.getCountry('82.69.8.1');
            const t1 = process.hrtime(t0);
            const elapsed = t1[0]*1e3 + t1[1]/1e6; // ms
            expect(ipsCountry).to.equal('GB');
            expect(elapsed).to.be.above(10); // full lookup
        });
        test('get IP country (cached)', async function() {
            const t0 = process.hrtime();
            const ipsCountry = await ip.getCountry('82.69.8.1');
            const t1 = process.hrtime(t0);
            const elapsed = t1[0]*1e3 + t1[1]/1e6; // ms
            expect(ipsCountry).to.equal('GB');
            expect(elapsed).to.be.below(10); // cached
        });
        test('IP country for TEST-NET-1 fails', async function() {
            const ipsCountry = await ip.getCountry('192.0.2.0');
            expect(ipsCountry).to.be.null;
        });
        test('IP country for invalid ip fails', async function() {
            const ipsCountry = await ip.getCountry('not an ip address!');
            expect(ipsCountry).to.be.null;
        });
        test('IP country cache has 3 entries', function() {
            expect(global.ipsCountry.size).to.equal(4);
        });
    });

    describe('domain', function() {
        test('IP domain cache starts empty', function() {
            expect(global.ipsDomain.size, global.ipsDomain.toString()).to.equal(0);
        });
        test('get IP domain (from node.js dns module)', async function() {
            const t0 = process.hrtime();
            const ipDomain = await ip.getDomain('82.69.8.1');
            const t1 = process.hrtime(t0);
            const elapsed = t1[0]*1e3 + t1[1]/1e6; // ms
            expect(ipDomain).to.equal('82-69-8-1.dsl.in-addr.zen.co.uk');
            expect(elapsed).to.be.above(1); // full lookup
        });
        test('get IP domain (from node.js dns module)', async function() {
            const t0 = process.hrtime();
            const ipDomain = await ip.getDomain('82.69.8.1');
            const t1 = process.hrtime(t0);
            const elapsed = t1[0]*1e3 + t1[1]/1e6; // ms
            expect(ipDomain).to.equal('82-69-8-1.dsl.in-addr.zen.co.uk');
            expect(elapsed).to.be.below(1); // full lookup
        });
        test('IP domain for TEST-NET-1 fails', async function() {
            const ipDomain = await ip.getDomain('192.0.2.0');
            expect(ipDomain).to.be.null;
        });
        test('IP country for invalid ip fails', async function() {
            const ipsCountry = await ip.getDomain('not an ip address!');
            expect(ipsCountry).to.be.null;
        });
        test('IP domain cache has 3 entries', function() {
            expect(global.ipsDomain.size).to.equal(3);
        });
    });

});
