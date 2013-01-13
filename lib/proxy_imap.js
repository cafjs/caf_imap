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
 * Proxy that enables a CA to access imap mail servers.
 *
 * @name caf_imap/proxy_imap
 * @namespace
 * @augments gen_proxy
 *
 */
var caf = require('caf_core');
var genProxy = caf.gen_proxy;

/*
 * Factory method to create a proxy to an imap aggregation service.
 * 
 */
exports.newInstance = function(context, spec, secrets, cb) {

    var that = genProxy.constructor(spec, secrets);
    var imap = secrets.imap_ca;

    /**
     * Changes the CA method used to notify of changes in the accounts.
     * 
     * The signature of that method should be function(Array.<Object>, caf.cb)
     * with the first argument a log of the changes.
     * 
     * @param {string} methodName The name of the CA notification method.
     * @name caf_imap/proxy_imap#notifyChanges
     * @function 
     */
    that.notifyChanges = function(methodName) {
        imap.notifyChanges(methodName);
    };

    /**
     * Adds an email (imap) account to be tracked.
     * 
     * @param alias {string} A nickname  for this account.
     * @param username {string} The e-mail account login name.
     * @param password {string} A password for the e-mail account.
     * @param host {string} The imap server hostname.
     * @param port {number} The imap server port number.
     * @param newMailMethod {string} A CA method name to be called
     * when a new message arrives. The signature of that method is
     * function(string, number, caf.cb) with the first argument the
     * alias of the account, the second argument the number of new
     * messages, and the last one the callback.
     *   
     * @name caf_imap/proxy_imap#addAccount
     * @function 
     */
    that.addAccount = function(alias, username, password, host, port,
                              newMailMethod) {
        imap.addAccount(alias, {'username' : username, 'password' : password,
                               'host' : host, 'port' : port,
                               'newMailMethod': newMailMethod});
    };

    /**
     * Removes an email (imap) account to be tracked.
     * 
     * @param alias {string} A nickname  for this account.
     *   
     * @name caf_imap/proxy_imap#addAccount
     * @function 
     */
    that.removeAccount = function(alias) {
        return imap.removeAccount(alias);
    };

    /**
     * Tries to reload an email (imap) account to be tracked.
     * 
     * @param alias {string} A nickname  for this account.
     *   
     * @name caf_imap/proxy_imap#retryAccount
     * @function 
     */
    that.retryAccount = function(alias) {
        return imap.retryAccount(alias);
    };

   /**
     * Checks if the given account has been loaded ok.
     * 
     * @param alias {string} A nickname  for this account.
     * @return {boolean} True if the account was loaded ok.
     *   
     * @name caf_imap/proxy_imap#isAccountActive
     * @function 
     */ 
    that.isAccountActive = function(alias) {
        return imap.isAccountActive(alias);
    };

    /**
     * Lists all the active accounts.
     * 
     * @return {Array.<string>} A list of aliases to all the accounts.
     *   
     * @name caf_imap/proxy_imap#listAccounts
     * @function 
     */     
    that.listAccounts = function() {
        return imap.listAccounts();
    };

    /**
     * Gets the imap boxes of an imap account.
     * 
     * The type `box` is  {'headers' : [<header>], 'msgs' : {'string' : {'raw':
     *  'string', 'parsed': <parsedBody>}}}
     * 
     * @param alias {string} A nickname  for this account.
     * @return {Object.<string, box>} The imap boxes for the account.
     *   
     * @name caf_imap/proxy_imap#getBoxes
     * @function 
     */
    that.getBoxes = function(alias) {
        return imap.getBoxes(alias);
    };

    /**
     * Gets info about the imap boxes of an imap account.
     * 
     * @param alias {string} A nickname  for this account.
     * @return {Array.<{name:string, box: string}>} The info about imap
     * boxes for this account. 
     *   
     * @name caf_imap/proxy_imap#getBoxesInfo
     * @function 
     * 
     */
    that.getBoxesInfo = function(alias) {
        return imap.getBoxesInfo(alias);
    };

    /**
     * Gets all the e-mail headers in an imap  box.
     * 
     * The header type is {subject:string, from: string, to: string,
     * date:string, message_id: string, size: number, uid: string,
     * msgno: number, blurb: string, recent:number, flagged:number,
     * answered:number, deleted:number, seen:number, draft:number}
     * 
     * @param alias {string} A nickname  for this account.
     * @param box {string} A name for the imap box.
     * @return {Array.<header>} All the headers in that imap box.
     *   
     * @name caf_imap/proxy_imap#getHeaders
     * @function 
     */
    that.getHeaders = function(alias, box) {
        return imap.getHeaders(alias, box);
    };

    /**
     * Gets   all the e-mail messages in an imap  box.
     *
     *  Type of msgs is  {'string' : {'raw':
     *  'string', 'parsed': <parsedBody>}
     * 
     * @param alias {string} A nickname  for this account.
     * @param box {string} A name for the imap box.
     * @return {msgs} All the messages in that imap box.
     * 
     * @name caf_imap/proxy_imap#getMsgs
     * @function 
     * 
     */
    that.getMsgs = function(alias, box) {
        return imap.getMsgs(alias, box);
    };

    /**
     * Gets the message body of an e-mail.
     *
     * 
     * @param alias {string} A nickname  for this account.
     * @param box {string} A name for the imap box.
     * @param msgUID {string} A message id from the header.
     * @return {string} A message body.
     * 
     * @name caf_imap/proxy_imap#getMsgBody
     * @function 
     * 
     */ 
    that.getMsgBody = function(alias, box, msgUID) {
        return imap.getMsgBody(alias, box, msgUID);
    };

    Object.freeze(that);
    cb(null, that);

};
