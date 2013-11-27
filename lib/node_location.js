// Need to load jsdom first because of circular dependency
var jsdom = require('jsdom')

var Location = require('jsdom/lib/jsdom/browser/location')
  , URL = require('url')

node_location.prototype = Object.create(Location.prototype, {
    href: {
        configurable: false
      , get: get
      , set: set
    }
})

module.exports = node_location

function node_location(env) {
  if(!(this instanceof node_location)) {
    return new node_location(env)
  }

  Location.call(this, env.window.location.toString(), env.window)
}

function get() {
  return this.toString()
}

function set(val) {
  var oldHash = this._url.hash || ''
    , oldUrl = this._url.href

  this._url = URL.parse(URL.resolve(oldUrl, val))

  if(oldHash !== this._url.hash || '') {
    this._signalHashChange(oldUrl, this._url.href)
  }

  if(this._window.on_location_change) {
    this._window.on_location_change(this)
  }
}