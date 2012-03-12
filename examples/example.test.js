suite("Test of FilePicker", function(require) {
  var FilePicker = require('./static/js/modules/datepicker')

  test("does something", function() {
    assert.equal(1, 1)
  })

  test("make sure DOM works", function() {
    var el = document.getElementById('example')
    assert.ok(el)
    assert.equal(el.innerHTML, 'YO DAWGZZZ')
  })

  test("does something else", function(done) {
    var xhr = new XMLHttpRequest

    xhr.onreadystatechange = function() {
      if(xhr.readyState === 4)
        got_xhr()
    } 

    xhr.open('GET', window.location.pathname + 'test/endpoint')
    xhr.send(null)

    function got_xhr() {
      assert.equal(JSON.parse(xhr.responseText).test, 13)
      done()
    }
  })

  test("fails", function() {
    assert.equal(0, 1)
  })
})

endpoints({
  'test/endpoint':function(req, resp) {
    resp.writeHead(200, {'Content-Type':'application/json'})
    resp.end(JSON.stringify({
      'test':13
    }))
  } 
})

html('./test.html')
