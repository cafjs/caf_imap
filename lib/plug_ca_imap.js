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
 * Handles all the connections to  imap servers associated to one
 * CA. Caches account information to reduce communication. Provides
 * transactional, durable updates to the set of accounts tracked,
 * recreating connections transparently if needed.
 *
 * The name of this component in a ca.json description should be imap_ca.
 *
 */


var caf = require('caf_core');
var genTransactional = caf.gen_transactional;
var json_rpc = caf.json_rpc;
var async = caf.async;

var addAccountOp = function(alias, properties) {
    return {'op' : 'addAccount', 'alias' : alias, 'properties' : properties};
};

var removeAccountOp = function(alias) {
    return {'op' : 'removeAccount', 'alias' : alias};
};

var notifyChangesOp = function(methodName) {
    return {'op' : 'notifyChanges', 'notifyMethod' : methodName};
};


exports.newInstance = function(context, spec, secrets, cb) {

    var $ = context;

    /*
     * Accounts Type:
     *  {String : {'connection' : <connection>, 'properties' :<properties>,
     *                'boxes' : <boxes>, 'boxesInfo' :<boxesInfo> }}
     *
     * where <properties> is {'username' : string, 'password' : string,
                               'host' : string, 'port' : number,
                               'newMailMethod': string}

     * and <boxes> is {<string> : <box>}
     * and <box> is {'headers' : [<header>], 'msgs' : {'string' : {'raw':
     *  'string', 'parsed': <parsedBody>}}}
     * and <boxesInfo> is [{'name': <string>, 'box' : <string>}]
     *
     *
     * Note that we only checkpoint  {String : {'properties':<properties>}}
     * and the rest is recreated on reload.
     */
    var accounts = {};
    var logActions = [];
    var notifyMethod = spec.env && spec.env.notifyMethod;

    var that = genTransactional.constructor(spec, secrets);

    // methods called by the proxy
    that.notifyChanges = function(methodName) {
        logActions.push(notifyChangesOp(methodName));
    };

    that.removeAccount = function(alias) {
        logActions.push(removeAccountOp(alias));
    };

    that.addAccount = function(alias, properties) {
        logActions.push(addAccountOp(alias, properties));
    };

    that.retryAccount = function(alias) {
        if ((that.isAccountActive(alias)) || (!accounts[alias])) {
            return;
        }
        that.removeAccount(alias);
        if (accounts[alias].properties) {
            that.addAccount(alias, accounts[alias].properties);
        }
    };

    that.isAccountActive = function(alias) {
        var conn = accounts[alias] && accounts[alias].connection;
        return (conn ? true : false);
    };

    that.listAccounts = function() {
        /* we don't list added accounts still in the log because we cannot
         * access their messages before committing*/
        return Object.keys(accounts);
    };

    that.getBoxes = function(alias) {
        return accounts[alias] && accounts[alias].boxes;
    };

    that.getBoxesInfo = function(alias) {
        return accounts[alias] && accounts[alias].boxesInfo;
    };

    that.getBox = function(alias, box) {
        var boxes = that.getBoxes(alias);
        return boxes && boxes[box];
    };

    that.getHeaders = function(alias, box) {
        var localBox = that.getBox(alias, box);
        return localBox && localBox.headers;
    };

    that.getMsgs = function(alias, box) {
        var localBox = that.getBox(alias, box);
        return localBox && localBox.msgs;
    };

    that.getMsgBodyAll = function(alias, box, msgUID) {
        var localBox = that.getBox(alias, box);
        return localBox && localBox.msgs && localBox.msgs[msgUID];
    };

    that.getMsgBody = function(alias, box, msgUID) {
        var msgBodyAll = that.getMsgBodyAll(alias, box, msgUID);
        if (!msgBodyAll) {
            return undefined;
        }
        var result = msgBodyAll.raw;
        if (msgBodyAll.parsed) {
            if (msgBodyAll.parsed.html) {
                result = msgBodyAll.parsed.html;
            } else if (msgBodyAll.parsed.text) {
                result = msgBodyAll.parsed.text;
            }
        }
        return result;
    };

    //Internal methods
    var doNotifyChanges = function() {
        if (notifyMethod && (logActions.length > 0)) {
            var cb0 = function(err, data) {
                if (err) {
                    console.log('doNotifyChanges: Ignoring error:' + err);
                }
            };
            var notifMsg = json_rpc.request(json_rpc.SYSTEM_TOKEN, secrets.myId,
                                            json_rpc.SYSTEM_FROM,
                                            json_rpc.SYSTEM_SESSION_ID,
                                            notifyMethod,
                                            logActions);
            secrets.inqMgr && secrets.inqMgr.process(notifMsg, cb0);
        }
    };

    var replayLog = function(cb0) {
        var cb1 = function(err, data) {
            if (err) {
                cb0(err, data);
            } else {
                doNotifyChanges();
                logActions = [];
                cb0(err, data);
            }
        };
        var iterF = function(action, cb2) {
            switch (action.op) {
            case 'addAccount' :
                var newAccount = {'properties' : action.properties};
                accounts[action.alias] = newAccount;
                $.imap_mux.addAccount(secrets.myId, action.alias, newAccount,
                                      cb2);
                break;
            case 'removeAccount' :
                delete accounts[action.alias];
                $.imap_mux.removeAccount(secrets.myId, action.alias);
                cb2(null);
                break;
            case 'notifyChanges' :
                notifyMethod = action.notifyMethod;
                cb2(null);
                break;
            default:
                cb2('Imap: invalid log action ' + action.op);
            }
        };
        async.forEachSeries(logActions, iterF, cb1);
    };

    var restore = function(targetAccounts) {
      var result = [];
      for (var name in targetAccounts) {
          // just in case of dangling connections
          result.push(removeAccountOp(name));
      }
      for (name in targetAccounts) {
          result.push(addAccountOp(name, targetAccounts[name].properties));
      }
      return result;
    };

    // Framework methods

    /**
     * Initialize state from scratch.
     */
    that.__ca_init__ = function(cb0) {
        accounts = {};
        logActions = [];
        cb0(null);
    };

    /**
     * Initialize state from previous checkpoint.
     */
    that.__ca_resume__ = function(cp, cb0) {
        cp = cp || {};
        accounts = cp.accounts || {};
        notifyMethod = cp.notifyMethod;
        var restoreActions = restore(cp.accounts || {});
        logActions = restoreActions.concat(cp.logActions || []);
        replayLog(cb0);
    };

    /**
     * Called by the framework before calling a handler method to process a
     * message, giving a chance to checkpoint state and versioning information
     * before doing changes. The message (read-only) is passed as an argument
     * to facilitate configuration.
     *
     */
    that.__ca_begin__ = function(msg, cb0) {
        logActions = [];
        cb0(null);
    };

    var dumpAccounts = function() {
        var result = {};
        for (var name in accounts) {
            result[name] = {'properties' : accounts[name].properties};
        }
        return result;
    };

    /**
     * Prepare is called after the handler has succesfully processed a message
     * and returns in the callback a JSON serializable data structure reflecting
     * the new state after that message. Prepare may never be
     * called if an exception is thrown during the processing of the message
     * In that case the framework will call abort to recover the previous
     * state. Also, if we return an error in the callback the transaction will
     * be aborted.
     */
    that.__ca_prepare__ = function(cb0) {
        var dumpState = {
            'accounts' : dumpAccounts(),
            'logActions' : logActions,
            'notifyMethod' : notifyMethod
        };
        cb0(null, JSON.stringify(dumpState));
    };

    /**
     * Commit is called by the framework after it has reliably stored the new
     * checkpoint returned by Prepare in stable storage (e.g., Redis).
     *
     */
    that.__ca_commit__ = function(cb0) {
        replayLog(cb0);
    };

    /**
     * Abort is called by the framework when an exception was thrown during
     * the procesing of the message, or another transactional subcomponent
     * aborted, or we
     * could not checkpoint on stable storage. In that case we should undo
     * all the previous changes. Abort can be called before or after Prepare
     * but never after Commit.
     *
     */
    that.__ca_abort__ = function(cb0) {
        logActions = [];
        cb0(null);
    };


    cb(null, that);

};
