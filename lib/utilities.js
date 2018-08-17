var uuid = require('uuid');

module.exports.fixIfBehindProxy = function fixIfBehindProxy(url) {
	if (process.env.BEHIND_PROXY === "true") {
		var rx = new RegExp('^' + config.publicHost);
		if (url.match(rx)) {
			url = url.replace(config.publicHost, 'http://localhost:' + config.port);
			debug('bypass proxy ' + url);
		}
	}
	return url;
}

/*
	Example middleware adaptor to get the logged in user.
	exposes the current user on req.antisocialUser
	normally this would use a cookie via some sort of token
	to find the user in this case we use the 'token' property
	in the users collection
*/
module.exports.authenticatedUserMiddleware = function (db) {
	return function getAuthenticatedUser(req, res, next) {
		var token = req.cookies.access_token;
		db.getInstances('users', [{
			'property': 'token',
			'value': token
		}], function (err, userInstances) {
			req.antisocialUser = userInstances[0];
			next();
		});
	}
}

// Example database adaptor for persistant storage of users and friends
// adapt these abstract methods to your application
// data storage scheme

function dbHandler() {
	var self = this;

	self.collections = {
		'users': {},
		'friends': {},
		'invitations': {},
		'blocks': {}
	};

	// store an item after assigning an unique id
	this.newInstance = function (collectionName, data, cb) {
		data.id = uuid();
		self.collections[collectionName][data.id] = data;
		if (cb) {
			cb(null, data);
		}
		else {
			return data;
		}
	};

	// get an item by matching some property
	this.getInstances = function (collectionName, pairs, cb) {
		var found = []
		for (item in self.collections[collectionName]) {
			if (self.collections[collectionName].hasOwnProperty(item)) {
				var instance = self.collections[collectionName][item];

				var match = 0;
				for (var i = 0; i < pairs.length; i++) {
					var prop = pairs[i].property;
					var value = pairs[i].value;
					if (instance[prop] === value) {
						++match;
					}
				}

				if (match == pairs.length) {
					found.push(instance);
				}
			}
		}
		if (cb) {
			cb(null, found);
		}
		else {
			return found;
		}
	};

	// update item properties by id
	this.updateInstance = function (collectionName, id, patch, cb) {
		var item = self.collections[collectionName][id];
		for (var prop in patch) {
			if (patch.hasOwnProperty(prop)) {
				item[prop] = patch[prop];
			}
		}
		if (cb) {
			cb(null, item);
		}
		else {
			return item;
		}
	};

	this.deleteInstance = function (collectionName, id, cb) {
		delete self.collections[collectionName][id];
		if (cb) {
			cb(null);
		}
	};
}

module.exports.memoryDB = new dbHandler();
