/*
	Example middleware adaptor to get the logged in user.
	exposes the current user on req.antisocialUser
	normally this would use a cookie via some sort of token
	to find the user in this case we use the 'token' property
	in the users collection
*/

var debug = require('debug')('antisocial-user');


module.exports = function (db) {

	function validToken(token) {
		var now = Date.now();
		var accessed = new Date(token.lastaccess).getTime();
		var elapsedSeconds = (now - accessed) / 1000;
		debug('validToken elapsed: %s ttl: %s', elapsedSeconds, token.ttl);
		return elapsedSeconds < token.ttl;
	}

	function touchToken(token, cb) {
		debug('touchToken');
		var now = Date.now();
		var accessed = new Date(token.lastaccess).getTime();
		var elapsedSeconds = (now - accessed) / 1000;

		if (elapsedSeconds < 3600) {
			return setImmediate(cb);
		}

		db.updateInstance('tokens', token.id, {
			'lastaccess': new Date().toISOString()
		}, cb);
	}

	return function getAuthenticatedUser(req, res, next) {
		var token;

		if (req.cookies && req.cookies['access-token']) {
			token = req.cookies['access-token'];
		}

		if (req.signedCookies && req.signedCookies['access-token']) {
			token = req.signedCookies['access-token'];
		}

		if (req.body && req.body['access-token']) {
			token = req.body['access-token'];
		}

		if (!token) {
			return next();
		}

		db.getInstances('tokens', [{
			'property': 'token',
			'value': token
		}], function (err, tokenInstances) {
			if (err) {
				return next();
			}
			if (!tokenInstances || tokenInstances.length !== 1) {
				return next();
			}

			if (!validToken(tokenInstances[0])) {
				db.deleteInstance('tokens', req.antisocialToken.id, function (err) {
					next();
				});
			}
			else {
				touchToken(token, function (err) {
					db.getInstances('users', [{
						'property': 'id',
						'value': tokenInstances[0].userId
					}], function (err, userInstances) {
						if (err) {
							return next();
						}
						if (!userInstances || userInstances.length !== 1) {
							return next();
						}
						req.antisocialToken = tokenInstances[0];
						req.antisocialUser = userInstances[0];
						next();
					});
				})
			}
		});
	};
};
