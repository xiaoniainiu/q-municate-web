(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * Main Module
 *
 */

var APP;

// includes
var User = require('./models/user'),
    Session = require('./models/session'),
    Contact = require('./models/contact'),
    FriendList = require('./models/friend_list'),
    UserView = require('./views/user'),
    FriendListView = require('./views/friend_list'),
    Routes = require('./routes'),
    QBApiCalls = require('./qbApiCalls');

function QM() {
  this.models = {
    User: new User(this),
    Session: new Session(this),
    Contact: new Contact(this),
    FriendList: new FriendList(this)
  };

  this.views = {
    User: new UserView(this),
    FriendList: new FriendListView(this)
  };

  this.routes = new Routes(this);
  this.service = new QBApiCalls(this);
}

QM.prototype = {
  init: function() {
    var token;

    this.chromaHash();
    this.setHtml5Patterns();

    // QB SDK initialization
    // Checking if autologin was chosen
    if (localStorage['QM.session'] && localStorage['QM.user'] &&
        // new format of storage data (20.07.2014)
        JSON.parse(localStorage['QM.user']).user_jid) {

      token = JSON.parse(localStorage['QM.session']).token;
      this.service.init(token);

    } else {
      this.service.init();
    }

    this.routes.init();

    if (QMCONFIG.debug) console.log('App init', this);
  },

  chromaHash: function() {
    new ChromaHash({
      visualization: 'bars'
    });
  },

  setHtml5Patterns: function() {
    $('.pattern-name').attr('pattern', QMCONFIG.patterns.name);
    $('.pattern-pass').attr('pattern', QMCONFIG.patterns.password);
  }
};

// Application initialization
$(document).ready(function() {
  APP = new QM;
  APP.init();
});

// FB SDK initialization
window.fbAsyncInit = function() {
  var view = APP.views.User;

  FB.init({
    appId: QMCONFIG.fbAccount.appId,
    version: 'v2.0'
  });
  if (QMCONFIG.debug) console.log('FB init', FB);

  // If you called the getFBStatus function before FB.init
  // Continue it again
  if (sessionStorage['QM.is_getFBStatus']) {
    sessionStorage.removeItem('QM.is_getFBStatus');
    view.getFBStatus();
  }
};

},{"./models/contact":2,"./models/friend_list":3,"./models/session":4,"./models/user":5,"./qbApiCalls":6,"./routes":7,"./views/friend_list":8,"./views/user":9}],2:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * Contact Module
 *
 */

module.exports = Contact;

function Contact(app) {
  this.app = app;
}

Contact.prototype = {

  create: function(qbUser) {
    return {
      id: qbUser.id,
      facebook_id: qbUser.facebook_id,
      full_name: qbUser.full_name,
      email: qbUser.email,
      blob_id: qbUser.blob_id,
      avatar_url: qbUser.avatar_url || getAvatar(qbUser),
      status: qbUser.status || getStatus(qbUser),
      tag: qbUser.tag || qbUser.user_tags,
      user_jid: qbUser.user_jid || QB.chat.helpers.getUserJid(qbUser.id, QMCONFIG.qbAccount.appId)
    };
  }

};

/* Private
---------------------------------------------------------------------- */
function getAvatar(contact) {
  var avatar;

  if (contact.blob_id) {
    try {
      avatar = JSON.parse(contact.custom_data).avatar_url;
    } catch(err) {
      // contact.website - temporary storage of avatar url for mobile apps (14.07.2014)
      avatar = contact.website;
    }
  } else {
    if (contact.facebook_id) {
      avatar = 'https://graph.facebook.com/' + contact.facebook_id + '/picture?width=146&height=146';
    } else {
      avatar = QMCONFIG.defAvatar.url;
    }
  }

  return avatar;
}

function getStatus(contact) {
  var status;
  
  try {
    status = JSON.parse(contact.custom_data).status || null;
  } catch(err) {
    // contact.custom_data - temporary storage of status message for mobile apps (14.07.2014)
    status = contact.custom_data || null;
  }

  return status;
}

},{}],3:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * Friend List Module
 *
 */

module.exports = FriendList;

function FriendList(app) {
  this.app = app;
}

