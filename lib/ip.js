/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* Cache IP country & domain.                                                      C.Veness 2017  */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import dns   from 'dns';        // nodejs.org/api/dns.html
import util  from 'util';       // nodejs.org/api/util.html
import fetch from 'node-fetch'; // window.fetch in node.js

dns.reverse = util.promisify(dns.reverse);

global.ipsCountry = new Map();
global.ipsDomain = new Map();

// TODO: ctx.app.proxy?


class Ip {

    /**
     * Return country code for IP address; first request gets country code from ipinfo.io, and
     * caches it for subsequent requests (cache will last until app restart). ISO 3166-1 codes are
     * returned (in upper case), hence GB not UK. Note ipinfo.io lookup seems to take typically
     * 200-400ms.
     *
     * @param   {string} ip - IP address to be looked up.
     * @returns {string} Country associated with IP address.
     */
    static async getCountry(ip) {
        if (!ip) return null;

        if (global.ipsCountry.has(ip)) return global.ipsCountry.get(ip); // yay, cached!

        if (ip=='127.0.0.1' || ip=='::ffff:127.0.0.1') { global.ipsCountry.set(ip, null); return null; }

        // get country from ipinfo.io
        const response = await fetch(`https://ipinfo.io/${ip}/json`, { method: 'GET' });
        if (!response.ok)  { global.ipsCountry.set(ip, null); return null; }
        const body = await response.json();

        global.ipsCountry.set(ip, body.country || null);

        return body.country || null;
    }


    /**
     * Return domain for IP address; first request gets domain from node.js dns.reverse, and caches
     * it for subsequent requests (cache will last until app restart). Note dns.reverse lookup seems
     * to take typically 1-4ms.
     *
     * @param   {string} ip - IP address to be looked up.
     * @returns {string} Domain associated with IP address.
     */
    static async getDomain(ip) {
        if (!ip) return null;

        if (global.ipsDomain.has(ip)) return global.ipsDomain.get(ip); // yay, cached!

        if (ip=='127.0.0.1' || ip=='::ffff:127.0.0.1') { global.ipsDomain.set(ip, null); return null; }

        // get domain from dns.reverse
        try {
            const ipDomain = await dns.reverse(ip);

            global.ipsDomain.set(ip, ipDomain[0]);

            return ipDomain[0];
        } catch (e) {
            global.ipsDomain.set(ip, null);
            return null;
        }
    }

}

export default Ip;
