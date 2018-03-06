/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */
/* User model unit tests.                                                     C.Veness 2017-2018  */
/*                                                                                                */
/* Note these tests do not mock out database components, but operate on the live 'user' db.       */
/* - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -  */

import chai   from 'chai';   // BDD/TDD assertion library
import dotenv from 'dotenv'; // load environment variables from a .env file into process.env

const expect = chai.expect;

dotenv.config();

import User from '../../models/user.js';

import './before.js'; // set up database connections

describe('User model', function() {
    this.timeout(5e3); // 5 sec
    this.slow(100);

    let userId = null;

    const values = {
        firstname: 'test',
        lastname:  'user',
        email:     'test@user.com',
        username:  'test',
    };

    it('creates user', async function() {
        userId = await User.insert(values);
    });

    it('fails to create user with duplicate username', function() {
        User.insert(values).catch(error => expect(error).to.be.an('error'));
    });

    it('gets user', async function() {
        const user = await User.get(userId);
        expect(user).to.be.an('object');
        expect(user.username).to.equal('test');
    });

    it('gets user using string id', async function() {
        const user = await User.get(userId.toString());
        expect(user).to.be.an('object');
        expect(user.username).to.equal('test');
    });

    it('gets all users', async function() {
        const users = await User.getAll(userId);
        expect(users).to.be.an('array');
        expect(users).to.have.lengthOf.at.least(1);
    });

    it('gets user by value', async function() {
        const users = await User.getBy('username', 'test');
        expect(users).to.be.an('array');
        expect(users).to.have.lengthOf.at.least(1);
    });

    it('updates user', async function() {
        await User.update(userId, { username: 'test2' });
        const user = await User.get(userId);
        expect(user).to.be.an('object');
        expect(user.username).to.equal('test2');
    });

    it('gets map of all users', async function() {
        const users = await User.details();
        expect(users).to.be.a('map');
        expect(users.get(userId.toString()).username).to.equal('test2');
    });

    it('gets list all users', async function() {
        const users = await User.names();
        expect(users).to.be.a('map');
        expect(users.get(userId.toString())).to.equal('test2');
    });

    it('deletes user', async function() {
        const ok = await User.delete(userId);
        expect(ok).to.be.true;
    });

});
