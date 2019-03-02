<img src="https://github.com/antiSocialNet/antiSocial/raw/master/assets/octocloud/logo.jpg" height="200">

# antiSocial

Building blocks for myAntiSocial.net

## antisocial-friends protocol overview

This module mounts routes for any expressjs application wishing to support building and maintaining antisocial 'friend' relationships whether on the same server/application and/or across distributed servers and applications. The protocol generates key pairs unique to the friend relationship and exchanges public keypair for later use in exchanging user to user encrypted messages over socket.io connections.

Once a friend request is accepted, each side of the friend relationship can transmit activity messages using the 'emitter' function that is handed to the application in the `open-activity-connection` event.

```
antisocialApp.on('open-activity-connection', function (user, friend, emitter, info) {}
```

The emitter is a private channel for transmitting message from the user to the friend. The emitter takes an `appId` parameter which is an identifier for the class of message (eg. IM, Post, Photo etc.) Your app should subscribe to data events for each appId you need to handle. The message is user to user encrypted for transmission over the internet using the keypair that were exchanged in the friend protocol.
```
emitter('myappid','data',{'hello':'world'});
```

Each side sets up data handlers to listen for messages from the friend.
```
antisocialApp.on('activity-data-myappid', function (user, friend, message) {
  // handle the message here
}
```
* `user` is the recipient of the message
* `friend` is the originator of the message
* `message` contains the JSON message `{'hello':'world'}`

The appId is expected to be globally unique so the convention should be something like `mydomain-myapid`.

The antisocial app uses
* `myantisocialnet-post` for posts/reactions/comments
* `myantisocialnet-photo` for photos
* `myantisocialnet-im` for instant message

## Initialization
```
var app = express();

var antisocial = require('antisocial-friends');
var antisocialApp = antisocial(app, config, dbAdaptor, getAuthenticatedUser);

// set up event handlers here (see below)

// start http and socket.io listeners
var http = require('http');
server = http.createServer(app);
var listener = server.listen(port);
antisocialApp.listen( httpListener );
```

### Parameters:

**app** is the express application

**config** is a javascript object with the following properties

```
var config = {
  'APIPrefix': '/antisocial', // where to mount the routes
  'publicHost': 'http://127.0.0.1:3000', // public protocol and host
  'port': 3000 // port this service is listening on (only used if behind a load balancer or reverse proxy)
}
```

**dbAdaptor** is an abstract data store that will be called when the app needs to
store or retrieve data from the database. For a simple example implementation
see app.js for a simple memory store implementation of the methods and a loopback
application adaptor below. Yours should implement the required methods to work
within your environment (mysql, mongo etc.)

**getAuthenticatedUser** is an express middleware function that gets the current
logged in user and exposes it on req.antisocialUser. This is application specific but typically would be a token cookie that can be used to look up a user. See simple example in app.js

**listener** is an express http(s) listener for setting up socket.io listeners

This function returns an **antisocialApp** object which an EventEmitter.

## User Endpoints Mounted by this module

Endpoints are URLS that function as the base address of a user on an antisocial aware server.

'https://some.antisocial.server/api-prefix/local-username'

The URL form of the endpoints conform to the following conventions:

`api-prefix` is the location where antisocial-friends is mounted defined in config

`local-username` is a unique username for the local user

### Creating friend requests

#### Make a friend request
```
GET /api-prefix/local-username/request-friend
  Query params:
    endpoint: endpoint url of friend to connect with
    invite: an invite token if this is in response to an invitation from the user
```

#### Cancel a pending friend request
```
POST /api-prefix/local-username/request-friend-cancel
  Request Body: (application/x-www-form-urlencoded)
    endpoint: endpoint of the pending request
```

### Responding to friend requests

#### accept a pending friend request
```
/api-prefix/local-username/friend-request-accept
  Request Body: (application/x-www-form-urlencoded)
    endpoint: endpoint of the pending request
```

#### decline a pending friend request
```
/api-prefix/local-username/friend-request-decline
  Request Body: (application/x-www-form-urlencoded)
    endpoint: endpoint of the pending request
```

### Updating accepted friend status or info
Either side can update or delete the relationship once accepted
```
POST /api-prefix/local-username/friend-update
  Request Body: (application/x-www-form-urlencoded)
    endpoint: endpoint of the friend
    status: 'delete'|'block'
    audiences: array of audiences for the friend eg. ["public","friends","some custom audience"]
```

