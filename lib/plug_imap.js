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
 * Creates connections to imap servers on behalf of CAs.
 *
 *  The name of this component in framework.json should be imap_mux.
 *
 *
 */
var caf = require('caf_core');
var genPlug = caf.gen_plug;
var json_rpc = caf.json_rpc;
var imap = require('imap');
var async = caf.async;
var helper = require('./plug_imap_helper');


/**
 * Factory method to create an imap service connector.
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var $ = context;

    // Type of all is {<CA Id> : {<accountName> : <accountType>}}
    var all = {};
    var that = genPlug.constructor(spec, secrets);

    var newMail = function(account, id, alias, numMsgs, cb0) {
        var ca;
        async.waterfall([
                            function(cb1) {
                                ca = $.lookup.find(id);
                                if (ca && !ca.isShutdown) {
                                    cb1(null, ca);
                                } else {
                                    cb1('CA not found or shutdown');
                                }
                            },
                            function(ca_ignore, cb1) {
                                helper.newMail(account, numMsgs, cb1);
                            },
                            function(ignore, cb1) {
                                var msg = json_rpc.
                                    request(json_rpc.SYSTEM_TOKEN, id,
                                            json_rpc.SYSTEM_FROM,
                                            json_rpc.SYSTEM_SESSION_ID,
                                            account.properties.
                                            newMailMethod, alias, numMsgs);
                                ca.process(msg, cb1);
                            }
                        ],
                        function(err, data) {
                            cb0(err, data);
                        });
    };

    var removeConnection = function(account) {
        if (account) {
            var conn = account.connection;
            if (conn) {
                delete account.connection;
                conn.removeAllListeners();
                try {
                    conn.logout();
                } catch (err) {
                    // if not connected it throws Error
                    console.log('Ignoring:' + err);
                }
            }
        }
    };

    // methods called by plug_ca_imap

    that.addAccount = function(id, alias, account, cb0) {
        all[id] = all[id] || {};
        all[id][alias] = account;
        var properties = account.properties;
        var conn = account.connection =
            new imap.ImapConnection({ username: properties.username,
                                      password: properties.password,
                                      host: properties.host,
                                      port: properties.port,
                                      secure: true,
                                      debug: true
                                    });
        async.waterfall([
                            function(cb1) {
                                var cb2 = function(err) {
                                    cb1(err, 'ignore');
                                };
                                conn.connect(cb2);
                            },
                            function(ignore, cb1) {
                                helper.loadAccount(account, cb1);
                            }
                        ],
                        function(err, ignore) {
                            if (err) {
                                console.log('Cannot load account:' + alias +
                                            ' for ' + id + ' error:' + err);
                                removeConnection(account);
                                cb0(null, err); // do not propagate as an error
                            } else {
                                conn.on('mail', function(numMsgs) {
                                            var cb2 = function(err, data) {
                                                if (err) {
                                                    console.log('Cannot load' +
                                                                ' new Mail:' +
                                                                err);
                                                    removeConnection(account);
                                                }
                                            };
                                            var current = all[id] &&
                                                all[id][alias] &&
                                                all[id][alias].connection;
                                            if (conn !== current) {
                                                cb2('Connection not current');
                                            } else {
                                                newMail(account, id, alias,
                                                        numMsgs, cb2);
                                            }
                                        });
                                conn.on('close', function(isNetError) {
                                            console.log('Closing imap conn: ' +
                                                        alias + ' for ' + id +
                                                        ' comm error:' +
                                                        isNetError);
                                            removeConnection(account);
                                        });
                                cb0(null);
                            }
                         });
    };

    that.removeAccount = function(id, alias) {
        var oldId = all[id];
        if (oldId) {
            var oldIdAlias = oldId[alias];
            if (oldIdAlias) {
                removeConnection(oldIdAlias);
                delete oldId[alias];
            }
        }
    };

    $.log.debug('New imap plug');
    cb(null, that);
};
