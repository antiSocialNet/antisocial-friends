var fixIfBehindProxy = require('../lib/utilities').fixIfBehindProxy;
var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');
var request = require('request');
var _ = require('lodash');

module.exports = function mountFriendUpdate(antisocialApp) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	var updateRegex = /^\/([a-zA-Z0-9\-.]+)\/friend-update$/;

	console.log('mounting GET /username/friend-update', updateRegex);

	router.post(updateRegex, authUserMiddleware, function handleFriendUpdate(req, res) {
		var matches = req.path.match(updateRegex);
		var username = matches[1];

		var endpoint = req.body.endpoint;

		if (!endpoint) {
			debug('endpoint not supplied');
			return res.status(400).send('endpoint not supplied');
		}

		if (!endpoint.match(/(^|\s)((https?:\/\/)?[\w-]+(\.[\w-]+)+\.?(:\d+)?(\/\S*)?)/gi)) {
			debug('endpoint not a valid url');
			return res.status(400).send('endpoint not a valid url');
		}

		// must be a logged in user
		var currentUser = req.antisocialUser;
		if (!currentUser) {
			debug('not logged in');
			return res.sendStatus(401);
		}

		// by convention expects user to match username
		if (currentUser.username !== username) {
			debug('username mismatch');
			return res.status(400).send('username mismatch');
		}

		var newStatus = req.body.status;
		var newAudiences = req.body.audiences;

		async.waterfall([
			function findFriend(cb) {
				debug('/friend-update findFriend');
				db.getInstances('friends', [{
					'property': 'userId',
					'value': currentUser.id
				}, {
					'property': 'remoteEndPoint',
					'value': req.body.endpoint
				}], function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friends'));
					}

					if (friendInstances.length !== 1) {
						return cb(new VError(err, 'friend request not found'));
					}

					cb(null, friendInstances[0]);
				});
			},
			function callWebHook(friend, cb) {
				debug('/friend-update callWebhook');

				var payload = {
					'accessToken': friend.remoteAccessToken,
					'action': 'friend-update'
				};

				if (newStatus === 'delete' || newStatus === 'block') {
					payload.action = 'friend-delete';
				}

				var options = {
					'url': fixIfBehindProxy(friend.remoteEndPoint + '/friend-webhook'),
					'form': payload,
					'json': true
				};

				request.post(options, function (err, response, body) {
					if (err) {
						return cb(new VError(err, '/friend-update callWebhook failed'));
					}
					if (response.statusCode !== 200) {
						return cb(new VError('/friend-update callWebhook http error ' + response.statusCode));
					}
					if (_.get(body, 'status') !== 'ok') {
						return cb(new VError('/friend-update callWebhook unexpected result %j' + body));
					}

					cb(null, friend);
				});
			},
			function createBlock(friend, cb) {
				if (newStatus !== 'block') {
					return async.setImmediate(function () {
						cb(null, friend);
					});
				}

				// create a block entry
				db.newInstance('blocks', {
					'remoteEndPoint': friend.remoteEndPoint,
					'userId': currentUser.id
				}, function (err, block) {
					cb(null, friend);
				});
			},
			function updateFriend(friend, cb) {

				if (newStatus === 'delete' || newStatus === 'block') {

					antisocialApp.emit('friend-deleted', {
						'friend': JSON.parse(JSON.stringify(friend))
					});

					db.deleteInstance('friends', friend.id, function (err, friend) {
						if (err) {
							var e = new VError(err, '/friend-update updateFriend error');
							return cb(e);
						}

						cb(null);
					});
				}
				else {
					friend.audiences.push('friends');

					var update = {
						'audiences': newAudiences
					};

					db.updateInstance('friends', friend.id, update, function (err, friend) {
						if (err) {
							var e = new VError(err, '/friend-update updateFriend error');
							return cb(e);
						}

						antisocialApp.emit('friend-updated', {
							'friend': friend
						});

						cb(null);
					});
				}
			}
		], function (err) {
			if (err) {
				var e = new WError(err, '/friend-update failed');
				return res.send({
					'status': 'error',
					'reason': e.message,
					'details': e.cause().message
				});
			}

			res.send({
				'status': 'ok'
			});
		});

	});
};
