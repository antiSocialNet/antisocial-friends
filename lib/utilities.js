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
