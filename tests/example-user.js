var request = require('superagent');
var assert = require('assert');
var expect = require('expect.js');
var uuid = require('uuid');
var async = require('async');

/*
user one -> user two, user two accept, then user one delete
user one -> user three, user one cancel
user one -> user four, user four decline
user two -> user three, user three accept, then user 2 block
user three -> user four, user four accept, then user four delete
*/

describe('friends', function () {
	this.timeout(50000);

	var client1 = request.agent();
	var client2 = request.agent();
	var client3 = request.agent();

	var endpoint1 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint2 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint3 = 'http://127.0.0.1:3000/antisocial/';

	var token1;

	var app = require('../app');

	before(function (done) {
		app.start(3000);
		done();
	});

	after(function (done) {
		setTimeout(function () {
			console.log('users: %j', app.db.collections.users);
			console.log('tokens: %j', app.db.collections.tokens);

			app.stop();
			done();
		}, 1000);
	});

	it('should be able to create account 1', function (done) {
		client1.post('http://127.0.0.1:3000/api/users/register')
			.type('form')
			.send({
				'name': 'user one',
				'username': 'user-one',
				'email': 'user1@testing.com',
				'password': 'Testing123'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				expect(res.body.status).to.equal('ok');
				token1 = getCookie(res.headers['set-cookie'], 'access-token');
				expect(token1).to.be.a('string');
				endpoint1 += res.body.result.name;
				done();
			});


	});

	it('should be able to logout', function (done) {
		client1.get('http://127.0.0.1:3000/api/users/logout')
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('should be able to log in again', function (done) {
		client1.post('http://127.0.0.1:3000/api/users/login')
			.type('form')
			.send({
				'email': 'user1@testing.com',
				'password': 'Testing123'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				expect(res.body.status).to.equal('ok');
				token1 = getCookie(res.headers['set-cookie'], 'access-token');
				expect(token1).to.be.a('string');
				done();
			});
	});
});

function getCookie(headers, id) {
	for (var i = 0; i < headers.length; i++) {
		var kv = headers[i].split(';')[0].split('=');
		if (kv[0] === id) {
			return kv[1];
		}
	}
	return null;
}
