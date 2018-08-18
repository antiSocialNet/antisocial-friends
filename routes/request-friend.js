var uuid = require('uuid');
var crc = require('crc');
var encryption = require('antisocial-encryption');
var fixIfBehindProxy = require('../lib/utilities').fixIfBehindProxy;
var url = require('url');
var debug = require('debug')('antisocial-friends');
var async = require('async');
var request = require('request');
var VError = require('verror').VError;
var WError = require('verror').WError;
var _ = require('lodash');


module.exports = function mountRequestFriend(router, config, db, authUserMiddleware) {

	var testRegex = /^\/([a-zA-Z0-9\-\.]+)\/request-friend$/;

	console.log('mounting GET /username/request-friend', testRegex);

	router.get(testRegex, authUserMiddleware, function (req, res) {
		var matches = req.path.match(testRegex);
		var user = matches[1];

		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		// by convention expects user to match username
		if (currentUser.username !== user) {
			debug('username mismatch');
			return res.sendStatus(400);
		}

		var myEndPoint = config.publicHost + config.APIPrefix + '/' + currentUser.username;

		// endpoint must be supplied and it must be a valid url
		var endpoint = req.query.endpoint;
		if (!endpoint) {
			debug('endpoint not supplied');
			return res.status(400).send('endpoint not supplied');
		}

		if (!endpoint.match(/(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/gi)) {
			debug('endpoint not a valid url');
			return res.status(400).send('endpoint not a valid url');
		}

		if (myEndPoint === req.query.endpoint) {
			debug('can not friend yourself');
			return res.status(400).send('can not friend yourself');
		}

		var remoteEndPoint = url.parse(req.query.endpoint);
		var invite = req.query.invite;

		async.waterfall([
			function checkDupeFriend(cb) {
				debug('/request-friend checkDupeFriend');
				db.getInstances('friends', [{
					'property': 'userId',
					'value': currentUser.id
				}, {
					'property': 'remoteEndPoint',
					'value': req.query.endpoint
				}], function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friends'));
					}

					if (friendInstances.length) {
						return cb(new VError(err, 'duplicate friend request'));
					}

					cb();
				});
			},
			function keyPair(cb) {
				debug('/request-friend keyPair');
				encryption.getKeyPair(function (err, pair) {
					if (err) {
						var e = new VError(err, '/request-friend keyPair failed');
						return cb(e);
					}
					cb(null, pair);
				});
			},
			function createPendingFriend(pair, cb) {
				debug('/request-friend createPendingFriend');

				var newFriend = {
					'originator': true,
					'status': 'pending',
					'remoteEndPoint': req.query.endpoint,
					'remoteHost': remoteEndPoint.protocol + '//' + remoteEndPoint.host,
					'localRequestToken': uuid(),
					'localAccessToken': uuid(),
					'keys': pair,
					'audiences': ['public'],
					'hash': crc.crc32(req.query.endpoint).toString(16),
					'userId': currentUser.id
				}

				db.newInstance('friends', newFriend, function (err, friendInstance) {
					if (err) {
						var e = new VError(err, '/request-friend createPendingFriend failed');
						return cb(e);
					}
					cb(null, friendInstance);
				})
			},
			function makeFriendRequest(friend, cb) {

				var payload = {
					'remoteEndPoint': myEndPoint,
					'requestToken': friend.localRequestToken,
					'inviteToken': invite
				};

				var options = {
					'url': fixIfBehindProxy(friend.remoteEndPoint + '/friend-request'),
					'form': payload,
					'json': true,
					'timeout': 10000
				};

				debug('/request-friend makeFriendRequest POST', options);

				request.post(options, function (err, response, body) {
					var e;

					if (err) {
						e = new VError(err, '/request-friend makeFriendRequest failed');
						return cb(e, friend);
					}

					if (response.statusCode !== 200) {
						e = new VError('/request-friend makeFriendRequest failed (http status: ' + response.statusCode + ' ' + body + ')');
						return cb(e, friend);
					}

					if (_.get(body, 'status') !== 'ok') {
						e = new VError('/request-friend makeFriendRequest failed (reason: ' + _.get(body, 'details') + ')');
						return cb(e, friend);
					}

					debug('/request-friend makeFriendRequest got ', body);

					cb(err, friend, body.requestToken);
				});
			},
			function exchangeToken(friend, requestToken, cb) {

				var payload = {
					'endpoint': myEndPoint,
					'requestToken': requestToken
				};

				var options = {
					'url': fixIfBehindProxy(friend.remoteEndPoint + '/exchange-token'),
					'form': payload,
					'json': true
				}

				debug('/request-friend exchangeToken POST ', options);

				request.post(options, function (err, response, body) {
					if (err) {
						var e = new VError(err, '/request-friend exchangeToken request error');
						return cb(e, friend);
					}
					if (response.statusCode !== 200) {
						var e = new VError(err, '/request-friend exchangeToken got http status: ' + response.statusCode);
						return cb(e, friend);
					}

					if (!_.has(body, 'status') || !_.has(body, 'accessToken') || !_.has(body, 'publicKey')) {
						e = new VError(err, '/request-friend exchangeToken got unexpected response %j', body);
						return cb(e, friend);
					}

					debug('/request-friend exchangeToken got ', body);

					cb(null, friend, body);
				});
			},
			function saveToken(friend, exchange, cb) {

				db.getInstances('friends', [{
					'property': 'userId',
					'value': currentUser.id
				}], function (err, friends) {
					if (err) {
						var e = new VError(err, '/request-friend saveToken failed reading friends');
						return cb(e, friend);
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
						'uniqueRemoteUsername': unique ? exchange.username + '-' + unique : exchange.username
					};

					if (invite && exchange.status === 'accepted') {
						update.status = 'accepted';
						update.audiences = ['public', 'friends'];
					}

					db.updateInstance('friends', friend.id, update, function (err, friend) {
						if (err) {
							var e = new VError(err, '/request-friend saveToken error');
							return cb(e, friend);
						}

						cb(null, friend);
					})
				});
			}
		], function (err, friend) {
			if (err) {

				var e = new WError(err, 'request-friend failed');

				res.send({
					'status': 'error',
					'reason': e.message,
					'details': e.cause().message
				});

				if (friend) {
					db.deleteInstance('friends', friend.id, function (err) {
						if (err) {
							console.log('/request-friend error deleting pending friend', err);
						}
					});
				}
			}
			else {

				// if success hand a request token back to caller
				res.send({
					'status': 'ok'
				});
			}
		});
	});
}
