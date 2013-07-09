module.exports = function(driver) {
  driver.on('join', function(env) {
    console.log('JOIN: ', env+'')
  })

  driver.on('drop', function(env) {
    console.log('DROP: ', env+'')
  })

  driver.on('run', function(run, env) {
    console.log('running: ', run.uuid+': '+env+'')
  })

  driver.on('suite', function(run, env, suite) {
    console.log('suite: '+run.uuid+': '+env+' '+suite.name)
  })

  driver.on('result', function(run, env, suite, result) {
    console.log('result: '+run.uuid+': '+env+' '+suite.name, result)
  })

  driver.on('http', function(code, path) {
    if(path.indexOf('_idle') == -1)
      console.log(code+' '+path)
  })

  driver.on('finish', function(run, env) {
    console.log('finish: '+run.uuid+' '+env)
  })
}
