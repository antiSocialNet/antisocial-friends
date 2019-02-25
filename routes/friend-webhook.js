// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');
const errorLog = require('debug')('errors');



module.exports = function mountFriendWebhook(antisocialApp) {

	var router = antisocialApp.router;
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	var webhookRegex = /^\/([a-zA-Z0-9\-.]+)\/friend-webhook$/;

	debug('mounting GET /username/friend-webhook', webhookRegex);

	router.post(webhookRegex, function handleFriendRequest(req, res) {
		var matches = req.path.match(webhookRegex);
		var username = matches[1];

		debug('/friend-webhook %s %j', username, req.body);

		async.waterfall([
			function getUser(cb) {
				debug('/friend-webhook getUser');
				db.getInstances('users', {
					'username': username
				}, function (err, userInstances) {
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

					cb(err, user);
				});
			},
			function getFriendByAccessToken(user, cb) {
				debug('/friend-webhook getFriendByAccessToken');
				db.getInstances('friends', {
					'userId': user.id,
					'localAccessToken': req.body.accessToken
				}, function (err, friendInstances) {
					if (err) {
						return cb(new VError(err, 'error reading friends'));
					}

					if (!friendInstances.length) {
						return cb(new VError(err, 'friend not found'));
					}

					cb(err, user, friendInstances[0]);
				});
			},
			function updateFriend(user, friend, cb) {
				debug('/friend-webhook updateFriend action ' + req.body.action);

				if (req.body.action === 'friend-request-accepted') {
					// mark friend as accepted
					friend.audiences.push('friends');
					var update = {
						'status': 'accepted',
						'audiences': friend.audiences
					};

					db.updateInstance('friends', friend.id, update, function (err, friend) {
						if (err) {
							var e = new VError(err, '/friend-webhook friend-request-accepted error');
							return cb(e, friend);
						}

						antisocialApp.emit('new-friend', user, friend);

						antisocialApp.activityFeed.connect(user, friend);

						cb(null, friend);
					});
				}
				else if (req.body.action === 'friend-update') {

					antisocialApp.emit('friend-updated', user, friend);

					cb(null, friend);
				}
				else if (req.body.action === 'friend-request-declined' || req.body.action === 'request-friend-cancel' || req.body.action === 'friend-delete') {

					antisocialApp.emit('friend-deleted', user, JSON.parse(JSON.stringify(friend)));

					if (req.body.action === 'friend-delete') {
						antisocialApp.activityFeed.disconnect(user, friend, function (err) {
							db.deleteInstance('friends', friend.id, function (err) {
								if (err) {
									var e = new VError(err, '/friend-webhook ' + req.body.action + ' error');
									return cb(e);
								}
								cb(null);
							});
						});
					}
					else {
						db.deleteInstance('friends', friend.id, function (err) {
							if (err) {
								var e = new VError(err, '/friend-webhook ' + req.body.action + ' error');
								return cb(e);
							}
							cb(null);
						});
					}
				}
				else {
					return cb(new VError('unknown webhook action'));
				}
			}
		], function (err) {
			if (err) {
				errorLog('/friend-webook error %s', err.message);
				var e = new WError(err, '/friend-webook failed');
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
