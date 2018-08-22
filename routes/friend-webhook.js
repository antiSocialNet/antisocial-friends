var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var WError = require('verror').WError;
var async = require('async');

module.exports = function mountFriendWebhook(router, config, db, authUserMiddleware) {

	var webhookRegex = /^\/([a-zA-Z0-9\-\.]+)\/friend-webhook$/;

	console.log('mounting GET /username/friend-webhook', webhookRegex);

	router.post(webhookRegex, function handleFriendRequest(req, res) {
		var matches = req.path.match(webhookRegex);
		var username = matches[1];

		async.waterfall([
			function getUser(cb) {
				debug('/friend-webhook getUser');
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

					cb(err, user);
				});
			},
			function getFriendByAccessToken(user, cb) {
				debug('/friend-webhook getFriendByAccessToken');
				db.getInstances('friends', [{
					'property': 'userId',
					'value': user.id
				}, {
					'property': 'localAccessToken',
					'value': req.body.accessToken
				}], function (err, friendInstances) {
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
					}

					db.updateInstance('friends', friend.id, update, function (err, friend) {
						if (err) {
							var e = new VError(err, '/friend-webhook friend-request-accepted error');
							return cb(e, friend);
						}

						router.eventHandler.emit('new-friend', {
							'friend': friend
						});

						cb(null, friend);
					})
				}
				else if (req.body.action === 'friend-update') {

					router.eventHandler.emit('friend-updated', {
						'friend': friend
					});

					cb(null, friend);
				}
				else if (req.body.action === 'friend-request-declined' || req.body.action === 'request-friend-cancel' || req.body.action === 'friend-delete') {

					router.eventHandler.emit('friend-deleted', {
						'friend': JSON.parse(JSON.stringify(friend))
					});

					db.deleteInstance('friends', friend.id, function (err, friend) {
						if (err) {
							var e = new VError(err, '/friend-webhook friend-request-declined error');
							return cb(e);
						}

						cb(null);
					})
				}
				else {
					return cb(new VError('unknown webhook action'));
				}
			}
		], function (err) {
			if (err) {
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
		})
	});
}
