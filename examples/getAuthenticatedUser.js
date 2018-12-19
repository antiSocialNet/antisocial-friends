/*
	Example middleware adaptor to get the logged in user.
	exposes the current user on req.antisocialUser
	normally this would use a cookie via some sort of token
	to find the user in this case we use the 'token' property
	in the users collection
*/

module.exports = function (db) {
	return function getAuthenticatedUser(req, res, next) {
		var token;

		if (req.cookies && req.cookies.access_token) {
			token = req.cookies.access_token;
		}

		if (req.body && req.body.access_token) {
			token = req.body.access_token;
		}

		if (!token) {
			return next();
		}

		db.getInstances('users', [{
			'property': 'token',
			'value': token
		}], function (err, userInstances) {
			req.antisocialUser = userInstances[0];
			next();
		});
	};
};
