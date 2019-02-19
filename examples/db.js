var events = require('events');
var util = require('util');
var uuid = require('uuid');

// Example database adaptor for persistant storage of users and friends
// adapt these abstract methods to your application data storage scheme

function dbHandler() {
	events.EventEmitter.call(this);

	var self = this;

	self.collections = {
		'users': {},
		'tokens': {},
		'friends': {},
		'invitations': {},
		'blocks': {},
		'posts': {},
		'chats': {},
		'ims': {},
		'imsessions': {}
	};

	// store an item after assigning an unique id
	this.newInstance = function (collectionName, data, cb) {
		data.id = uuid();
		self.collections[collectionName][data.id] = data;
		self.emit('create-' + collectionName, data);
		if (cb) {
			cb(null, data);
		}
		else {
			return data;
		}
	};

	// get an item by matching some property
	this.getInstances = function (collectionName, pairs, cb) {
		var found = [];
		for (var item in self.collections[collectionName]) {
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
		if (!item) {
			if (cb) {
				return cb(new Error('not found'), null);
			}
			console.log('attempt to update a non existant instance %s.%s', collectionName, id);
			return;
		}
		for (var prop in patch) {
			if (patch.hasOwnProperty(prop)) {
				item[prop] = patch[prop];
			}
		}

		self.emit('update-' + collectionName, item);

		if (cb) {
			cb(null, item);
		}
		else {
			return item;
		}
	};

	this.deleteInstance = function (collectionName, id, cb) {
		var item = self.collections[collectionName][id];
		if (!item) {
			cb(new Error('not found'), null);
		}

		self.emit('delete-' + collectionName, item);

		delete self.collections[collectionName][id];
		if (cb) {
			cb(null);
		}
	};
}

util.inherits(dbHandler, events.EventEmitter);

module.exports = dbHandler;