FriendList.prototype = {
  
  globalSearch: function(callback) {
    var val = sessionStorage['QM.search.value'],
        page = sessionStorage['QM.search.page'],
        self = this;
    
    QBApiCalls.getUser({full_name: val, page: page}, function(data) {
      sessionStorage.setItem('QM.search.allPages', Math.ceil(data.total_entries / data.per_page));
      sessionStorage.setItem('QM.search.page', ++page);
      
      self.getContacts(data.items);
      if (QMCONFIG.debug) console.log('Search results', self);

      callback();
    });
  },

  getContacts: function(data) {
    var self = this,
        contact;
    
    self.contacts = [];
    data.forEach(function(item) {
      contact = new Contact(item.user);
      self.contacts.push(contact);
    });
  },

  sendSubscribe: function(jid) {
    var user = JSON.parse(localStorage['QM.user']).contact;
    var extension = {
      full_name: user.full_name,
      avatar_url: user.avatar_url
    };
    QBApiCalls.subscriptionPresence({jid: jid, type: 'subscribe', extension: extension});
  },

  sendReject: function(jid) {
    QBApiCalls.subscriptionPresence({jid: jid, type: 'unsubscribed'});
  }

};

},{}],4:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * Session Module
 *
 */

module.exports = Session;

function Session(app) {
  this.app = app;
  this._remember = false;
}

Session.prototype = {

  create: function(params, isRemember) {
    this.token = params.token;
    this.expirationTime = params.expirationTime || null;
    this.authParams = params.authParams;
    this._remember = isRemember || false;
  },

  update: function(params) {
    var storage, date;

    if (params.token) {
      this.token = params.token;
    } else {
      
      if (params.authParams) {
        this.authParams = params.authParams;
      }
      if (params.date) {
        // set QB session expiration through 2 hours
        date = params.date;
        date.setHours(date.getHours() + 2);
        this.expirationTime = date.toISOString();
      }
      if (this._remember) {
        storage = {
          token: this.token,
          expirationTime: this.expirationTime,
          authParams: this.authParams
        };
        localStorage.setItem('QM.session', JSON.stringify(storage));
      }

    }
  },

  destroy: function() {
    localStorage.removeItem('QM.session');
    this.token = null;
    this.expirationTime = null;
    this.authParams = null;
    this._remember = false;
  },

  // crypto methods for password
  encrypt: function(params) {
    if (params && params.password) {
      params.password = CryptoJS.AES.encrypt(params.password, QMCONFIG.qbAccount.authSecret).toString();
    }
    return params;
  },

  decrypt: function(params) {
    if (params && params.password) {
      params.password = CryptoJS.AES.decrypt(params.password, QMCONFIG.qbAccount.authSecret).toString(CryptoJS.enc.Utf8);
    }
    return params;
  }

};

},{}],5:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * User Module
 *
 */

module.exports = User;

var tempParams;

function User(app) {
  this.app = app;
  this._remember = false;
  this._valid = false;
}

