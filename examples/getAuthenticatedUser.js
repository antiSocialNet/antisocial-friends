/*
	Example middleware adaptor to get the logged in user.
	exposes the current user on req.antisocialUser
	normally this would use a cookie via some sort of token
	to find the user in this case we use the 'token' property
	in the users collection
*/

var debug = require('debug')('antisocial-user');

module.exports = function (db) {

	// is the token valid?
	function validToken(token) {
		var now = Date.now();
		var accessed = new Date(token.lastaccess).getTime();
		var elapsedSeconds = (now - accessed) / 1000;
		debug('validToken elapsed: %s ttl: %s', elapsedSeconds, token.ttl);
		return elapsedSeconds < token.ttl;
	}

	// update lastaccess for rolling ttl
	function touchToken(token, cb) {
		debug('touchToken %j', token);
		var now = Date.now();
		var accessed = new Date(token.lastaccess).getTime();
		var elapsedSeconds = (now - accessed) / 1000;

		// only update once an hr.
		if (elapsedSeconds < 3600) {
			return setImmediate(cb);
		}

		db.updateInstance('tokens', token.id, {
			'lastaccess': new Date()
		}, cb);
	}

	// get token from headers or cookies and resolve the logged in user
	// if found set req.antisocialToken and req.antisocialUser for later use
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
			debug('getAuthenticatedUser no token in headers or cookies');
			return next();
		}

		debug('getAuthenticatedUser found token in header or cookies', token);

		db.getInstances('tokens', [{
			'property': 'token',
			'value': token
		}], function (err, tokenInstances) {
			if (err) {
				debug('getAuthenticatedUser error finding token', err.message);
				return next();
			}
			if (!tokenInstances || tokenInstances.length !== 1) {
				debug('getAuthenticatedUser token not found', tokenInstances);
				return next();
			}

			debug('token: %j', tokenInstances[0]);

			if (!validToken(tokenInstances[0])) {
				db.deleteInstance('tokens', req.antisocialToken.id, function (err) {
					next();
				});
			}
			else {
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

					// update lastaccess
					touchToken(tokenInstances[0], function (err) {
						next();
					});
				});
			}
		});
	};
};
