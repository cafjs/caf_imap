# CAF (Cloud Assistant Framework)

Co-design permanent, active, stateful, reliable cloud proxies with your web app.

See http://www.cafjs.com 

## CAF Extra Mail

This repository contains a CAF extra lib to pull e-mail messages from an imap server.

WARNING: This package is an example of how **NOT** to write a plugin for CAF. 

It is clearly doing too much, pulling and storing in memory the contents of every message. 

Instead, a separate service should do most of the work, and use external storage (or DB) to cache the e-mail messages. In that case the CA would be just a lightweight coordination entity, checking for new e-mail in the remote imap servers, and interacting with the back-end service and the client app.



## API

    lib/proxy_imap.js

See the Mail example application.
 
## Configuration Example

### framework.json

       "plugs": [
       {
            "module": "caf_imap/plug",
            "name": "imap_mux",
            "description": "Manages connections to an imap service \n Properties: \n",
            "env": {

            }
        },

### ca.json

    "internal" : [
       {
            "module": "caf_imap/plug_ca",
            "name": "imap_ca",
            "description": "Provides an imap-based service for this CA",
            "env" : {
                "notifyMethod" : "accountsChanged"
            }
        },
        ...
     ]
     "proxies" : [
       {
            "module": "caf_imap/proxy",
            "name": "imap",
            "description": "Provides access to an imap based e-mail service",
            "env" : {

            }
        },
         ...
      ]
  
  The `notifyMethod` property defines the name of the CA method that will be invoked whenever there is a change in any of the email accounts tracked.  
  
    
        
            
 
