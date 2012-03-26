module.exports = Environment

var useragent = require('useragent')

function Environment(uuid, type) {
  this.uuid = uuid
  this.type = type
  this.timeout = null
}

var cons = Environment
  , proto = cons.prototype

Environment.parse_type = function(agent) {
  if(agent === 'node')
    return 'node'

  agent = useragent.parse(agent)

  return [agent.family.toLowerCase(), agent.major+'.'+agent.minor, agent.os.toLowerCase()].join(' / ')
}

proto.toString = function() {
  return '<'+this.uuid+': '+this.type+'>' 
}
