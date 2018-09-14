// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/*
	mount socket.io listener for incoming activity connections (server to server friends)
*/

var debug = require('debug')('antisocial-friends:activity');
var VError = require('verror').VError;
var async = require('async');
var IO = require('socket.io');
var IOAuth = require('socketio-auth');
var cryptography = require('antisocial-encryption');

module.exports = function activityFeedMount(antisocialApp, expressListener) {
	var db = antisocialApp.db;

	debug('mounting ws /antisocial-activity');

	if (!antisocialApp.openActivityListeners) {
		antisocialApp.openActivityListeners = {};
	}

	antisocialApp.ioActivity = IO(expressListener, {
		'path': '/antisocial-activity'
	});

	antisocialApp.ioActivity.on('connect', function (soc) {
		debug('%s /antisocial-activity connect', soc.id);
		soc.on('disconnect', function (e) {
			debug('%s /antisocial-activity disconnect %s', soc.id, e);
		});
		soc.on('error', function (e) {
			debug('%s /antisocial-activity error %s', soc.id, e);
		});
	});

	// friend activity feed
	// authenticate using friendAccessToken
	// then set up model observers and backfill any news since last connected

	IOAuth(antisocialApp.ioActivity, {
		'timeout': 60000,
		'authenticate': function (socket, data, callback) {
			debug('%s /antisocial-activity authenticate', socket.id);

			if (!data.friendAccessToken) {
				callback(new VError('friendAccessToken not supplied'), false);
			}
			if (!data.username) {
				callback(new VError('username not supplied'), false);
			}

			async.waterfall([
				function getUser(cb) {
					db.getInstances('users', [{
						'property': 'username',
						'value': data.username
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
				function findFriend(user, cb) {
					db.getInstances('friends', [{
						'property': 'userId',
						'value': user.id
					}, {
						'property': 'localAccessToken',
						'value': data.friendAccessToken
					}], function (err, friendInstances) {
						if (err) {
							return cb(new VError(err, 'error reading friends'));
						}

						if (!friendInstances.length) {
							return cb(new VError(err, 'friend not found'));
						}

						cb(err, user, friendInstances[0]);
					});
				}
			], function (err, user, friend) {
				if (err) {
					debug('%s /antisocial-activity authenticate error %s', socket.id, err.message);
					return callback(err);
				}
				if (friend.status !== 'accepted') {
					return callback(new VError(err, 'friend not accepted'), false);
				}
				data.friend = friend;
				data.user = user;

				var key = data.user.username + '<-' + data.friend.remoteEndPoint;

				if (antisocialApp.openActivityListeners[key]) {
					debug('%s /antisocial-activity abort already connected %s', socket.id, key);
					return callback(new VError(err, 'already connected ' + key), false);
				}

				antisocialApp.openActivityListeners[key] = socket;

				callback(null, true);
			});
		},
		'postAuthenticate': function (socket, data) {
			debug('%s /antisocial-activity postAuthenticate', socket.id);

			socket.antisocial = {
				'friend': data.friend,
				'user': data.user,
				'key': data.user.username + '<-' + data.friend.remoteEndPoint
			};

			debug('%s /antisocial-activity connection established %s', socket.id, socket.antisocial.key);

			socket.antisocial.emitter = function (appId, eventType, data) {
				var message = {
					'appId': appId,
					'data': data
				};

				debug('emitter (feed mount)', eventType, message);
				message = cryptography.encrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, JSON.stringify(message));
				socket.emit(eventType, message);
			};

			socket.on('highwater', function (data) {
				var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
				if (!decrypted.valid) { // could not validate signature
					console.log('WatchNewsFeedItem decryption signature validation error:', decrypted.invalidReason);
					return;
				}

				data = decrypted.data;
				debug('%s /antisocial-activity got highwater from %s %s', socket.id, socket.antisocial.key, data);

				if (!decrypted.contentType || decrypted.contentType === 'application/json') {
					try {
						data = JSON.parse(decrypted.data);
					}
					catch (e) {
						data = decrypted.data;
					}
				}

				var appid = data.appId;
				antisocialApp.emit('activity-backfill-' + appid, socket.antisocial.user, socket.antisocial.friend, data.data, socket.antisocial.emitter);
			});

			socket.on('data', function (data) {
				debug('%s /antisocial-activity data from %s', socket.id, socket.antisocial.key);

				var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
				if (!decrypted.valid) { // could not validate signature
					debug('%s /antisocial-activity decryption signature validation error:', socket.id, decrypted.invalidReason);
					return;
				}

				data = decrypted.data;

				if (!decrypted.contentType || decrypted.contentType === 'application/json') {
					try {
						data = JSON.parse(decrypted.data);
					}
					catch (e) {
						data = '';
					}
				}

				var appid = data.appId;
				debug('%s /antisocial-activity emitting activity-data-' + appid, socket.id);
				antisocialApp.emit('activity-data-' + appid, socket.antisocial.user, socket.antisocial.friend, data.data);
			});

			socket.on('disconnect', function (reason) {
				debug('%s /antisocial-activity disconnect %s %s', socket.id, socket.antisocial.key, reason);
				antisocialApp.emit('close-activity-connection', {
					'info': socket.antisocial,
					'reason': reason
				});
				db.updateInstance('friends', socket.antisocial.friend.id, {
					'online': false
				});
				delete antisocialApp.openActivityListeners[socket.antisocial.key];
			});

			antisocialApp.emit('open-activity-connection', socket.antisocial.user, socket.antisocial.friend, socket.antisocial.emitter, socket.antisocial);

			db.updateInstance('friends', socket.antisocial.friend.id, {
				'online': true
			});
		}
	});
};
