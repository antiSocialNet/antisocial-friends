module.exports = function (db) {
	db.defineTable('users', {
		'id': {
			type: 'id',
			mySQLOpts: ['NOT NULL', 'PRIMARY KEY']
		},
		'name': {
			type: 'string',
			mySQLOpts: ['NOT NULL']
		},
		'username': {
			type: 'string',
			mySQLOpts: ['NOT NULL', 'UNIQUE KEY']
		},
		'email': {
			type: 'string',
			mySQLOpts: ['NOT NULL', 'UNIQUE KEY']
		},
		'password': {
			type: 'string',
			mySQLOpts: ['NOT NULL']
		},
		'community': {
			type: 'boolean'
		},
		'created': {
			type: 'datetime'
		}
	}, [
		'ENGINE=InnoDB',
		'DEFAULT CHARSET=utf8'
	]);

	db.defineTable('tokens', {
		'id': {
			type: 'id',
			mySQLOpts: ['NOT NULL', 'PRIMARY KEY']
		},
		'userId': {
			type: 'id',
			mySQLOpts: ['NOT NULL']
		},
		'token': {
			type: 'token',
			mySQLOpts: ['NOT NULL', 'UNIQUE KEY']
		},
		'ttl': {
			type: 'string',
			mySQLType: 'int',
			mySQLOpts: ['NOT NULL']
		},
		'created': {
			type: 'datetime'
		},
		'lastaccess': {
			type: 'datetime'
		}
	}, [
		'ENGINE=InnoDB',
		'DEFAULT CHARSET=utf8'
	]);

	db.defineTable('friends', {
		'id': {
			type: 'id',
			mySQLOpts: ['NOT NULL', 'PRIMARY KEY']
		},
		'status': {
			type: 'string',
		},
		'remoteRequestToken': {
			type: 'id',
		},
		'remoteAccessToken': {
			type: 'id',
		},
		'remoteEndPoint': {
			type: 'string',
		},
		'remotePublicKey': {
			type: 'text',
		},
		'remoteUsername': {
			type: 'string',
		},
		'uniqueRemoteUsername': {
			type: 'string',
		},
		'remoteHost': {
			type: 'string',
		},
		'remoteName': {
			type: 'string',
		},
		'localRequestToken': {
			type: 'id',
		},
		'localAccessToken': {
			type: 'id',
		},
		'originator': {
			type: 'boolean',
		},
		'audiences': {
			type: 'array',
			mySQLType: 'TEXT'
		},
		'tags': {
			type: 'array',
			mySQLType: 'TEXT'
		},
		'highWater': {
			type: 'object',
			mySQLType: 'TEXT'
		},
		'keypair': {
			type: 'object',
			mySQLType: 'TEXT'
		},
		'online': {
			type: 'boolean',
			mySQLType: 'CHAR(1) DEFAULT NULL'
		},
		'hash': {
			type: 'string',
			mySQLType: 'VARCHAR(36)'
		},
		'inviteToken': {
			type: 'id',
		},
		'community': {
			type: 'boolean',
			mySQLType: 'CHAR(1)'
		},
		'userId': {
			type: 'id',
		}
	}, [
		'ENGINE=InnoDB',
		'DEFAULT CHARSET=utf8'
	]);

	db.defineTable('invitations', {
		'id': {
			type: 'string',
			mySQLOpts: ['NOT NULL', 'PRIMARY KEY']
		},
		'status': {
			type: 'string'
		},
		'type': {
			type: 'string',
			required: true
		},
		'email': {
			type: 'string',
			required: true
		},
		'note': {
			type: 'text'
		},
		'token': {
			type: 'string'
		},
		'userId': {
			type: 'string',
			mySQLType: 'VARCHAR(36)'
		}
	}, [
		'ENGINE=InnoDB',
		'DEFAULT CHARSET=utf8'
	]);

	db.defineTable('blocks', {
		'id': {
			type: 'id',
			mySQLOpts: ['NOT NULL', 'PRIMARY KEY']
		},
		'remoteEndPoint': {
			type: 'string',
		},
		'status': {
			endpoint: 'string'
		},
		'userId': {
			type: 'string',
			mySQLType: 'VARCHAR(36)'
		}
	}, ['ENGINE=InnoDB',
		'DEFAULT CHARSET=utf8'
	]);

	console.log(db.getCreateTable('users'));
	console.log(db.getCreateTable('tokens'));
	console.log(db.getCreateTable('friends'));
	console.log(db.getCreateTable('invitations'));
	console.log(db.getCreateTable('blocks'));
}
