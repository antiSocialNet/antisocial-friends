// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/*
	mount socket.io listener for incoming activity connections (server to server friends)
*/

var debug = require('debug')('antisocial-friends-activity');
var VError = require('verror').VError;
var async = require('async');
var IO = require('socket.io');
var IOAuth = require('socketio-auth');
var cryptography = require('antisocial-encryption');
var moment = require('moment');

module.exports = function activityFeedMount(antisocialApp, expressListener) {
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

	antisocialApp.ioActivity.on('connect', function (soc) {
		debug('got connect', soc.id);
		soc.on('disconnect', function (e) {
			debug('got disconnect %s %s', soc.id, e);
		});
		soc.on('error', function (e) {
			debug('got error %s %s', soc.id, e);
		});
	});

	// friend activity feed
	// authenticate using friendAccessToken
	// then set up model observers and backfill any news since last connected

	IOAuth(antisocialApp.ioActivity, {
		'timeout': 60000,
		'authenticate': function (socket, data, callback) {
			debug('authenticate %s', socket.id);

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
					debug('authenticate error %s', err.message);
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
			debug('postAuthenticate %s', socket.id);

			socket.antisocial = {
				'friend': data.friend,
				'user': data.user,
				'key': data.user.username + '<-' + data.friend.remoteEndPoint,
				'setDataHandler': function setDataHandler(handler) {
					socket.antisocial.dataHandler = handler;
				}
			};

			debug('connection established %s %s', socket.id, socket.antisocial.key);

			antisocialApp.openActivityListeners[socket.antisocial.key] = socket;

			antisocialApp.emit('open-activity-connection', {
				'info': socket.antisocial,
				'socket': socket
			});

			socket.on('highwater', function (highwater) {
				debug('got highwater from %s %s', socket.id, socket.antisocial.key, highwater);
				antisocialApp.emit('activity-backfill', {
					'info': socket.antisocial,
					'socket': socket,
					'highwater': highwater
				});
			});

			socket.on('data', function (data) {
				debug('got data from %s %s', socket.id, socket.antisocial.key);

				var decrypted = cryptography.decrypt(socket.antisocial.friend.remotePublicKey, socket.antisocial.friend.keys.private, data);
				if (!decrypted.valid) { // could not validate signature
					debug('decryption signature validation error:', decrypted.invalidReason);
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

				if (socket.antisocial.dataHandler) {
					socket.antisocial.dataHandler(data);
				}
				else {
					debug('no data handler for %s', socket.antisocial.key);
				}
			});

			socket.on('disconnect', function (reason) {
				debug('got disconnect %s %s %s', socket.id, socket.antisocial.key, reason);
				antisocialApp.emit('close-activity-connection', {
					'info': socket.antisocial,
					'reason': reason
				});
				db.updateInstance('friends', socket.antisocial.friend.id, {
					'online': false
				});
				delete antisocialApp.openActivityListeners[socket.antisocial.key];
			});

			socket.emit('highwater', socket.antisocial.friend.highWater ? socket.antisocial.friend.highWater : moment().subtract(7, 'd').toISOString());

			db.updateInstance('friends', socket.antisocial.friend.id, {
				'online': true
			});
		}
	});
};
