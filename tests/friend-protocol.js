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
	var client5 = request.agent();

	var userTwoId;

	var endpoint1 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint2 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint3 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint4 = 'http://127.0.0.1:3000/antisocial/';
	var endpoint5 = 'http://127.0.0.1:3000/antisocial/';
	var endpointBad = 'http://127.0.0.1:3000/antisocial/bad';

	var app = require('../app');

	before(function (done) {
		app.start(3000);
		done();
	});

	after(function (done) {
		setTimeout(function () {
			console.log('users: %j', app.db.collections.users);
			console.log('invitations: %j', app.db.collections.invitations);
			//console.log('friends: %j', app.db.collections.friends);
			//console.log('blocks: %j', app.db.collections.blocks);
			//console.log('postIdMap: %j highwaterMap: %j', app.postIdMap, app.highwaterMap);
			app.stop();
			done();
		}, 10000);
	});

	it('should be able to create account 1', function (done) {
		client1.post('http://127.0.0.1:3000/api/users/register')
			.type('form')
			.send({
				'name': 'user one',
				'username': 'user-one',
				'email': 'test-1@myantisocial.net',
				'password': 'Testing123'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access-token');
				expect(accessToken).to.be.a('string');
				endpoint1 += res.body.result.username;
				done();
			});
	});

	it('should be able to create account 2', function (done) {
		client2.post('http://127.0.0.1:3000/api/users/register')
			.type('form')
			.send({
				'name': 'user two',
				'username': 'user-two',
				'email': 'test-1@myantisocial.net',
				'password': 'Testing123'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access-token');
				expect(accessToken).to.be.a('string');
				endpoint2 += res.body.result.username;
				userTwoId = res.body.result.id;
				done();
			});
	});

	it('should be able to create account 3', function (done) {
		client3.post('http://127.0.0.1:3000/api/users/register')
			.type('form')
			.send({
				'name': 'user three',
				'username': 'user-three',
				'email': 'test-1@myantisocial.net',
				'password': 'Testing123'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access-token');
				expect(accessToken).to.be.a('string');
				endpoint3 += res.body.result.username;
				done();
			});
	});

	it('should be able to create account 4', function (done) {
		client4.post('http://127.0.0.1:3000/api/users/register')
			.type('form')
			.send({
				'name': 'user four',
				'username': 'user-four',
				'email': 'test-1@myantisocial.net',
				'password': 'Testing123'
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access-token');
				expect(accessToken).to.be.a('string');
				endpoint4 += res.body.result.username;
				done();
			});
	});

	it('should be able to create account 5 (community)', function (done) {
		client5.post('http://127.0.0.1:3000/api/users/register')
			.type('form')
			.send({
				'name': 'test community',
				'username': 'test-community',
				'email': 'test-1@myantisocial.net',
				'password': 'Testing123',
				'community': true,
			})
			.end(function (err, res) {
				expect(err).to.be(null);
				expect(res.status).to.equal(200);
				var accessToken = getCookie(res.headers['set-cookie'], 'access-token');
				expect(accessToken).to.be.a('string');
				endpoint5 += res.body.result.username;
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

	it('user1 should be able to request join community', function (done) {
		client1.get('http://127.0.0.1:3000/antisocial/user-one/request-friend?endpoint=' + encodeURIComponent(endpoint5)).end(function (err, res) {
			expect(res.status).to.be(200);
			expect(res.body.status).to.equal('ok');
			done();
		});
	});

	var friend;
	var user;

	it('user1 should be able disconnect', function (done) {
		//wait 2 seconds then disconnect
		setTimeout(function () {
			app.db.getInstances('users', [{
				'property': 'username',
				'value': 'user-one'
			}], function (err, instances) {
				user = instances[0];
				app.db.getInstances('friends', [{
					'property': 'userId',
					'value': user.id
				}], function (err, instances) {
					friend = instances[0];

					app.antisocial.activityFeed.disconnect(user, friend, function (err) {
						expect(err).to.be(null);
						//wait 2 seconds then continue
						setTimeout(function () {
							done();
						}, 2000);
					});
				});
			});
		}, 2000);
	});

	it('user1 should be able increment lastPost to simulate backfill behavior', function (done) {
		app.postIdMap[user.id] = 14;
		done();
	});

	it('user1 should be able connect', function (done) {
		app.antisocial.activityFeed.connect(user, friend);
		done();
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