## socket.io feeds

Accepted friends establish full duplex socket.io connections to update each other about activity. Posts, photos, IM etc are sent to the friend or groups of friends in audiences. The details of the messages are application specific but the mechanism for sending and responding to messages is driven by `data` and `backfill` events received by the application.

## Events
The application should handle the following events as needed.

### new-friend-request: a new friend request received
Relevant details are in user (a user instance) and friend (a friend instance). This event would typically be used to notify the user of the pending friend request.
```
antisocialApp.on('new-friend-request', function (user, friend) {
  console.log('antisocial new-friend-request %s %j', user.username, friend.remoteEndPoint);
});
```

### new-friend: a new friend relationship has been accepted
Both the requestor and the requestee recieve this event. Relevant details are in user (a user instance) and friend (a friend instance). This event would typically be used to notify the user that their requests has been approved and perhaps notify the user's friends that they have a new friend.
```
antisocialApp.on('new-friend', function (user, friend) {
  console.log('antisocial new-friend %s %j', user.username, friend.remoteEndPoint);
});
```

### friend-updated: the relationship has changed
Relevant details are in user (a user instance) and friend (a friend instance). The friend might have changed the audiences for the user. Typically the user would remove any cache of activity originating with the friend and re-load by requesting emitting an highwater event to refresh the cache.
```
antisocialApp.on('friend-updated', function (user, friend) {
  console.log('antisocial friend-updated %s %s', user.username, friend.remoteEndPoint);
});
```

### friend-deleted: either user or the friend has deleted the other
Typically user would clean up the database and remove any activity about or by the friend.
```
antisocialApp.on('friend-deleted', function (user, friend) {
  console.log('antisocial friend-deleted %s %s', user.username, friend.remoteEndPoint);
});
```

## activity events
Used to notify friends about user activity. Eg. created a post, has a new friend, posted a photo.

### open-activity-connection: a friend activity feed has been connected.
Typically would hook up any process that would create activity messages to be transmitted to friends. Could also be used to send a 'highwater' event to the friend to request activity since last logged in.
```
antisocialApp.on('open-activity-connection', function (user, friend, emitter, info) {
  console.log('antisocial open-activity-connection %s<-%s', user.username, friend.remoteEndPoint);
  emitter('post', 'highwater', highwater);
});
```

### user can send data to a friend using emitter function specifying an appId
The appId indicates the class or type of message we are sending (eg. post, reply, photo, IM)

Parameters:
  `appId` is used to direct messages to the appropriate listeners (see activity-data-xxx event)
  `eventType` 'data' or 'highwater'
  `message object` JSON object to transmit

```
emitter(appId, eventType, {application specific message});
```

### activity-data-xxx event: xxx is the appId defined in the emitter call
Friend has sent user a message. Application would typically keep track of highwater mark of last message seen so the user can request a backfill from the friend of activity since the user was last connected.
```
antisocialApp.on('activity-data-appId', function (user, friend, data) {
  console.log('antisocial activity-data-post user: %s friend: %s data: %j', user.name, friend.remoteEndPoint, data);
});
```

### activity-backfill-xxx event: xxx is the appId
Typically would send any activity that has happened since the last message received by the friend (highwater). This could be a timestamp or a record number, it's up to the application to define this behavior

```
antisocialApp.on('activity-backfill-appId', function (user, friend, highwater, emitter) {
  console.log('antisocial activity-backfill-post user: %s friend: %s highwater: %s', user.name, friend.remoteEndPoint, highwater);

  // send posts from requested highwater to end of posts
  // the emitter arguments:
  //   'appId': the id of the data event that will handle the message
  //   'eventType': 'data'
  //   'message': json object to transmit
  emitter('appId', 'data', {application specific message});
});
```

### close-activity-connection: activity feed closed.
Typically used to clean up any event handlers set up in open-activity-connection.
```
antisocialApp.on('close-activity-connection', function (user, friend, reason, info) {
  console.log('antisocial close-activity-connection %s<-%s %s', user.username, friend.remoteEndpoint, reason);
});
```

## Notification events
Used by the client applications (webapp, native app) to receive notifications in real time about friend activity that has been seen by friend activity event handlers.

### open-notification-connection: The user has opened the notification feed.
A user has subscribed to notifications using browser or app.
```
antisocialApp.on('open-notification-connection', function (user, emitter, info) {
  console.log('antisocial open-notification-connection %s', user.username);
});
```

