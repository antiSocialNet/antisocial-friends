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
		//console.log('users: %j', app.db.collections.users);
		//console.log('invitations: %j', app.db.collections.invitations);
		//console.log('friends: %j', app.db.collections.friends);
		//console.log('blocks: %j', app.db.collections.blocks);
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

	it('user1 should be able to request friend user4', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + endpoint4).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user2 should be able to request friend user3', function (done) {
		client2.get('http://127.0.0.1:3000/antisocial/user-two/request-friend?endpoint=' + endpoint3).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user3 should be able to request friend user4', function (done) {
		client3.get('http://127.0.0.1:3000/antisocial/user-three/request-friend?endpoint=' + endpoint4).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user1 should not be able to request friend user2 again', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + endpoint2).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('error');
			done();
		});
	});

	it('user1 should not be able to request friend unknown user', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + encodeURIComponent(endpointBad)).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.not.equal('ok');
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

	it('user3 should be able to accept friend request from user2', function (done) {
		client3.post('http://127.0.0.1:3000/antisocial/user-three/friend-request-accept')
			.type('form')
			.send({
				'endpoint': endpoint2
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user4 should be able to accept friend request from user3', function (done) {
		client4.post('http://127.0.0.1:3000/antisocial/user-four/friend-request-accept')
			.type('form')
			.send({
				'endpoint': endpoint3
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user1 should be able to cancel friend request to user3', function (done) {
		client1.post('http://127.0.0.1:3000/antisocial/user-one/request-friend-cancel')
			.type('form')
			.send({
				'endpoint': endpoint3
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user4 should be able to decline friend request from user1', function (done) {
		client4.post('http://127.0.0.1:3000/antisocial/user-four/friend-request-decline')
			.type('form')
			.send({
				'endpoint': endpoint1
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user1 should be able to delete friend user2 (delete as originator)', function (done) {
		client1.post('http://127.0.0.1:3000/antisocial/user-one/friend-update')
			.type('form')
			.send({
				'endpoint': endpoint2,
				'status': 'delete'
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user4 should be able to delete friend user3 (delete as non-originator)', function (done) {
		client4.post('http://127.0.0.1:3000/antisocial/user-four/friend-update')
			.type('form')
			.send({
				'endpoint': endpoint3,
				'status': 'delete'
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user2 should be able to block friend user3', function (done) {
		client2.post('http://127.0.0.1:3000/antisocial/user-two/friend-update')
			.type('form')
			.send({
				'endpoint': endpoint3,
				'status': 'block'
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('ok');
				done();
			});
	});

	it('user3 should be blocked by user2', function (done) {
		client3.get('http://127.0.0.1:3000/antisocial/user-three/request-friend?endpoint=' + endpoint2).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('error');
			expect(res.body.details).to.equal('/request-friend makeFriendRequest failed (reason: blocked)');
			done();
		});
	});

	it('create an invite', function (done) {
		app.db.newInstance('invitations', {
			'token': 'testinvite',
			'userId': userTwoId
		}, function (err, invite) {
			expect(err).to.be(null);
			done()
		})
	});

	it('user1 should be able to request friend user2 again with invite', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + encodeURIComponent(endpoint2) + '&invite=testinvite').end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	it('user2 should not be able to accept friend request that is already accepted', function (done) {
		client2.post('http://127.0.0.1:3000/antisocial/user-two/friend-request-accept')
			.type('form')
			.send({
				'endpoint': endpoint1
			}).end(function (err, res) {
				expect(res.status).to.be(200);
				expect(res.body.status).to.equal('error');
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
				var subscribe = require('../routes/websockets-activity-subscribe');
				subscribe.connect(app.antisocial, user, friend);
				setTimeout(function () {
					done();
				}, 5000);
			});
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
