/*!
Copyright 2013 Hewlett-Packard Development Company, L.P.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

"use strict";

/**
 * Helper functions to create connections to imap servers
 *
 *
 */
var imap = require('imap');
var caf = require('caf_core');
var async = caf.async;
var util = require('util');
var MailParser = require('mailparser').MailParser;

/*
 * Account Type:
 *   {'connection' : <connection>, 'properties' :<properties>,
 *                'boxes' : <boxes>, 'boxesInfo' :<boxesInfo> }
 *
 * where <properties> is {'username' : string, 'password' : string,
 *                        'host' : string, 'port' : number,
 *                        'newMailMethod': string}
 * and <boxes> is {<string> : <box>}
 * and <box> is {'headers' : [<header>], 'msgs' : {'string' : 'string'}}
 * and <boxesInfo> is [{'name': <string>, 'box' : <string>}]
 *
 *
 */

var setFlags = function(header, flags) {
    header.recent = 0;
    header.flagged = 0;
    header.answered = 0;
    header.deleted = 0;
    header.seen = 0;
    header.draft = 0;
    for (var i = 0; i < flags.length; i++) {
        // todo : simplify with regexp
        switch (flags[i]) {
        case '\\Seen' :
            header.seen = 1;
            break;
        case '\\Flagged' :
            header.flagged = 1;
            break;
        case '\\Answered' :
            header.answered = 1;
            break;
        case '\\Deleted' :
            header.deleted = 1;
            break;
        case '\\Draft' :
            header.draft = 1;
            break;
        case '\\Recent' :
            header.recent = 1;
            break;
        }
    }
};

var extractBlurb = function(msg) {
    if (msg.parsed) {
        if (msg.parsed.text) {
            return msg.parsed.text.slice(0, 32);
        } else if (msg.parsed.html) {
            var regex = /(<([^>]+)>)/ig;
            return msg.parsed.html.replace(regex, '').slice(0, 32);
        }
    }
    return msg.raw.slice(0, 32);
};

var loadHeaders = function(conn, newBox, results, cb) {
    var fetch = conn.fetch(results, {request: {headers: true, body: false}});
    fetch.on('message', function(msg) {
                 console.log('Got message: ' +
                             util.inspect(msg, false, 5));
                 msg.on('end', function() {
                            var header = {};
                            header.subject = msg.headers.subject &&
                                msg.headers.subject[0];
                            header.from = msg.headers.from &&
                                msg.headers.from[0];
                            header.to = msg.headers.to &&
                                msg.headers.to[0];
                            header.date = msg.headers.date &&
                                msg.headers.date[0];
                            header.message_id = msg.headers['message-id'] &&
                                msg.headers['message-id'][0];
                            header.size = newBox.msgs[msg.id].raw.length;
                            header.uid = msg.id;
                            header.msgno = msg.seqno;
                            setFlags(header, msg.flags);
                            header.blurb = extractBlurb(newBox.msgs[msg.id]);
                            newBox.headers.push(header);

                            console.log('Finished message: ' +
                                        util.inspect(msg, false, 5));
                        });
             });

    fetch.on('end', function() {
                 cb(null, newBox);
             });
};


var loadMsgBodies = function(conn, newBox, results, cb) {
    var fetch = conn.fetch(results, {request: {headers: false, body: 'FULL'}});
    fetch.on('message', function(msg) {
                 var msgBodyLst = [];
                 var mailParser = new MailParser();
                 console.log('Got message: ' +
                             util.inspect(msg, false, 5));
                 msg.on('data', function(chunk) {
                            mailParser.write(chunk);
                            msgBodyLst.push(chunk);
                            console.log('Got message chunk of size ' +
                                        chunk.length);
                            console.log(' chunk: ' +
                                        chunk);

                        });
                 msg.on('end', function() {
                            var msgBody = msgBodyLst.join('');
                            newBox.msgs[msg.id] = {raw: msgBody, parsed: null};
                            console.log('Finished message: ' +
                                        util.inspect(msg, false, 5));
                            mailParser.end();
                        });
                 mailParser.on('end', function(bodyObj) {
                                   newBox.msgs[msg.id].parsed = bodyObj;
                               });
             });

    fetch.on('end', function() {
                 cb(null, newBox);
             });
};

var loadBox = function(account, box, cb) {
    var conn = account.connection;
    var newBox = account.boxes[box.name] = {'headers' : [], 'msgs' : {}};
    var queryResults;
    async.waterfall([
                        function(cb0) {
                            conn.openBox(box.name, false, cb0);
                        },
                        function(boxObject, cb0) {
                            // TODO: add # messages info from boxObject
                            conn.search(['ALL'], cb0);
                        },
                        function(results, cb0) {
                            queryResults = results;
                            loadMsgBodies(account.connection, newBox,
                                          queryResults, cb0);
                        },
                        function(ignore, cb0) {
                            loadHeaders(account.connection, newBox,
                                        queryResults, cb0);
                        }
                    ],
                    function(err, results) {
                        cb(err, results);
                    });
};


var parseBoxes = function(account, allBoxes) {
    var result = [];
    var serverName = '{' + account.properties.host + ':' +
        account.properties.port + '}';
    // TODO:no hierarchy, no attribs, just enough for a basic example...
    for (var boxName in allBoxes) {
        result.push({'name' : boxName, 'box': serverName + boxName});
    }
    return result;
};



var loadAccount = exports.loadAccount = function(account, cb) {
    var conn = account.connection;
    if (!conn) {
        debugger;
        cb('No connection');
    }
    account.boxes = {};
    async.waterfall([
                        function(cb0) {
                            conn.getBoxes(cb0);
                        },
                        function(allBoxes, cb0) {
                            account.boxesInfo = parseBoxes(account, allBoxes);
                            var iterF = function(box, cb1) {
                                loadBox(account, box, cb1);
                            };
                            async.map(account.boxesInfo, iterF, cb0);
                        }
                    ],
                    function(err, results) {
                        if (err) {
                            console.log('Error:cannot load account:' + err);
                            cb(err);
                        } else {
                            cb(err, results);
                        }
                    });
};

exports.newMail = function(account, numMsgs, cb) {

    // TODO: Very inefficient, rewrite for incremental update...
    loadAccount(account, cb);

};