### notification-data:
User has sent server a message.
```
antisocialApp.on('notification-data', function (user, friend, data) {
  console.log('antisocial notification-data user: %s friend: %s data: %j', user.name, friend.remoteEndPoint, data);
});
```

### notification-backfill-xxx: xxx is the appId defined in the emit
Typically would send any notifications that has happened since the last notification was received by the user (highwater). This could be a timestamp or a record number, it's up to the application to define this behavior.

```
antisocialApp.on('notification-backfill-appId', function (user, highwater, emitter) {
  console.log('antisocial notification-backfill-post user: %s highwater: %s', user.name, highwater);

  // send data events that have occurred since the requested highwater
  emitter('appId', 'data', {application specific message});
});
```

### close-notification-connection:
```
antisocialApp.on('close-notification-connection', function (user, reason, info) {
  console.log('antisocial close-notification-connection %s %s', user.username, reason);
});
```

## The data structures maintained by these protocols
This app uses the following data collections:

* users: username property is required to build urls
* friends: several properties maintained by the antisocial protocol
* invitations: use to simplify "be my friend" invitations
* blocks: list of blocked friends

friends, invitations and blocks are related to users by a foreign key `userId`
which is set to the id of the appropriate user when created.

The schema definition is implementation specific and up to the implementor.
The following is an example db adaptor for a Loopback.io application. dbHandlers
must support all the methods in this example.