User.prototype = {

  connectFB: function(token) {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        Contact = this.app.models.Contact,
        self = this,
        params;

    UserView.loginQB();
    UserView.createSpinner();

    params = {
      provider: 'facebook',
      keys: {token: token}
    };

    QBApiCalls.createSession(params, function(session) {
      QBApiCalls.getUser(session.user_id, function(user) {
        self.contact = Contact.create(user);

        if (QMCONFIG.debug) console.log('User', self);

        // QBApiCalls.chatConnect(self.contact.xmpp_jid, function() {
        //   self.rememberMe();
        //   UserView.successFormCallback();

        //   // import FB friends
        //   FB.api('/me/friends', function (data) {
        //       console.log(data);
        //     }
        //   );
        // });
      });
    }, true);
  },

  signup: function() {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        Contact = this.app.models.Contact,
        form = $('section:visible form'),
        self = this,
        params;

    if (validate(form, this)) {
      UserView.createSpinner();

      params = {
        full_name: tempParams.full_name,
        email: tempParams.email,
        password: tempParams.password,
        tag_list: 'web'
      };

      QBApiCalls.createSession({}, function() {
        QBApiCalls.createUser(params, function() {
          delete params.full_name;
          delete params.tag_list;

          QBApiCalls.loginUser(params, function(user) {
            self.contact = Contact.create(user);

            if (QMCONFIG.debug) console.log('User', self);

            // QBApiCalls.chatConnect(self.contact.xmpp_jid, function() {
            //   if (tempParams._blob) {
            //     self.uploadAvatar();
            //   } else {
            //     UserView.successFormCallback();
            //   }
            // });
          });
        });
      }, false);
    }
  },

  uploadAvatar: function() {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        custom_data,
        self = this;

    QBApiCalls.createBlob({file: tempParams._blob, 'public': true}, function(blob) {
      self.contact.blob_id = blob.id;
      self.contact.avatar_url = blob.path;

      UserView.successFormCallback();
      
      custom_data = JSON.stringify({avatar_url: blob.path});
      QBApiCalls.updateUser(self.contact.id, {blob_id: blob.id, custom_data: custom_data}, function(res) {
        //if (QMCONFIG.debug) console.log('update of user', res);
      });
    });
  },

  login: function() {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        Contact = this.app.models.Contact,
        form = $('section:visible form'),
        self = this,
        params;

    if (validate(form, this)) {
      UserView.createSpinner();

      params = {
        email: tempParams.email,
        password: tempParams.password
      };

      QBApiCalls.createSession(params, function(session) {
        QBApiCalls.getUser(session.user_id, function(user) {
          self.contact = Contact.create(user);

          if (QMCONFIG.debug) console.log('User', self);

          // QBApiCalls.chatConnect(self.contact.xmpp_jid, function() {
          //   if (self._remember) {
          //     self.rememberMe();
          //   }

          //   UserView.successFormCallback();
          // });

        });
      }, self._remember);
    }
  },

  rememberMe: function() {
    var storage = {},
        self = this;

    Object.keys(self.contact).forEach(function(prop) {
      if (prop !== 'app')
        storage[prop] = self.contact[prop];
    });
    
    localStorage.setItem('QM.user', JSON.stringify(storage));
  },

  forgot: function() {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        form = $('section:visible form'),
        self = this;

    if (validate(form, this)) {
      UserView.createSpinner();

      QBApiCalls.createSession({}, function() {
        QBApiCalls.forgotPassword(tempParams.email, function() {
          UserView.successSendEmailCallback();
          self._valid = false;
        });
      }, false);
    }
  },

  resetPass: function() {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        form = $('section:visible form'),
        self = this;

    if (validate(form, this)) {
      // UserView.createSpinner();
    }
  },

  autologin: function() {
    var QBApiCalls = this.app.service,
        UserView = this.app.views.User,
        Contact = this.app.models.Contact,
        storage = JSON.parse(localStorage['QM.user']),
        self = this;

    UserView.createSpinner();
    this.contact = Contact.create(storage);

    if (QMCONFIG.debug) console.log('User', self);

    // QBApiCalls.chatConnect(self.contact.xmpp_jid, function() {
    //   UserView.successFormCallback();
    // });
  },

  logout: function(callback) {
    var QBApiCalls = this.app.service,
        self = this;

    // QBApiCalls.chatDisconnect();
    QBApiCalls.logoutUser(function() {
      localStorage.removeItem('QM.user');
      self.contact = null;
      self._remember = false;
      self._valid = false;
      callback();
    });
  }

};

/* Private
---------------------------------------------------------------------- */
function validate(form, user) {
  var maxSize = QMCONFIG.maxLimitFile * 1024 * 1024,
      remember = form.find('input:checkbox')[0],
      file = form.find('input:file')[0],
      fieldName, errName,
      value, errMsg;

  tempParams = {};
  form.find('input:not(:file, :checkbox)').each(function() {
    fieldName = this.id.split('-')[1];
    errName = this.placeholder;
    value = this.value.trim();

    if (this.checkValidity()) {

      user._valid = true;
      tempParams[fieldName] = value;

    } else {

      if (this.validity.valueMissing) {
        errMsg = errName + ' is required';
      } else if (this.validity.typeMismatch) {
        errMsg = QMCONFIG.errors.invalidEmail;
      } else if (this.validity.patternMismatch && errName === 'Name') {
        if (value.length < 3)
          errMsg = QMCONFIG.errors.shortName;
        else if (value.length > 50)
          errMsg = QMCONFIG.errors.bigName;
        else
          errMsg = QMCONFIG.errors.invalidName;
      } else if (this.validity.patternMismatch && (errName === 'Password' || errName === 'New password')) {
        if (value.length < 8)
          errMsg = QMCONFIG.errors.shortPass;
        else if (value.length > 40)
          errMsg = QMCONFIG.errors.bigPass;
        else
          errMsg = QMCONFIG.errors.invalidPass;
      }

      fail(user, errMsg);
      $(this).addClass('is-error').focus();

      return false;
    }
  });

  if (user._valid && remember) {
    user._remember = remember.checked;
  }

  if (user._valid && file && file.files[0]) {
    file = file.files[0];

    if (file.type.indexOf('image/') === -1) {
      errMsg = QMCONFIG.errors.avatarType;
      fail(user, errMsg);
    } else if (file.name.length > 100) {
      errMsg = QMCONFIG.errors.fileName;
      fail(user, errMsg);
    } else if (file.size > maxSize) {
      errMsg = QMCONFIG.errors.fileSize;
      fail(user, errMsg);
    } else {
      tempParams._blob = file;
    }
  }

  return user._valid;
}

function fail(user, errMsg) {
  user._valid = false;
  $('section:visible').find('.text_error').addClass('is-error').text(errMsg);
}

},{}],6:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * QuickBlox JS SDK Wrapper
 *
 */

