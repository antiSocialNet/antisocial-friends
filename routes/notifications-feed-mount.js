// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

/*
	mount socket.io listener for incoming notifications connections (client)
*/

var debug = require('debug')('antisocial-friends:notifications');
var VError = require('verror').VError;
var IO = require('socket.io');
var IOAuth = require('socketio-auth');

module.exports = function notificationsFeedMount(antisocialApp, expressListener) {
	var config = antisocialApp.config;
	var db = antisocialApp.db;
	var authUserMiddleware = antisocialApp.authUserMiddleware;

	if (!antisocialApp.openNotificationsListeners) {
		antisocialApp.openNotificationsListeners = {};
	}

	antisocialApp.ioNotifications = IO(expressListener, {
		'path': '/antisocial-notifications'
	});

	antisocialApp.ioNotifications.on('connect', function (soc) {
		debug('/antisocial-notifications connect', soc.id);
		soc.on('disconnect', function (e) {
			debug('/antisocial-notifications disconnect %s %s', soc.id, e);
		});
		soc.on('error', function (e) {
			debug('/antisocial-notifications error %s %s', soc.id, e);
		});
	});



	// user notification feed
	// authenticate with access_token cookie
	IOAuth(antisocialApp.ioNotifications, {
		'timeout': 60000,
		'authenticate': function (socket, data, callback) {
			debug('notificationsFeedMount authenticate');

			var cookie = require('cookie');
			var cookieParser = require('cookie-parser');

			if (!socket.handshake.headers.cookie) {
				return callback(null, false);
			}

			var cookies = cookie.parse(socket.handshake.headers.cookie);
			var signedCookies = cookieParser.signedCookies(cookies, config.secureCookiePassword);
			if (!signedCookies.access_token) {
				return callback(null, false);
			}

			var fakeReq = {
				'cookies': signedCookies
			};

			authUserMiddleware(fakeReq, null, function () {
				if (!fakeReq.antisocialUser) {
					return callback(new VError('not logged in'));
				}

				data.currentUser = fakeReq.antisocialUser;
				callback(null, true);
			});
		},
		'postAuthenticate': function (socket, data) {
			socket.antisocial = {
				'user': data.currentUser,
				'key': data.currentUser.username
			};

			debug('notificationsFeedMount connection established %s', socket.antisocial.key);

			antisocialApp.openNotificationsListeners[socket.antisocial.key] = socket;

			socket.antisocial.emitter = function (appId, eventType, data) {
				socket.emit(eventType, {
					'appId': appId,
					'data': data
				});
			};

			antisocialApp.emit('open-notification-connection', socket.antisocial.user, socket.antisocial.emitter, socket.antisocial);

			socket.on('highwater', function (data) {
				debug('got highwater from %s %s', socket.antisocial.key, data);
				var appid = data.appId;
				antisocialApp.emit('notification-backfill-' + appid, socket.antisocial.user, data.highwater, socket.antisocial.emitter);
			});

			socket.on('data', function (message) {
				debug('got data from %s', socket.antisocial.key, message);

				try {
					message = JSON.parse(message);
				}
				catch (e) {
					debug('unable to parse JSON message %j', message);
				}

				var data = message.data;

				if (!message.contentType || message.contentType === 'application/json') {
					try {
						data = JSON.parse(message.data);
					}
					catch (e) {
						debug('unable to parse JSON data');
					}
				}

				var appid = data.appId;
				antisocialApp.emit('notification-data-' + appid, socket.antisocial.user, data.data);
			});

			socket.on('disconnect', function (reason) {
				debug('got disconnect %s %s', socket.antisocial.key, reason);
				antisocialApp.emit('close-notification-connection', socket.antisocial.user, reason, socket.antisocial);
				db.updateInstance('users', socket.antisocial.user.id, {
					'online': false
				});
				delete antisocialApp.openNotificationsListeners[socket.antisocial.key];
			});

			db.updateInstance('users', socket.antisocial.user.id, {
				'online': true
			});
		}
	});
};
