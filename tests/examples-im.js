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

	var imSessionID;

	var app = require('../app');

	before(function (done) {
		app.start(3000);
		done();
	});

	after(function (done) {
		setTimeout(function () {
			console.log('users: %j', app.db.collections.users);
			console.log('imsessions: %j', app.db.collections.imsessions);
			console.log('ims: %j', app.db.collections.ims);
			console.log('friends: %j', app.db.collections.friends);

			//console.log('invitations: %j', app.db.collections.invitations);
			//console.log('blocks: %j', app.db.collections.blocks);
			//console.log('postIdMap: %j highwaterMap: %j', app.postIdMap, app.highwaterMap);

			app.stop();
			done();
		}, 10000);
	});

	it('should be able to create account 1', function (done) {
		client1.post('http://127.0.0.1:3000/register')
			.type('form')
			.send({
				'name': 'user one',
				'username': 'user-one'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access_token');
				expect(accessToken).to.be.a('string');
				endpoint1 += res.body.result.username;
				done();
			});
	});

	it('should be able to create account 2', function (done) {
		client2.post('http://127.0.0.1:3000/register')
			.type('form')
			.send({
				'name': 'user two',
				'username': 'user-two'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access_token');
				expect(accessToken).to.be.a('string');
				endpoint2 += res.body.result.username;
				done();
			});
	});

	it('should be able to create account 3', function (done) {
		client3.post('http://127.0.0.1:3000/register')
			.type('form')
			.send({
				'name': 'user three',
				'username': 'user-three'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access_token');
				expect(accessToken).to.be.a('string');
				endpoint3 += res.body.result.username;
				done();
			});
	});

	it('user1 should be able to request friend user2', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + endpoint2).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user1 should be able to request friend user3', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + endpoint3).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user2 should be able to accept friend request from user1', function (done) {
		client2.post('http://127.0.0.1:3000/antisocial/user-two/friend-request-accept')
			.type('form')
			.send({
				'endpoint': endpoint1
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user3 should be able to accept friend request from user1', function (done) {
		client3.post('http://127.0.0.1:3000/antisocial/user-three/friend-request-accept')
			.type('form')
			.send({
				'endpoint': endpoint1
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user1 should be able to create a chat session', function (done) {
		client1.post('http://127.0.0.1:3000/antisocial/im')
			.type('form')
			.send({
				'name': 'test session'
			}).end(function (err, res) {
				console.log(res.body);
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				imSessionID = res.body.session;
				done();
			});
	});

	it('user1 should be able to add user2 to chat session', function (done) {
		client1.put('http://127.0.0.1:3000/antisocial/im/' + imSessionID)
			.type('form')
			.send({
				'endpoint': endpoint2
			}).end(function (err, res) {
				console.log(res.body);
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user1 should be able to add user3 to chat session', function (done) {
		client1.put('http://127.0.0.1:3000/antisocial/im/' + imSessionID)
			.type('form')
			.send({
				'endpoint': endpoint3
			}).end(function (err, res) {
				console.log(res.body);
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});


	it('user1 should be able to send a message to chat session', function (done) {
		client1.post('http://127.0.0.1:3000/antisocial/im/' + imSessionID)
			.type('form')
			.send({
				'body': 'first message from user1'
			}).end(function (err, res) {
				console.log(res.body);
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	/*

		it('user2 should be able to send a message to chat session', function (done) {
			client2.post('http://127.0.0.1:3000/antisocial/im/' + imSessionID)
				.type('form')
				.send({
					'body': 'message from user2'
				}).end(function (err, res) {
					console.log(res.body);
					expect(res.status).to.be(200);
					expect(res.body.status).to.equal('ok');
					done();
				});
		});
		*/

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
