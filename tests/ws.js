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
	var client4 = request.agent();

	var userTwoId;

	var endpoint1 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint2 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint3 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint4 = 'http://127.0.0.1:3000/antisocial/';
	var endpointBad = 'http://127.0.0.1:3000/antisocial/bad';

	var app = require('../app');

	before(function (done) {
		app.start(3000);
		done();
	});

	after(function () {
		app.stop();
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
				userTwoId = res.body.result.id;
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

	it('should be able to create account 4', function (done) {
		client4.post('http://127.0.0.1:3000/register')
			.type('form')
			.send({
				'name': 'user four',
				'username': 'user-four'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access_token');
				expect(accessToken).to.be.a('string');
				endpoint4 += res.body.result.username;
				done();
			});
	});


	it('create an invite', function (done) {
		app.db.newInstance('invitations', {
			'token': 'testinvite',
			'userId': userTwoId
		}, function (err, invite) {
			expect(err).to.be(null);
			done();
		});
	});

	it('user1 should be able to request friend user2 again with invite', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + encodeURIComponent(endpoint2) + '&invite=testinvite').end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user1 should be able to connect to user2 websockets activity feed', function (done) {
		app.db.getInstances('users', [{
			'property': 'username',
			'value': 'user-one'
		}], function (err, instances) {
			var user = instances[0];
			app.db.getInstances('friends', [{
				'property': 'userId',
				'value': user.id
			}], function (err, instances) {
				var friend = instances[0];
				var subscribe = require('../lib/websockets-activity-subscribe');
				subscribe.connect(app.antisocial, user, friend);
				setTimeout(function () {
					done();
				}, 5000);
			});
		});
	});

	/*
	it('user1 should be able to connect to user2 websockets activity feed', function (done) {
		app.db.getInstances('users', [{
			'property': 'username',
			'value': 'user-one'
		}], function (err, instances) {
			var user = instances[0];
			app.db.getInstances('friends', [{
				'property': 'userId',
				'value': user.id
			}], function (err, instances) {
				var friend = instances[0];
				var endpoint = 'http://127.0.0.1:3000';
				var socket = require('socket.io-client')(endpoint, {
					'path': '/antisocial-activity'
				});

				socket.on('connect', function () {
					console.log('client connected');
					socket.on('authenticated', function () {
						console.log('client authenticated');
						socket.emit('data', {
							'foo': 'bar'
						});
						done();
					});
					socket.on('unauthorized', function (err) {
						console.log('client unauthorized', err.message);
						done();
					});

					socket.emit('authentication', {
						'username': friend.remoteUsername,
						'friendAccessToken': friend.remoteAccessToken,
						'friendHighWater': friend.highWater
					});
				});

				socket.on('disconnect', function () {
					console.log('client disconnect');
					done();
				});

				socket.on('error', function () {
					console.log('client error');
					done();
				});
			});
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