module.exports = QBApiCalls;

var Session, UserView, FriendListView;

function QBApiCalls(app) {
  this.app = app;

  Session = this.app.models.Session;
  UserView = this.app.views.User;
  FriendListView = this.app.views.FriendList;
}

QBApiCalls.prototype = {

  init: function(token) {
    if (typeof token === 'undefined') {
      QB.init(QMCONFIG.qbAccount.appId, QMCONFIG.qbAccount.authKey, QMCONFIG.qbAccount.authSecret);
    } else {
      QB.init(token);

      Session.create(JSON.parse(localStorage['QM.session']), true);
      UserView.autologin();
    }
  },

  checkSession: function(callback) {
    var self = this;

    if ((new Date).toISOString() > Session.expirationTime) {
      // reset QuickBlox JS SDK after autologin via an existing token
      self.init();

      // recovery session
      if (Session.authParams.provider) {
        UserView.getFBStatus(function(token) {
          Session.authParams.keys.token = token;
          self.createSession(Session.authParams, callback, Session._remember);
        });
      } else {
        self.createSession(Session.decrypt(Session.authParams), callback, Session._remember);
      }
      
    } else {
      callback();
    }
  },

  createSession: function(params, callback, isRemember) {
    QB.createSession(params, function(err, res) {
      if (err) {
        if (QMCONFIG.debug) console.log(err.detail);

        var errMsg,
            parseErr = JSON.parse(err.detail);

        if (err.code === 401) {
          errMsg = QMCONFIG.errors.unauthorized;
          $('section:visible input:not(:checkbox)').addClass('is-error');
        } else {
          errMsg = parseErr.errors.email ? parseErr.errors.email[0] :
                   parseErr.errors.base ? parseErr.errors.base[0] : parseErr.errors[0];

          // This checking is needed when your user has exited from Facebook
          // and you try to relogin on a project via FB without reload the page.
          // All you need it is to get the new FB user status and show specific error message
          if (errMsg.indexOf('Authentication') >= 0) {
            errMsg = QMCONFIG.errors.crashFBToken;
            UserView.getFBStatus();
          
          // This checking is needed when you trying to connect via FB
          // and your primary email has already been taken on the project 
          } else if (errMsg.indexOf('already') >= 0) {
            errMsg = QMCONFIG.errors.emailExists;
            UserView.getFBStatus();
          } else {
            errMsg = QMCONFIG.errors.session;
          }
        }

        fail(errMsg);
      } else {
        if (QMCONFIG.debug) console.log('QB SDK: Session is created', res);

        if (Session.token) {
          Session.update({ token: res.token });
        } else {
          Session.create({ token: res.token, authParams: Session.encrypt(params) }, isRemember);
        }

        Session.update({ date: new Date });
        callback(res);
      }
    });
  },

  loginUser: function(params, callback) {
    this.checkSession(function(res) {
      QB.login(params, function(err, res) {
        if (err) {
          if (QMCONFIG.debug) console.log(err.detail);

        } else {
          if (QMCONFIG.debug) console.log('QB SDK: User has logged', res);

          Session.update({ date: new Date, authParams: Session.encrypt(params) });
          callback(res);
        }
      });
    });
  },

  logoutUser: function(callback) {
    if (QMCONFIG.debug) console.log('QB SDK: User has exited');
    // reset QuickBlox JS SDK after autologin via an existing token
    this.init();
    Session.destroy();
    callback();
  },

  forgotPassword: function(email, callback) {
    this.checkSession(function(res) {
      QB.users.resetPassword(email, function(response) {
        if (response.code === 404) {
          if (QMCONFIG.debug) console.log(response.message);

          failForgot();
        } else {
          if (QMCONFIG.debug) console.log('QB SDK: Instructions have been sent');

          Session.destroy();
          callback();
        }
      });
    });
  },

  listUsers: function(params, callback) {
    this.checkSession(function(res) {
      QB.users.listUsers(params, function(err, res) {
        if (err) {
          if (QMCONFIG.debug) console.log(err.detail);

        } else {
          if (QMCONFIG.debug) console.log('QB SDK: Users is found', res);

          Session.update({ date: new Date });
          callback(res);
        }
      });
    });
  },

  getUser: function(params, callback) {
    this.checkSession(function(res) {
      QB.users.get(params, function(err, res) {
        if (err && err.code === 404) {
          if (QMCONFIG.debug) console.log(err.message);

          failSearch();
        } else {
          if (QMCONFIG.debug) console.log('QB SDK: Users is found', res);

          Session.update({ date: new Date });
          callback(res);
        }
      });
    });
  },

  createUser: function(params, callback) {
    this.checkSession(function(res) {
      QB.users.create(params, function(err, res) {
        if (err) {
          if (QMCONFIG.debug) console.log(err.detail);

          var parseErr = JSON.parse(err.detail).errors.email[0];
          failUser(parseErr);
        } else {
          if (QMCONFIG.debug) console.log('QB SDK: User is created', res);

          Session.update({ date: new Date });
          callback(res);
        }
      });
    });
  },

  updateUser: function(id, params, callback) {
    this.checkSession(function(res) {
      QB.users.update(id, params, function(err, res) {
        if (err) {
          if (QMCONFIG.debug) console.log(err.detail);

          var parseErr = JSON.parse(err.detail).errors.email[0];
          failUser(parseErr);
        } else {
          if (QMCONFIG.debug) console.log('QB SDK: User is updated', res);

          Session.update({ date: new Date });
          callback(res);
        }
      });
    });
  },

  createBlob: function(params, callback) {
    this.checkSession(function(res) {
      QB.content.createAndUpload(params, function(err, res) {
        if (err) {
          if (QMCONFIG.debug) console.log(err.detail);

        } else {
          if (QMCONFIG.debug) console.log('QB SDK: Blob is uploaded', res);

          Session.update({ date: new Date });
          callback(res);
        }
      });
    });
  },

  chatConnect: function(jid, callback) {
    this.checkSession(function(res) {
      var password = Session.authParams.provider ? Session.token :
                     Session.decrypt(Session.authParams).password;

      QB.chat.connect({jid: jid, password: password}, function(err, res) {
        if (err) {
          if (QMCONFIG.debug) console.log(err.detail);

        } else {
          callback();
        }
      });
    });
  },

  chatDisconnect: function() {
    QB.chat.disconnect();
  },

  subscriptionPresence: function(params) {
    QB.chat.sendSubscriptionPresence(params);
  }

};

