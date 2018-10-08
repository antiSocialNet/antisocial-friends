// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var uuid = require('uuid');
var crc = require('crc');
var encryption = require('antisocial-encryption');
var fixIfBehindProxy = require('../lib/utilities').fixIfBehindProxy;
var url = require('url');
var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');
var request = require('request');
var _ = require('lodash');

module.exports = function mountFriendRequest(antisocialApp) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	var testRegex = /^\/([a-zA-Z0-9\-.]+)\/friend-request$/;

	debug('mounting GET /username/friend-request', testRegex);

	router.post(testRegex, function handleFriendRequest(req, res) {
		var matches = req.path.match(testRegex);
		var username = matches[1];

		if (!req.body.remoteEndPoint) {
			debug('remoteEndPoint not supplied');
			return res.status(400).send('remoteEndPoint not supplied');
		}

		var requestToken = req.body.requestToken;
		var invite = req.body.inviteToken;

		if (!req.body.remoteEndPoint.match(/(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/gi)) {
			debug('remoteEndPoint not a valid url');
			return res.status(400).send('remoteEndPoint not a valid url');
		}

		var remoteEndPoint = url.parse(req.body.remoteEndPoint);

		async.waterfall([
			function getUser(cb) {
				debug('/friend-request getUser');
				db.getInstances('users', [{
					'property': 'username',
					'value': username
				}], function (err, userInstances) {
					if (err) {
						return cb(new VError(err, 'user not found'));
					}

					if (userInstances.length > 1) {
						return cb(new VError('more than one user matching username'));
					}

					if (!userInstances.length) {
						return cb(new VError('user not found'));
					}

					var user = userInstances[0];

					var myEndPoint = config.publicHost + config.APIPrefix + '/' + user.username;

					if (myEndPoint === req.body.remoteEndPoint) {
						return cb(new VError(err, 'can not friend yourself'));
					}

					cb(err, user);
				});
			},
			function checkBlocked(user, cb) {
				db.getInstances('blocks', [{
					'property': 'userId',
					'value': user.id
				}, {
					'property': 'remoteEndPoint',
					'value': req.body.remoteEndPoint
				}], function (err, blockedInstances) {
					if (err) {
						return cb(new VError(err, 'error reading blocks'));
					}

					if (blockedInstances.length) {
						return cb(new VError(err, 'blocked'));
					}

					cb(null, user);
				});
			},
			function checkDupeFriend(user, cb) {
				debug('/friend-request checkDupeFriend');
				db.getInstances('friends', [{
					'property': 'userId',
					'value': user.id
				}, {
					'property': 'remoteEndPoint',
					'value': req.body.remoteEndPoint
				}], function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friends'));
					}

					if (friendInstances.length) {
						return cb(new VError(err, 'duplicate friend request'));
					}

					cb(err, user);
				});
			},
			function keyPair(user, cb) {
				debug('/friend-request keyPair');
				encryption.getKeyPair(function (err, pair) {
					if (err) {
						var e = new VError(err, '/friend-request keyPair failed');
						return cb(e);
					}
					cb(null, user, pair);
				});
			},
			function processInvite(user, pair, cb) {
				if (!invite) {
					return async.setImmediate(function () {
						cb(null, user, pair, null);
					});
				}

				db.getInstances('invitations', [{
					'property': 'userId',
					'value': user.id
				}, {
					'property': 'token',
					'value': invite
				}], function (err, invitations) {
					if (err) {
						var e = new VError(err, '/friend-request processInvite failed reading invitations');
						return cb(e);
					}

					if (invitations.length > 1) {
						return cb(new VError('/friend-request processInvite more than one user invitation token'));
					}

					if (!invitations.length) {
						return cb(new VError('/friend-request processInvite invitation not found'));
					}

					cb(null, user, pair, invitations[0]);
				});
			},
			function createPendingFriend(user, pair, invitation, cb) {
				debug('/friend-request createPendingFriend');

				var newFriend = {
					'status': 'pending',
					'remoteRequestToken': requestToken,
					'remoteEndPoint': req.body.remoteEndPoint,
					'remoteHost': remoteEndPoint.protocol + '//' + remoteEndPoint.host,
					'localRequestToken': uuid(),
					'localAccessToken': uuid(),
					'keys': pair,
					'audiences': ['public'],
					'hash': crc.crc32(req.body.remoteEndPoint).toString(16),
					'userId': user.id,
					'inviteToken': invite,
					'highWater': {}
				};

				db.newInstance('friends', newFriend, function (err, friendInstance) {
					if (err) {
						var e = new VError(err, '/friend-request createPendingFriend failed');
						return cb(e);
					}
					cb(null, user, friendInstance, invitation);
				});
			},
			function exchangeToken(user, friend, invitation, cb) {

				var myEndPoint = config.publicHost + config.APIPrefix + '/' + user.username;
				var payload = {
					'endpoint': myEndPoint,
					'requestToken': requestToken
				};

				var options = {
					'url': fixIfBehindProxy(friend.remoteEndPoint + '/exchange-token'),
					'form': payload,
					'json': true
				};

				debug('/friend-request exchangeToken POST ', options);

				request.post(options, function (err, response, body) {
					if (err) {
						var e = new VError(err, '/friend-request exchangeToken request error');
						return cb(e, user, friend);
					}
					if (response.statusCode !== 200) {
						var e = new VError(err, '/friend-request exchangeToken got http status: ' + response.statusCode);
						debug('/friend-request exchangeToken error %s %s', response.statusCode, body);
						return cb(e, user, friend);
					}

					if (!_.has(body, 'status') || !_.has(body, 'accessToken') || !_.has(body, 'publicKey')) {
						e = new VError(err, '/friend-request exchangeToken got unexpected response %j', body);
						return cb(e, user, friend);
					}

					debug('/friend-request exchangeToken got ', body);

					cb(null, user, friend, invitation, body);
				});
			},
			function saveToken(user, friend, invitation, exchange, cb) {
				db.getInstances('friends', [{
					'property': 'userId',
					'value': user.id
				}], function (err, friends) {
					if (err) {
						var e = new VError(err, '/friend-request createPendingFriend failed reading friends');
						return cb(e, user, friend);
					}

					var unique = 0;
					for (var i = 0; i < friends.length; i++) {
						var friend = friends[i];
						if (friend.remoteUsername === exchange.username) {
							++unique;
						}
					}

					var update = {
						'remoteAccessToken': exchange.accessToken,
						'remotePublicKey': exchange.publicKey,
						'remoteName': exchange.name,
						'remoteUsername': exchange.username,
						'uniqueRemoteUsername': unique ? exchange.username + '-' + unique : exchange.username,
						'community': exchange.community
					};

					if (invitation) {
						update.status = 'accepted';
						update.audiences = ['public', 'friends'];
					}

					db.updateInstance('friends', friend.id, update, function (err, friend) {
						if (err) {
							var e = new VError(err, '/friend-request saveToken error');
							return cb(e, user, friend);
						}

						cb(null, user, friend);
					});
				});
			}
		], function (err, user, friend) {
			if (err) {
				var e = new WError(err, 'request-friend failed');
				debug('friend-request error', e.cause().message);
				res.send({
					'status': 'error',
					'reason': e.message,
					'details': e.cause().message
				});

				if (friend) {
					db.deleteInstance('friends', friend.id, function (err) {
						if (err) {
							console.log('/friend-request error deleting pending friend', err);
						}
					});
				}
			}
			else {
				if (friend.inviteToken) {
					antisocialApp.emit('new-friend', user, friend);
				}
				else {
					antisocialApp.emit('new-friend-request', user, friend);
				}

				// if success hand a request token back to caller
				res.send({
					'status': 'ok',
					'requestToken': friend.localRequestToken,
				});
			}
		});
	});
};
