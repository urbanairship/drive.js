suite("test of redirects", function(require) {

  test("test of redirecting...", function(ready) {
    suite.redirects({'/hardcoded/path': 'some/relative/url'})

    $.getJSON('/hardcoded/path', function(data) {
      console.log(data)
      assert.equal(data.hello, "world")
      ready()
    }).error(ready)
  })

  test("test of redirecting twice...", function(ready) {
    suite.redirects({'/hardcoded/path': 'some/other/url'})

    $.getJSON('/hardcoded/path', function(data) {
      console.log(data)
      assert.equal(data.hello, "gary busey")
      ready()
    }).error(ready)
  })
})

endpoints({
    'some/relative/url':function(req, resp) {
      resp.writeHead(200, {'content-type':'application/json'})
      resp.end('{"hello":"world"}')
    }
  , 'some/other/url':function(req, resp) {
      resp.writeHead(200, {'content-type':'application/json'})
      resp.end('{"hello":"gary busey"}')
    }
})