/* Private
---------------------------------------------------------------------- */
var fail = function(errMsg) {
  UserView.removeSpinner();
  $('section:visible').find('.text_error').addClass('is-error').text(errMsg);
};

var failUser = function(err) {
  var errMsg;

  if (err.indexOf('already') >= 0)
    errMsg = QMCONFIG.errors.emailExists;
  else if (err.indexOf('look like') >= 0)
    errMsg = QMCONFIG.errors.invalidEmail;

  $('section:visible input[type="email"]').addClass('is-error');
  fail(errMsg);
};

var failForgot = function() {
  var errMsg = QMCONFIG.errors.notFoundEmail;
  $('section:visible input[type="email"]').addClass('is-error');
  fail(errMsg);
};

var failSearch = function() {
  $('.popup:visible .note').removeClass('is-hidden').siblings('.popup-elem').addClass('is-hidden');
  FriendListView.removeDataSpinner();
};

},{}],7:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * Routes Module
 *
 */

module.exports = Routes;

var UserView, FriendListView;

function Routes(app) {
  this.app = app;
  
  UserView = this.app.views.User,
  FriendListView = this.app.views.FriendList;
}

Routes.prototype = {

  init: function() {

    $(document).on('click', function(event) {
      clickBehaviour(event);
    });

    $('input:file').on('change', function() {
      changeInputFile($(this));
    });

    /* welcome page
    ----------------------------------------------------- */
    $('#signupFB, #loginFB').on('click', function(event) {
      if (QMCONFIG.debug) console.log('connect with FB');
      event.preventDefault();

      // NOTE!! You should use FB.login method instead FB.getLoginStatus
      // and your browser won't block FB Login popup
      FB.login(function(response) {
        if (QMCONFIG.debug) console.log('FB authResponse', response);
        if (response.status === 'connected') {
          UserView.connectFB(response.authResponse.accessToken);
        }
      }, {scope: QMCONFIG.fbAccount.scope});
    });

    $('#signupQB').on('click', function() {
      if (QMCONFIG.debug) console.log('signup with QB');
      UserView.signupQB();
    });

    $('#loginQB').on('click', function(event) {
      if (QMCONFIG.debug) console.log('login wih QB');
      event.preventDefault();
      UserView.loginQB();
    });

    /* signup page
    ----------------------------------------------------- */
    $('#signupForm').on('click', function(event) {
      if (QMCONFIG.debug) console.log('create user');
      event.preventDefault();
      UserView.signupForm();
    });

    /* login page
    ----------------------------------------------------- */
    $('#forgot').on('click', function(event) {
      if (QMCONFIG.debug) console.log('forgot password');
      event.preventDefault();
      UserView.forgot();
    });

    $('#loginForm').on('click', function(event) {
      if (QMCONFIG.debug) console.log('authorize user');
      event.preventDefault();
      UserView.loginForm();
    });

    /* forgot and reset page
    ----------------------------------------------------- */
    $('#forgotForm').on('click', function(event) {
      if (QMCONFIG.debug) console.log('send letter');
      event.preventDefault();
      UserView.forgotForm();
    });

    $('#resetForm').on('click', function(event) {
      if (QMCONFIG.debug) console.log('reset password');
      event.preventDefault();
      UserView.resetForm();
    });

    /* popovers
    ----------------------------------------------------- */
    $('#profile').on('click', function(event) {
      event.preventDefault();
      removePopover();
      UserView.profilePopover($(this));
    });

    $('.list_contextmenu').on('contextmenu', '.contact', function(event) {
      event.preventDefault();
      removePopover();
      UserView.contactPopover($(this));
    });

    /* popups
    ----------------------------------------------------- */
    $('.header-links-item').on('click', '#logout', function(event) {
      event.preventDefault();
      openPopup($('#popupLogout'));
    });

    $('#logoutConfirm').on('click', function() {
      UserView.logout();
    });

    $('.popup-control-button').on('click', function(event) {
      event.preventDefault();
      closePopup();
    });

    $('.search').on('click', function() {
      if (QMCONFIG.debug) console.log('global search');
      FriendListView.globalPopup();
    });

    /* search
    ----------------------------------------------------- */
    $('#globalSearch').on('submit', function(event) {
      event.preventDefault();
      FriendListView.globalSearch($(this));
    });

    $('#searchContacts').on('keyup search submit', function(event) {
      event.preventDefault();
      var type = event.type,
          code = event.keyCode; // code=27 (Esc key), code=13 (Enter key)

      if ((type === 'keyup' && code !== 27 && code !== 13) || (type === 'search')) {
        UserView.localSearch($(this));
      }
    });

    /* subscriptions
    ----------------------------------------------------- */
    $('.list_contacts').on('click', 'button.sent-request', function() {
      FriendListView.sendSubscribeRequest($(this));
    });

    $('.list').on('click', '.request-button_cancel', function() {
      FriendListView.sendSubscribeReject($(this));
    });

    /* QBChat handlers
    ----------------------------------------------------- */
    QB.chat.onSubscribeListener = FriendListView.onSubscribe;

    /* temporary routes
    ----------------------------------------------------- */
    $('.list').on('click', '.contact', function(event) {
      event.preventDefault();
    });

    $('#home, #share, #contacts').on('click', function(event) {
      event.preventDefault();
    });

  }
};

