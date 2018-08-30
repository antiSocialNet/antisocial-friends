/*
	mount websockets listener for incoming activity connections (server to server friends)
*/

var debug = require('debug')('antisocial-friends');
var VError = require('verror').VError;
var async = require('async');
var IO = require('socket.io');
var IOAuth = require('socketio-auth');
var cryptography = require('antisocial-encryption');

module.exports = function websocketsActivityMount(antisocialApp, expressListener) {
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	debug('mounting ws /antisocial-activity');

	if (!antisocialApp.openActivityListeners) {
		antisocialApp.openActivityListeners = {};
	}

	antisocialApp.ioActivity = IO(expressListener, {
		'path': '/antisocial-activity'
	});

	antisocialApp.ioActivity.on('connect', function (e) {
		debug('/antisocial-activity connect');
	});

	antisocialApp.ioActivity.on('disconnect', function (e) {
		debug('/antisocial-activity disconnect');
	});

	antisocialApp.ioActivity.on('error', function (e) {
		debug('/antisocial-activity error');
	});

	// friend activity feed
	// authenticate using friendAccessToken
	// then set up model observers and backfill any news since last connected

	IOAuth(antisocialApp.ioActivity, {
		'timeout': 60000,
		'authenticate': function (socket, data, callback) {
			debug('websocketsActivityMount authenticate', data);

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
					return callback(err);
				}
				if (friend.status !== 'accepted') {
					return callback(new VError(err, 'friend not accepted'), false);
				}
				data.friend = friend;
				data.user = user;
				callback(null, true);
			});
		},
		'postAuthenticate': function (socket, data) {
			socket.antisocial = {
				'friend': data.friend,
				'user': data.user,
				'highwater': data.friendHighWater || 0,
				'key': data.user.username + '<-' + data.friend.remoteEndPoint,
			};

			debug('websocketsActivityMount connection established', socket.antisocial.key);

			antisocialApp.openActivityListeners[socket.antisocial.key] = socket;

			antisocialApp.emit('open-activity-connection', {
				'info': socket.antisocial,
				'socket': socket
			});

			socket.on('data', function (data) {
				var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
				if (!decrypted.valid) { // could not validate signature
					console.log('WatchNewsFeedItem decryption signature validation error:', decrypted.invalidReason);
					return;
				}

				try {
					data = JSON.parse(decrypted.data);
				}
				catch (e) {
					data = decrypted.data;
				}

				antisocialApp.emit('activity-data', {
					'info': socket.antisocial,
					'data': data
				});
			});

			socket.on('disconnect', function (reason) {
				antisocialApp.emit('close-activity-connection', {
					'info': socket.antisocial,
					'reason': reason
				});
				db.updateInstance('friends', socket.antisocial.friend.id, {
					'online': false
				});
				delete antisocialApp.openActivityListeners[socket.antisocial.key];
			});

			db.updateInstance('friends', socket.antisocial.friend.id, {
				'online': true
			});
		}
	});
};
