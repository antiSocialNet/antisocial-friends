// Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
// This file is licensed under the MIT License.
// License text available at https://opensource.org/licenses/MIT

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