/* Private
---------------------------------------------------------------------- */
// Checking if the target is not an object run popover
function clickBehaviour(e) {
  var objDom = $(e.target);

  if (objDom.is('#profile, #profile *') || e.which === 3) {
    return false;
  } else {
    removePopover();

    if (objDom.is('.popups') && !$('.popup.is-overlay').is('.is-open')) {
      closePopup();
    } else {
      return false;
    }
  }
}

function changeInputFile(objDom) {
  var URL = window.webkitURL || window.URL,
      file = objDom[0].files[0],
      src = file ? URL.createObjectURL(file) : QMCONFIG.defAvatar.url,
      fileName = file ? file.name : QMCONFIG.defAvatar.caption;
  
  objDom.prev().find('img').attr('src', src).siblings('span').text(fileName);
  if (typeof file !== 'undefined') URL.revokeObjectURL(src);
}

function removePopover() {
  $('.is-contextmenu').removeClass('is-contextmenu');
  $('.popover').remove();
}

var openPopup = function(objDom) {
  objDom.add('.popups').addClass('is-overlay');
};

var closePopup = function() {
  $('.is-overlay').removeClass('is-overlay');
};

},{}],8:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * Friend List View Module
 *
 */

module.exports = FriendListView;

function FriendListView(app) {
  this.app = app;
}