In memory example
[examples/db.js](https://github.com/antiSocialNet/antisocial-friends/blob/master/examples/db.js)

MySQL example
[examples/db-mysql.js](https://github.com/antiSocialNet/antisocial-friends/blob/master/examples/db-mysql.js)

### User properties
The user is application specific but we expect the following properties
```
{
  "name": "user one",
  "username": "user-one",
  "id": "c5503436-634c-461f-9d90-ba9e438516c1"
}
```

### Friend Invitation properties
```
{
  "token": "testinvite",
  "userId": "53757323-8555-4ef5-b66c-a58351ce6181",
  "id": "6165e25e-2c31-47d3-a8c2-7c75737d4003"
}
```
### Block list properties
```
{
  "remoteEndPoint": "http://127.0.0.1:3000/antisocial/user-three",
  "userId": "53757323-8555-4ef5-b66c-a58351ce6181",
  "id": "7281bcd3-94f8-4906-9714-89d7e5b5c349"
}
```

### Friend Properties
The result of a friend request and a friend accept is 2 friends records, one owned by the requestor and one by the requestee (who could be on different servers). The requestor's is marked as 'originator'. The structure contains exchanged key pairs that can be used to communicate securely.

```
[
  {
    "originator": true,
    "status": "accepted",
    "remoteEndPoint": "http://127.0.0.1:3000/antisocial/user-two",
    "remoteHost": "http://127.0.0.1:3000",
    "localRequestToken": "cbf875ad-5eb7-43e4-8028-415ddf6d95a9",
    "localAccessToken": "fbb8d3be-b199-45a6-b46e-3bcbbfedd0aa",
    "keypair": {
      "public": "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3BotZWYZu/rtFqTOHpdzM9+b2m7c\r\n7I2CtkZrnJ5zPQzmXDg9gLWqImAFrqcR3Ee3LMLniuKsFSYz2I/ERmXiXzv2e8wr14AeuXOV\r\nFzqcsDypKrbtT88lZLor6bt0kQOP7pFcesOedocoU9/DpnRkOYeI9MHsZN1pyZVvzLfkHvdL\r\n08ktiWwjNoFV8EL2h13sVZIFt/GaoPrv/SeWzb9oyAGAcp671smBsExCsafgwXAKYBQHIzrI\r\nScxNBzP2d9/z1ZKQ/dtXbGvWheZ0Ci1G6ngYSdx8APBIRFK+hhRdnhhpbat5juWoMs2dTG8q\r\nWIu45ntjfg7BHLRLExRE6un5lwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
      "private": "-----BEGIN RSA PRIVATE KEY-----\r\nMIIEowIBAAKCAQEA3BotZWYZu/rtFqTOHpdzM9+b2m7c7I2CtkZrnJ5zPQzmXDg9gLWqImAF\r\nrqcR3Ee3LMLniuKsFSYz2I/ERmXiXzv2e8wr14AeuXOVFzqcsDypKrbtT88lZLor6bt0kQOP\r\n7pFcesOedocoU9/DpnRkOYeI9MHsZN1pyZVvzLfkHvdL08ktiWwjNoFV8EL2h13sVZIFt/Ga\r\noPrv/SeWzb9oyAGAcp671smBsExCsafgwXAKYBQHIzrIScxNBzP2d9/z1ZKQ/dtXbGvWheZ0\r\nCi1G6ngYSdx8APBIRFK+hhRdnhhpbat5juWoMs2dTG8qWIu45ntjfg7BHLRLExRE6un5lwID\r\nAQABAoIBAEUvFUXiKgSkgxGzC/chs9yCVQL8BgV1FbkluX2pcJ+oBmDGbM6gS7IybJbRfRO4\r\nlyNCwHUvetfLAlD4H8HhFJ7Kwld3ffBnHUE9y4dZrRbYenQqu71yZ1aaDmORwLo0XHGoz2Dn\r\nTFAFe++hTmZr/3T13V7R9fRehHoQtuuqgdIZZAoshX90JpIhJ9Px6F1scgWgmBRH3XcsCbxb\r\nOMjABrVFINv5YUANRwUAwC2DYUBEuptRnEtm4X3++Afg97hK2brR9ofgpw44ej7JhovHeZti\r\n1Xm0AhqP/T6GQa55MS0rPryq5bbIjr/SBqJr4VkAmJJMx+P8KOa8gfBPefj9cgECgYEA+4Bz\r\ntT86OY/Pa+QJTSXZsskCqVlCQbj1V3CAt5dwXXir9NEwlE6yrc2jReqq07bDdqeadQUEwTaZ\r\nyioXxFozRNhs0rQPBoKLB0HuFqOm8GULcB0m3ScWJec5Rz9TCQQrMdUDQaZTLCXQs9izcVmd\r\nhBT1SLLZ3zjJt7hKVwafkqECgYEA4An08IkbEjwfcq7zOHNzh5Dm4G9jRW62vx5WFL+xktl6\r\nDg14IXMH7TVg2Gl96U40JZDBQW2bLH6pcGLp5UAj9ZqtoVW9BN+LZ3uY25hCEhYfAE0zVhhc\r\nE0VLkdyKp7wSQFicqAfPjryMsFTIgCrywo1BxxMibe773ai26YL32TcCgYEA2MOkdrGxGE2X\r\no9DeJ20ZDdvr/FPfJFAqvRtNBW9zvEw2QQJPkXOm0t/q+mbAp0rdexYHrRYPPAw4TqMq6uQn\r\nTg4O9SeVz7GR7EZp039ncchVLGMjzPZUQ4TfvEWa5ql+JSwH63xUMTfCgk+ikW6AsYdyxR7J\r\nY3hJe5xODmW6ASECgYBpPuQs9wublljjpCIn+7xjDAQZnNoSrP72a0be+mpt5PI8lcFAXWx0\r\n16WGJJB8wDspBoZyuQ2zalEotZ7RDj+WSjKU3tUr6+PuGhbl2fH30yJ/HsUmBc2DVAM7I1KT\r\nl3svdTEqknjDwfmJgFqsMwDVukwTO/7pi+IP8Aj1S4wpIwKBgDJwDd0eNPhMRf1wi+rfTefL\r\nb1lo/sSw0/vgyH2GKLnY+svw7p2k2GoPvbT7AEkUFDxh3HYbdKPx2hUO0rbkM94FyA8eSUU4\r\n+osMYDv8bIMwve7dfmRKl7vN2TWhkFhjREwPdFf6xbCV91BstV/qcCrOJJiXYmCrQODZ2qHJ\r\nvvOf\r\n-----END RSA PRIVATE KEY-----\r\n"
    },
    "audiences": ["public", "friends"],
    "hash": "f08bf78",
    "userId": "7ca18fd6-5d23-4930-8b64-3812f3a8f012",
    "inviteToken": "testinvite",
    "id": "97c46a56-c323-4941-bf61-e2c959748617",
    "remoteAccessToken": "aabaa39b-cb60-4f29-948f-8483bc29f21c",
    "remotePublicKey": "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAihLKPC8s1fIi4IR33n8iGA+VInab\r\niN0PzqiI7iPPJlfApwPIrxIVD+SvQXlMOOQNsh8sOADaiIH4w8FvG+3WvFrD/fkOcYl7Uk1t\r\nO5iMxC0McYU0b1zfplivqP9obaSkAWJkv3M2IRIpqJHuCJV/Gx3THFBdgTSqtSqrIJSG3Kjr\r\nNi7xHQPimi5LL9CZJFNbNmGyDly2WIWQM1k6EMgrIn6hR9OaElyAjx88YhJwFIDRS+dGNC2+\r\nu4rcK5YdLuezZGff84rPFWyZueMmEK16xb1P3fhDwFTU2KtmqCs47p7eaz2Mlw1ek1E9nlP+\r\nkmPuhWGF9pIUVbEg9co4IFgnFwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    "remoteName": "user two",
    "remoteUsername": "user-two",
    "uniqueRemoteUsername": "user-two"
  },
  {
    "status": "accepted",
    "remoteRequestToken": "cbf875ad-5eb7-43e4-8028-415ddf6d95a9",
    "remoteEndPoint": "http://127.0.0.1:3000/antisocial/user-one",
    "remoteHost": "http://127.0.0.1:3000",
    "localRequestToken": "97e2a0b7-7a0d-46cb-8be6-4253b842067a",
    "localAccessToken": "aabaa39b-cb60-4f29-948f-8483bc29f21c",
    "keypair": {
      "public": "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAihLKPC8s1fIi4IR33n8iGA+VInab\r\niN0PzqiI7iPPJlfApwPIrxIVD+SvQXlMOOQNsh8sOADaiIH4w8FvG+3WvFrD/fkOcYl7Uk1t\r\nO5iMxC0McYU0b1zfplivqP9obaSkAWJkv3M2IRIpqJHuCJV/Gx3THFBdgTSqtSqrIJSG3Kjr\r\nNi7xHQPimi5LL9CZJFNbNmGyDly2WIWQM1k6EMgrIn6hR9OaElyAjx88YhJwFIDRS+dGNC2+\r\nu4rcK5YdLuezZGff84rPFWyZueMmEK16xb1P3fhDwFTU2KtmqCs47p7eaz2Mlw1ek1E9nlP+\r\nkmPuhWGF9pIUVbEg9co4IFgnFwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
      "private": "-----BEGIN RSA PRIVATE KEY-----\r\nMIIEowIBAAKCAQEAihLKPC8s1fIi4IR33n8iGA+VInabiN0PzqiI7iPPJlfApwPIrxIVD+Sv\r\nQXlMOOQNsh8sOADaiIH4w8FvG+3WvFrD/fkOcYl7Uk1tO5iMxC0McYU0b1zfplivqP9obaSk\r\nAWJkv3M2IRIpqJHuCJV/Gx3THFBdgTSqtSqrIJSG3KjrNi7xHQPimi5LL9CZJFNbNmGyDly2\r\nWIWQM1k6EMgrIn6hR9OaElyAjx88YhJwFIDRS+dGNC2+u4rcK5YdLuezZGff84rPFWyZueMm\r\nEK16xb1P3fhDwFTU2KtmqCs47p7eaz2Mlw1ek1E9nlP+kmPuhWGF9pIUVbEg9co4IFgnFwID\r\nAQABAoIBAD9wortEcbVbq+q88taoU2H6xusu1AfuinTJuyCwE13qs/oJIwxNop/K0zuiIAOD\r\nxUcyS37v5XkTPtmy5vpOLXwduC/ZX2mLYb5PFQFs9kCs8iq2qYEBi0FDPnLH55N5MmHwc5oD\r\ntbs8PSfW5SfMiLpM2dMIme3j5QuYr0go9k4sHcravEZWewc89ARRgvC5KnZ3Xo5bOBgq4C2W\r\nSEZF+5LzwG1pcNoNil5JFUXWmV9Kxzrv0N7KaaACxzkiACNL07viW/u5uZo2/f49OZ9gq2qk\r\nd5M5pwGC/uI3J5c7ipDq+Hlf1nzpn6AxwpRraUeLziF5+RG/3dgrNiCeQ6Ll3AECgYEA6yKZ\r\n/Tsj9TZXQeg/mQJ6PlYRqMqdnk6+rRu+37D0B7IfcE0nXKAH+sjWR66qwKm21MEj03pvr9+5\r\nHbE6YuKjq7B0UHBrGf0hyXxd3xMyaLbAmzunHUnmVcMAnavA0pTnubg7DsrL40TNHGiWZcoS\r\ntKd7zb4qnJ0bvHRuUA4u4qcCgYEAllNOKKauIV8C4HYKRgfDqWTJMTUbzva1RNKVRS8CpLkm\r\ntkY4Fskgy5dTq++zDNELfs5O6PGNj7jkLpkFi3XJrvLhIVkLH0wc5y8kfw/Btkf7mTo/PnG4\r\nw1M8P7/+YVj8+wnb/1JgQLt19aEU8dqjM38nmjHvXE/EVfxsvM4RVhECgYEApa+IGqxlthBI\r\nhCSHS+Y3BV3Yq7u6PSb3rTtz0GP8UL/u708ugVIyzUBf3bryjzgHoPtHp2kK8j8PTiDoJ23U\r\nLtLz4wqULYf1GukLrHj2eFrudXQfWcANEjmKYY/5G2nZr0BmPRIhgU+lyHLaJ3ewnqO11VA+\r\n7oS2WqEgakDUQNkCgYBGXO/0rzBKhoJ+NkJQzUmUfIx/7+/4TBpFAJzGKV7/Y3rvTqbqY3Jq\r\nWYbcr/ILSb4ruL3O42HzqAOGnDGwOY4RybX/OgKuv523yKU4pFNz0vW9nzoDLI/jPY6x+FhF\r\nkLW5e7/yHsjXA+gO9Tssib5iWF5dGoqDlwK7jNAJABu1QQKBgAOVsey9v/+GxLprhVuVIMjb\r\n+2fhh0fUfEtx9G1DplhW88AwAFHTSRfffT7VqJBSqcYHajnXDKz9mn3pC1ASyO0QnZxAy0YR\r\nyT7gsd4gOgUuk7IqOCLPNXg4TlTOTV9wsJyNQ6s+EbZqyIAhUzhr4ESEZ/qQLVpMKZ4eLDrp\r\ndx2J\r\n-----END RSA PRIVATE KEY-----\r\n"
    },
    "audiences": ["public", "friends"],
    "hash": "64aeb3ef",
    "userId": "700acf91-4ee1-4aba-8e18-136e0cc33560",
    "inviteToken": "testinvite",
    "id": "771cec97-d8ab-4ae9-b3d4-7c29521a4732",
    "remoteAccessToken": "fbb8d3be-b199-45a6-b46e-3bcbbfedd0aa",
    "remotePublicKey": "-----BEGIN PUBLIC KEY-----\r\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA3BotZWYZu/rtFqTOHpdzM9+b2m7c\r\n7I2CtkZrnJ5zPQzmXDg9gLWqImAFrqcR3Ee3LMLniuKsFSYz2I/ERmXiXzv2e8wr14AeuXOV\r\nFzqcsDypKrbtT88lZLor6bt0kQOP7pFcesOedocoU9/DpnRkOYeI9MHsZN1pyZVvzLfkHvdL\r\n08ktiWwjNoFV8EL2h13sVZIFt/GaoPrv/SeWzb9oyAGAcp671smBsExCsafgwXAKYBQHIzrI\r\nScxNBzP2d9/z1ZKQ/dtXbGvWheZ0Ci1G6ngYSdx8APBIRFK+hhRdnhhpbat5juWoMs2dTG8q\r\nWIu45ntjfg7BHLRLExRE6un5lwIDAQAB\r\n-----END PUBLIC KEY-----\r\n",
    "remoteName": "user one",
    "remoteUsername": "user-one",
    "uniqueRemoteUsername": "user-one"
  }
]
```

## AntiSocial Friend Protocol

protocol for making a friend request
------------------------------------
```
requester sets up pending Friend data on requester's server (/request-friend)
  requester calls requestee with a requestToken
    requestee sets up pending Friend data on requestee's server (/friend-request)
    requestee calls requester to exchange the requestToken for an accessToken and publicKey (/friend-exchange-token)
    requestee returns requestToken to requester
    requestee triggers 'new-friend-request' event for requestee application
  requester calls requestee to exchange requestToken for accessToken and publicKey (/friend-exchange-token)
```

protocol for accepting a friend request
---------------------------------------
```
requestee marks requester as accepted and grants access to 'public' and 'friends' (/friend-request-accept)
  requestee calls requester to update status (/friend-webhook action=friend-request-accepted)
    requester marks requestee as accepted and grants access to 'public' and 'friends'
    trigger a 'new-friend' event for requestor application
  trigger a 'new-friend' event for requestee application
```

At the end of this protocol both users will have a Friend record holding the accessToken and the public key of the friend. With these credentials they can exchange signed encrypted messages for notifying each other of activity in their accounts.

`accessToken` is a uuid that is used to authenticate connection requests, `requestToken` is a uuid which is used to retrieve an accessToken


### Friend Request
---

Use case: Michael wants to friend Alan and already knows the address of Alan's server antisocial endpoint.
`http://emtage.com/antisocial/ae`

Michael logs on to his account on his server.

Michael enters Alan's address on the friend request form.

Alan's public profile information is displayed to confirm that the address is correct.

Michael clicks the 'add friend' button which starts the friend request protocol.

### FRIEND REQUEST
---

1. Michael's server creates a 'Friend' record in his database marking it as 'pending' and setting the flag 'originator' to indicate that Michael is making the request. This record has a unique 'requestToken', 'accessToken' and an RSA key pair. These credentials will be exchanged with Alan's server.
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

GET --------------------->
http://rhodes.com/antisocial/mr/request-friend?endpoint=http://emtage.com/antisocial/ae
```

2. Michael's server sends a POST request to Alan's server to initiate the friend request.
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          POST -------------------->
                          http://emtage.com/antisocial/ae/friend-request
                          BODY {
                            'remoteEndPoint': 'http://rhodes.com/antisocial/mr',
                            'requestToken': Michaels Request Token
                          }
```
3. Alans's server connects to Michael's server to validate the origin of the request and to exchange Michael's requestToken for an accessToken.
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          <------------------------ POST
                                                    http://rhodes.com/antisocial/mr/friend-exchange
                                                    BODY {
                                                      'endpoint': 'http://emtage.com/antisocial/ae',
                                                      'requestToken': Michaels Request Token
                                                    }
```
4. Michael's server looks up the friend record and returns access credentials to Alan's server
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          RESPONSE ---------------->
                          {
                            'status': 'ok',
                            'accessToken': Michael's Access Token,
                            'publicKey': Michael's public key
                          }
```
5. Alan's server creates a 'Friend' record in his database marking it as 'pending' saving Michael's accessToken and the publicKey and notifies Alan of the pending request. Alan's server returns his requestToken to Michael's server so Micael's server can complete the exchange of credentials.
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          <------------------------ RESPONSE
                                                    {
                                                     'status': 'ok',
                                                     'requestToken': Alan's RequestToken
                                                    }
```
6. Michael's server connects to Alan's server to exchange Alan's request token for an accessToken
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          POST ------------------->
                          http://emtage.com/antisocial/ae/friend-exchange
                          BODY {
                           'endpoint': http://rhodes.com/antisocial/mr,
                           'requestToken': Alan's Request Token
                          }
```
7. Alan's server looks up the friend record by the requestToken and returns access credentials to Michael's server
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          <------------------------ RESPONSE
                                                    {
                                                      'status': 'ok',
                                                      'accessToken': Alan's AccessToken,
                                                      'publicKey': Alan's public key
                                                    }
```

8. Michael's server saves Alan's accessToken and the publicKey in the pending Friend record and returns status to the client.
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

<------------------------ RESPONSE
                          { 'status':'ok' }
```

### FRIEND ACCEPT
---

1. Alan accepts friend Michael's request by clicking the button in the UI calling the accept-friend endpoint
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                                                    <----------------------- POST
                                                                             http://emtage.com/antisocial/ae/friend-request-accept

                                                                             BODY { 'endpoint': http://rhodes.com/antisocial/mr
                                                                             }
```

2. Alan's server marks the Friend record as 'accepted' and sends a POST request to Michael's server to notify him that his friend request was accepted
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          <------------------------ POST
                                                    http://rhodes.com/antisocial/mr/friend-webhook
                                                    BODY {
                                                      'action': 'friend-request-accepted'
                                                      'accessToken': Michael's access token
                                                    }
```

3.Michael's server marks the Friend record as 'accepted'
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------

                          RESPONSE ---------------->
                          { 'status':'ok' }
```

4. Alan's server returns status to the client.
```
Michael's Browser         Michael's server           Alan's server            Alan's Browser
-----------------         ----------------          ----------------         ----------------


                                                    RESPONSE --------------->
                                                    { 'status':'ok' }
```


Copyright Michael Rhodes. 2017,2018. All Rights Reserved.
This file is licensed under the MIT License.
License text available at https://opensource.org/licenses/MIT
