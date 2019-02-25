// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

var uuid = require('uuid');
var async = require('async');
var VError = require('verror').VError;
var WError = require('verror').WError;
var _ = require('lodash');
const errorLog = require('debug')('errors');


module.exports.fixIfBehindProxy = function fixIfBehindProxy(app, url) {
	if (process.env.BEHIND_PROXY === 'true') {
		var rx = new RegExp('^' + app.config.publicHost);
		if (url.match(rx)) {
			url = url.replace(app.config.publicHost, 'http://localhost:' + app.config.port);
		}
	}
	return url;
};

module.exports.refresh = function refresh(app, socket, cb) {
	async.series([
		function (done) {
			if (!_.has(socket, 'antisocial.user')) {
				return async.setImmediate(function () {
					done();
				});
			}
			app.db.getInstances('users', {
				'id': socket.antisocial.user.id
			}, function (err, userInstances) {
				if (err) {
					return done(new VError(err, 'user not found'));
				}

				if (userInstances.length > 1) {
					return done(new VError('more than one user matching id'));
				}

				if (!userInstances.length) {
					return done(new VError('user not found'));
				}

				socket.antisocial.user = userInstances[0];
				done();
			});
		},
		function (done) {
			if (!_.has(socket, 'antisocial.friend')) {
				return async.setImmediate(function () {
					done();
				});
			}
			app.db.getInstances('friends', {
				'id': socket.antisocial.friend.id
			}, function (err, friendInstances) {
				if (err) {
					return done(new VError(err, 'friend not found'));
				}

				if (friendInstances.length > 1) {
					return done(new VError('more than one friend matching id'));
				}

				if (!friendInstances.length) {
					return done(new VError('friend not found'));
				}

				socket.antisocial.friend = friendInstances[0];
				done();
			});
		}
	], function (err) {
		if (err) {
			var e = new WError(err, 'refresh failed');
			errorLog('refresh failed %s', e.cause().message);
			return cb(e);
		}
		cb();
	});
};