FriendListView.prototype = {

  createDataSpinner: function(list) {
    var spinnerBlock = '<div class="popup-elem spinner_bounce">';
    spinnerBlock += '<div class="spinner_bounce-bounce1"></div>';
    spinnerBlock += '<div class="spinner_bounce-bounce2"></div>';
    spinnerBlock += '<div class="spinner_bounce-bounce3"></div>';
    spinnerBlock += '</div>';

    list.after(spinnerBlock);
  },

  removeDataSpinner: function() {
    $('.spinner_bounce').remove();
  },

  globalPopup: function() {
    var popup = $('#popupSearch');

    openPopup(popup);
    popup.find('.popup-elem').addClass('is-hidden').siblings('form').find('input').val('');
    popup.find('.mCSB_container').empty();
  },

  globalSearch: function(form) {
    var self = this,
        popup = form.parent(),
        list = popup.find('ul:first'),
        val = form.find('input[type="search"]').val().trim();

    if (val.length > 0) {
      friendlist = new Friendlist;

      popup.find('.popup-elem').addClass('is-hidden');
      popup.find('.mCSB_container').empty();

      scrollbar(list, self);
      self.createDataSpinner(list);
      $('.spinner_bounce').removeClass('is-hidden').addClass('is-empty');

      sessionStorage.setItem('QM.search.value', val);
      sessionStorage.setItem('QM.search.page', 1);

      friendlist.globalSearch(function() {
        createListResults(list, friendlist, self);
      });
    }
  },

  sendSubscribeRequest: function(objDom) {
    var jid = objDom.data('jid');

    objDom.after('<span class="sent-request l-flexbox">Request Sent</span>');
    objDom.remove();
    friendlist.sendSubscribe(jid);
  },

  sendSubscribeReject: function(objDom) {
    var jid = objDom.parents('.contact').data('jid'),
        list = objDom.parents('ul');

    objDom.parents('li').remove();
    isSectionEmpty(list);
    friendlist = new Friendlist;
    friendlist.sendReject(jid);
  },

  onSubscribe: function(jid) {
    if (QMCONFIG.debug) console.log('Subscribe request from', jid);
    var html = '<li class="list-item">';
    html += '<a class="contact l-flexbox" href="#" data-jid="'+jid+'">';
    html += '<div class="l-flexbox_inline">';
    html += '<img class="contact-avatar avatar" src="images/ava-single.png" alt="user">';
    html += '<span class="name">Test user</span>';
    html += '</div><div class="request-controls l-flexbox">';
    html += '<button class="request-button request-button_cancel">&#10005;</button>';
    html += '<button class="request-button request-button_ok">&#10003;</button>';
    html += '</div></a></li>';

    $('#requestsList').removeClass('is-hidden').find('ul').prepend(html);
  }

};

/* Private
---------------------------------------------------------------------- */
var openPopup = function(objDom) {
  objDom.add('.popups').addClass('is-overlay');
};

function scrollbar(list, self) {
  list.mCustomScrollbar({
    theme: 'minimal-dark',
    scrollInertia: 150,
    callbacks: {
      onTotalScroll: function() {
        ajaxDownloading(list, self);
      },
      alwaysTriggerOffsets: false
    }
  });
}

function createListResults(list, friendlist, self) {
  var item;

  friendlist.contacts.forEach(function(contact) {
    item = '<li class="list-item">';
    item += '<a class="contact l-flexbox" href="#">';
    item += '<div class="l-flexbox_inline">';
    item += '<img class="contact-avatar avatar" src="' + contact.avatar_url + '" alt="user">';
    item += '<span class="name">' + contact.full_name + '</span>';
    item += '</div>';
    item += '<button class="sent-request" data-jid='+contact.xmpp_jid+'><img class="icon-normal" src="images/icon-request.png" alt="request">';
    item += '<img class="icon-active" src="images/icon-request_active.png" alt="request"></button>';
    item += '</a></li>';

    list.find('.mCSB_container').append(item);
    list.removeClass('is-hidden').siblings('.popup-elem').addClass('is-hidden');
  });

  self.removeDataSpinner();
}

// ajax downloading of data through scroll
function ajaxDownloading(list, self) {
  var page = parseInt(sessionStorage['QM.search.page']),
      allPages = parseInt(sessionStorage['QM.search.allPages']);

  if (page <= allPages) {
    self.createDataSpinner(list);
    friendlist.globalSearch(function() {
      createListResults(list, friendlist, self);
    });
  }
}

function isSectionEmpty(list) {
  if (list.contents().length === 0)
    list.parent().addClass('is-hidden');
}

},{}],9:[function(require,module,exports){
/*
 * Q-municate chat application
 *
 * User View Module
 *
 */

module.exports = UserView;

var User,
    FBCallback = null;

function UserView(app) {
  this.app = app;
  User = this.app.models.User;
}

UserView.prototype = {

  signupQB: function() {
    switchPage($('#signUpPage'));
  },

  loginQB: function() {
    switchPage($('#loginPage'));
  },

  forgot: function() {
    switchPage($('#forgotPage'));
  },

  connectFB: function(token) {
    User.connectFB(token);
  },

  signupForm: function() {
    clearErrors();
    User.signup();
  },

  loginForm: function() {
    clearErrors();
    User.login();
  },

  forgotForm: function() {
    clearErrors();
    User.forgot();
  },

  resetForm: function() {
    clearErrors();
    User.resetPass();
  },

  autologin: function() {
    switchPage($('#loginPage'));
    User.autologin();
  },

  createSpinner: function() {
    var spinnerBlock = '<div class="l-spinner"><div class="spinner">';
    spinnerBlock += '<div class="spinner-dot1"></div><div class="spinner-dot2"></div>';
    spinnerBlock += '</div></div>';

    $('section:visible form').addClass('is-hidden').after(spinnerBlock);
  },

  removeSpinner: function() {
    $('section:visible form').removeClass('is-hidden').next('.l-spinner').remove();
  },

  successFormCallback: function() {
    this.removeSpinner();
    $('#profile').find('img').attr('src', User.contact.avatar_url);
    switchPage($('#mainPage'));
  },

  successSendEmailCallback: function() {
    var alert = '<div class="note l-form l-flexbox l-flexbox_column">';
    alert += '<span class="text text_alert text_alert_success">Success!</span>';
    alert += '<span class="text">Please check your email and click on the link in letter in order to reset your password</span>';
    alert += '</div>';

    this.removeSpinner();
    $('section:visible form').addClass('is-hidden').after(alert);
  },

  getFBStatus: function(callback) {
    if (typeof FB === 'undefined') {
      // Wait until FB SDK will be downloaded and then calling this function again
      FBCallback = callback;
      sessionStorage.setItem('QM.is_getFBStatus', true);
      return false;
    } else {
      callback = callback || FBCallback;
      FBCallback = null;

      FB.getLoginStatus(function(response) {
        if (QMCONFIG.debug) console.log('FB status response', response);
        if (callback) {
          // situation when you are recovering QB session via FB
          // and FB accessToken has expired
          if (response.status === 'connected') {
            callback(response.authResponse.accessToken);
          } else {
            FB.login(function(response) {
              if (QMCONFIG.debug) console.log('FB authResponse', response);
              if (response.status === 'connected')
                callback(response.authResponse.accessToken);
            });
          }
        }
      }, true);
    }
  },

  profilePopover: function(objDom) {
    var html = '<ul class="list-actions list-actions_profile popover">';
    // html += '<li class="list-item"><a class="list-actions-action" href="#">Profile</a></li>';
    html += '<li class="list-item"><a id="logout" class="list-actions-action" href="#">Log Out</a></li>';
    html += '</ul>';

    objDom.after(html);
    appearAnimation();
  },

  contactPopover: function(objDom) {
    var html = '<ul class="list-actions list-actions_contacts popover">';
    // html += '<li class="list-item"><a class="list-actions-action" href="#">Video call</a></li>';
    // html += '<li class="list-item"><a class="list-actions-action" href="#">Audio call</a></li>';
    html += '<li class="list-item"><a class="list-actions-action" href="#">Add people</a></li>';
    // html += '<li class="list-item"><a class="list-actions-action" href="#">Profile</a></li>';
    html += '<li class="list-item"><a class="list-actions-action" href="#">Delete contact</a></li>';
    html += '</ul>';

    objDom.after(html).parent().addClass('is-contextmenu');
    appearAnimation();
  },

  logout: function() {
    User.logout(function() {
      switchOnWelcomePage();
      if (QMCONFIG.debug) console.log('current User and Session were destroyed');
    });
  },

  localSearch: function(form) {
    var val = form.find('input[type="search"]').val().trim();
    
    if (val.length > 0) {
      // if (QMCONFIG.debug) console.log('local search =', val);
      $('#searchList').removeClass('is-hidden').siblings('section').addClass('is-hidden');
    } else {
      $('#emptyList').removeClass('is-hidden').siblings('section').addClass('is-hidden');
    }
  }

};

/* Private
---------------------------------------------------------------------- */
var clearErrors = function() {
  $('.is-error').removeClass('is-error');
};

var switchPage = function(page) {
  $('body').removeClass('is-welcome');
  page.removeClass('is-hidden').siblings('section').addClass('is-hidden');

  // reset form
  clearErrors();
  page.find('input').val('');
  if (!page.is('#mainPage')) {
    page.find('form').removeClass('is-hidden').next('.l-form').remove(); // reset Forgot form after success sending of letter
    page.find('input:file').prev().find('img').attr('src', QMCONFIG.defAvatar.url).siblings('span').text(QMCONFIG.defAvatar.caption);
    page.find('input:checkbox').prop('checked', true);
    page.find('input:first').focus();
  }
};

var switchOnWelcomePage = function() {
  $('body').addClass('is-welcome');
  $('#welcomePage').removeClass('is-hidden').siblings('section').addClass('is-hidden');
};

var appearAnimation = function() {
  $('.popover').show(150);
};

},{}]},{},[1])